// Workspace World Model Phase (WM-8) — the goal ledger.
//
// unmet(g, workspace) for Lamprey: extracted subtasks become goals in the
// existing GA goals store (visible, editable, cancellable in Plans & goals;
// completion evidence in the store's own column), while the machine-
// checkable predicates live in a per-conversation ledger here. Predicates
// are per-turn working state — a fresh mutating turn re-extracts — so they
// need no schema change; the GA rows are the durable record.
//
// Evaluation is deterministic: file predicates check the live workspace
// directly; command predicates run through an injected runner (WM-9 wires
// the verify-workspace path, the same no-approval precedent verify_workspace
// already established, with the dangerous-command inspection as a gate).

import { existsSync, readFileSync, statSync } from 'fs'
import { resolvePathWithinWorkspace } from './apply-patch-tool'
import { inspectShellCommand } from './dangerous-command-policy'
import type { ExtractedSubtask, GoalPredicate } from './goal-extraction'
import {
  createGoal,
  listGoals,
  transitionGoal,
  type Goal
} from './plan-goal-store'

export interface LedgerEntry {
  goalId: string
  title: string
  targets: string[]
  predicates: GoalPredicate[]
}

export interface PredicateResult {
  predicate: GoalPredicate
  met: boolean
  detail: string
}

export interface GoalEvaluation {
  goalId: string
  title: string
  met: boolean
  results: PredicateResult[]
}

/** exitCode null means the command could not run (or was refused). */
export type CommandRunner = (command: string) => Promise<{ ok: boolean; detail: string }>

const ledgers = new Map<string, LedgerEntry[]>()

const MAX_COMMAND_PREDICATES_PER_EVALUATION = 3

function ledgerFor(conversationId: string): LedgerEntry[] {
  let l = ledgers.get(conversationId)
  if (!l) {
    l = []
    ledgers.set(conversationId, l)
  }
  return l
}

function predicateSummary(predicates: GoalPredicate[]): string {
  if (predicates.length === 0) return ''
  const parts = predicates.map((p) => {
    switch (p.kind) {
      case 'file-exists':
        return `${p.path} exists`
      case 'file-absent':
        return `${p.path} absent`
      case 'file-contains':
        return `${p.path} contains "${p.needle.slice(0, 40)}"`
      case 'file-not-contains':
        return `${p.path} lacks "${p.needle.slice(0, 40)}"`
      case 'command-succeeds':
        return `\`${p.command.slice(0, 60)}\` succeeds`
    }
  })
  return `Checks: ${parts.join('; ')}`
}

/**
 * Record extracted subtasks as ledger entries + GA goals. An open ledger
 * goal with the same title in this conversation is reused, not duplicated.
 */
export function recordExtractedGoals(
  conversationId: string,
  subtasks: ExtractedSubtask[]
): LedgerEntry[] {
  const ledger = ledgerFor(conversationId)
  const entries: LedgerEntry[] = []
  const existingGoals = listGoals(conversationId)
  for (const subtask of subtasks) {
    const priorLedger = ledger.find((e) => e.title === subtask.title)
    const priorGoal = priorLedger
      ? existingGoals.find(
          (g) =>
            g.id === priorLedger.goalId &&
            g.lifecycleStatus !== 'completed' &&
            g.lifecycleStatus !== 'aborted'
        )
      : undefined
    if (priorLedger && priorGoal) {
      priorLedger.predicates = subtask.predicates
      priorLedger.targets = subtask.targets
      entries.push(priorLedger)
      continue
    }
    let goal: Goal
    try {
      goal = createGoal(conversationId, {
        title: subtask.title,
        description: predicateSummary(subtask.predicates) || undefined,
        actor: 'system'
      })
    } catch {
      continue // a goal-store failure never blocks the turn
    }
    const entry: LedgerEntry = {
      goalId: goal.id,
      title: subtask.title,
      targets: subtask.targets,
      predicates: subtask.predicates
    }
    ledger.push(entry)
    entries.push(entry)
  }
  return entries
}

export function getLedger(conversationId: string): LedgerEntry[] {
  return [...(ledgers.get(conversationId) ?? [])]
}

/**
 * Entries that still have anything to check. Completed and aborted goals
 * are done; BLOCKED goals are also excluded — a blocked ledger goal means
 * follow-through already gave up on it this conversation, and it must not
 * resurrect on later settles or turns unless the user resumes it in
 * Plans & goals (which flips the lifecycle back to active).
 */
export function getOpenLedgerEntries(conversationId: string): LedgerEntry[] {
  const goals = new Map(listGoals(conversationId).map((g) => [g.id, g]))
  return getLedger(conversationId).filter((e) => {
    const g = goals.get(e.goalId)
    return (
      g !== undefined &&
      g.lifecycleStatus !== 'completed' &&
      g.lifecycleStatus !== 'aborted' &&
      g.lifecycleStatus !== 'blocked'
    )
  })
}

