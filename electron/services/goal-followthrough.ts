// Workspace World Model Phase (WM-9) — follow-through.
//
// GAVEL keeps working until unmet(g) = ∅ or the budget is spent; Lamprey's
// turn does the same. At the final-answer boundary in runChatRound, when
// the conversation's goal ledger has open entries, the predicates are
// evaluated deterministically. Unmet goals with rounds remaining turn into
// a structured continuation (the JM-10 corrective-round shape: system row
// for the transcript, user-role complaint for the model, recurse). On
// exhaustion the turn settles HONESTLY: met goals complete, unmet goals
// get blocked with evidence, and a system row names what is left. The
// model's reply is never rewritten (Unburdening contract).

import { executeShellCommand } from './shell-tool'
import {
  evaluateLedger,
  getOpenLedgerEntries,
  recordEvaluationOutcomes,
  type CommandRunner,
  type GoalEvaluation
} from './goal-ledger'
import { recordFollowThroughRound } from './world-model-budget'
import { recordEvent } from './event-log'

export interface FollowThroughOutcome {
  /** True when the turn should run another round with `complaint`. */
  continue: boolean
  /** The user-role continuation message (set when continue). */
  complaint?: string
  /** Transcript system-row body (set when anything noteworthy happened). */
  systemNote?: string
  evaluations: GoalEvaluation[]
}

const COMMAND_TIMEOUT_MS = 120_000
const COMPLAINT_RESULT_CAP = 6

/** Production command runner: sandboxed one-shot shell, exit 0 = ok. */
export function makeShellCommandRunner(
  workspaceRoot: string,
  conversationId: string
): CommandRunner {
  return async (command: string) => {
    const r = await executeShellCommand(
      { command, timeout_ms: COMMAND_TIMEOUT_MS },
      workspaceRoot,
      conversationId
    )
    const ok = r.error === undefined && !r.timedOut && r.exitCode === 0
    const detail = r.timedOut
      ? 'timed out'
      : r.error !== undefined
        ? `failed to run: ${r.error}`
        : `exit ${r.exitCode}`
    return { ok, detail }
  }
}

export function buildUnmetComplaint(evaluations: GoalEvaluation[]): string {
  const unmet = evaluations.filter((e) => !e.met)
  const lines: string[] = [
    'Goal check: the following extracted goals are NOT met yet. Continue working — ',
    'fix what the evidence shows, then re-verify. Do not just restate the plan.'
  ]
  for (const e of unmet) {
    lines.push(`\nGoal: ${e.title}`)
    for (const r of e.results.filter((x) => !x.met).slice(0, COMPLAINT_RESULT_CAP)) {
      const subject =
        r.predicate.kind === 'command-succeeds' ? r.predicate.command : r.predicate.path
      lines.push(`- UNMET ${r.predicate.kind} ${subject}: ${r.detail}`)
    }
  }
  return lines.join('\n')
}

export function buildUnmetSystemNote(
  evaluations: GoalEvaluation[],
  roundsUsed: number
): string {
  const unmet = evaluations.filter((e) => !e.met)
  return (
    `Follow-through ended after ${roundsUsed} round(s) with ${unmet.length} goal(s) ` +
    `unmet: ${unmet.map((e) => e.title).join('; ').slice(0, 400)}. ` +
    'The goals stay visible in Plans & goals with the unmet evidence.'
  )
}

export interface FollowThroughInput {
  conversationId: string
  workspaceRoot: string
  maxRounds: number
  /** True when the turn cannot recurse again (tool-round cap adjacency). */
  atRoundCap: boolean
  correlationId?: string
  runner?: CommandRunner
}

/**
 * Decide whether the settling turn continues. Never throws — a defect here
 * settles the turn normally.
 */
export async function runFollowThroughCheck(
  input: FollowThroughInput
): Promise<FollowThroughOutcome> {
  const none: FollowThroughOutcome = { continue: false, evaluations: [] }
  try {
    const open = getOpenLedgerEntries(input.conversationId)
    if (open.length === 0) return none

    const runner =
      input.runner ?? makeShellCommandRunner(input.workspaceRoot, input.conversationId)
    const evaluations = await evaluateLedger(input.conversationId, input.workspaceRoot, runner)
    if (evaluations.length === 0) return none

    const allMet = evaluations.every((e) => e.met)
    if (allMet) {
      recordEvaluationOutcomes(input.conversationId, evaluations, { final: false })
      emitFollowThroughEvent(input, 'met', evaluations, 0)
      return { continue: false, evaluations }
    }

    const roundsUsed = recordFollowThroughRound(input.conversationId)
    const exhausted = roundsUsed > input.maxRounds || input.atRoundCap
    if (exhausted) {
      recordEvaluationOutcomes(input.conversationId, evaluations, { final: true })
      emitFollowThroughEvent(input, 'exhausted', evaluations, roundsUsed)
      return {
        continue: false,
        evaluations,
        systemNote: buildUnmetSystemNote(evaluations, roundsUsed - 1)
      }
    }

    // Met goals settle now; unmet ones drive the continuation.
    recordEvaluationOutcomes(input.conversationId, evaluations, { final: false })
    emitFollowThroughEvent(input, 'continue', evaluations, roundsUsed)
    return {
      continue: true,
      evaluations,
      complaint: buildUnmetComplaint(evaluations),
      systemNote:
        `Follow-through round ${roundsUsed}/${input.maxRounds}: ` +
        `${evaluations.filter((e) => !e.met).length} goal(s) unmet — continuing.`
    }
  } catch (err) {
    console.error('[goal-followthrough] check failed; settling normally:', err)
    return none
  }
}

function emitFollowThroughEvent(
  input: FollowThroughInput,
  phase: 'met' | 'continue' | 'exhausted',
  evaluations: GoalEvaluation[],
  round: number
): void {
  try {
    recordEvent({
      type: 'world_model.followthrough',
      actorKind: 'system',
      severity: phase === 'exhausted' ? 'warning' : 'info',
      conversationId: input.conversationId,
      correlationId: input.correlationId,
      payload: {
        phase,
        round,
        goals: evaluations.length,
        unmet: evaluations.filter((e) => !e.met).length
      }
    })
  } catch {
    // Audit failures never fail follow-through.
  }
}