function evaluateFilePredicate(
  predicate: Exclude<GoalPredicate, { kind: 'command-succeeds' }>,
  workspaceRoot: string
): PredicateResult {
  const abs = resolvePathWithinWorkspace(workspaceRoot, predicate.path)
  if (!abs) {
    return { predicate, met: false, detail: `path "${predicate.path}" is outside the workspace` }
  }
  const exists = existsSync(abs)
  if (predicate.kind === 'file-exists') {
    return { predicate, met: exists, detail: exists ? 'file exists' : 'file missing' }
  }
  if (predicate.kind === 'file-absent') {
    return { predicate, met: !exists, detail: exists ? 'file still present' : 'file absent' }
  }
  if (!exists) return { predicate, met: predicate.kind === 'file-not-contains', detail: 'file missing' }
  let content: string
  try {
    if (!statSync(abs).isFile()) return { predicate, met: false, detail: 'not a regular file' }
    content = readFileSync(abs, 'utf8')
  } catch (err) {
    return {
      predicate,
      met: false,
      detail: `unreadable: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  const has = content.includes(predicate.needle)
  if (predicate.kind === 'file-contains') {
    return { predicate, met: has, detail: has ? 'needle found' : 'needle not found' }
  }
  return { predicate, met: !has, detail: has ? 'needle still present' : 'needle gone' }
}

/**
 * Evaluate every open ledger entry. Command predicates run through the
 * injected runner, capped per evaluation, and only when the dangerous-
 * command inspection does not flag them; a refused command counts as
 * unmet with the refusal named.
 */
export async function evaluateLedger(
  conversationId: string,
  workspaceRoot: string,
  runCommand: CommandRunner
): Promise<GoalEvaluation[]> {
  const evaluations: GoalEvaluation[] = []
  let commandsRun = 0
  for (const entry of getOpenLedgerEntries(conversationId)) {
    const results: PredicateResult[] = []
    for (const predicate of entry.predicates) {
      if (predicate.kind === 'command-succeeds') {
        if (commandsRun >= MAX_COMMAND_PREDICATES_PER_EVALUATION) {
          results.push({ predicate, met: false, detail: 'command budget for this evaluation spent' })
          continue
        }
        const inspection = inspectShellCommand(predicate.command)
        if (inspection.verdict === 'dangerous') {
          results.push({
            predicate,
            met: false,
            detail: `refused to run: ${inspection.reason}`
          })
          continue
        }
        commandsRun++
        try {
          const r = await runCommand(predicate.command)
          results.push({ predicate, met: r.ok, detail: r.detail })
        } catch (err) {
          results.push({
            predicate,
            met: false,
            detail: `runner failed: ${err instanceof Error ? err.message : String(err)}`
          })
        }
        continue
      }
      results.push(evaluateFilePredicate(predicate, workspaceRoot))
    }
    evaluations.push({
      goalId: entry.goalId,
      title: entry.title,
      met: results.length > 0 && results.every((r) => r.met),
      results
    })
  }
  return evaluations
}

function evidence(evaluation: GoalEvaluation): string {
  return evaluation.results
    .map((r) => `${r.met ? 'met' : 'UNMET'}: ${describePredicate(r.predicate)} (${r.detail})`)
    .join('; ')
    .slice(0, 1000)
}

function describePredicate(p: GoalPredicate): string {
  return p.kind === 'command-succeeds' ? `${p.kind} ${p.command}` : `${p.kind} ${p.path}`
}

/**
 * Record evaluation outcomes on the GA goals: met goals complete with the
 * evidence in the store's completion column; unmet goals stay open. A
 * final settle (rounds exhausted / blocker) records the unmet evidence as
 * the goal's blocker so Plans & goals shows why it stopped.
 */
export function recordEvaluationOutcomes(
  conversationId: string,
  evaluations: GoalEvaluation[],
  opts: { final: boolean }
): void {
  for (const evaluation of evaluations) {
    try {
      if (evaluation.met) {
        transitionGoal(conversationId, {
          goalId: evaluation.goalId,
          action: 'complete',
          actor: 'system',
          reason: 'world-model predicates met',
          completion: evidence(evaluation)
        })
      } else if (opts.final) {
        transitionGoal(conversationId, {
          goalId: evaluation.goalId,
          action: 'block',
          actor: 'system',
          reason: 'follow-through exhausted with unmet predicates',
          blocker: evidence(evaluation) || 'unmet predicates'
        })
      }
    } catch {
      // Goal lifecycle failures never block the turn.
    }
  }
}

/** Drop ledger state for a conversation (call on delete). */
export function clearGoalLedger(conversationId: string): void {
  ledgers.delete(conversationId)
}

/** Test-only reset. */
export function __resetGoalLedgerForTesting(): void {
  ledgers.clear()
}
