import { chatOnce } from './providers/registry'
import { toolRegistry } from './tool-registry'
import { readOrchestrationConfig } from './orchestration-config'
import { governFork, settleRunSpend } from './orchestration-governance'
import { createBudget, resolveBudgetCeilings } from './orchestration-budget'
import { runFanout, FANOUT_JUDGE_SCHEMA, type CandidateResult } from './strategy-fanout'
import { approximateTokenCount } from './multi-agent-run-tool'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// Agentic Orchestration Phase AO-6 — the agent_fanout model tool. Registered
// here like any pack, but stripped from the model's dispatch array when the
// master toggle is off (electron/ipc/chat.ts + orchestration-tools.ts), so it
// only reaches the model when orchestration is enabled.

function budgetForRun(): ReturnType<typeof createBudget> {
  const cfg = readOrchestrationConfig()
  return createBudget(
    resolveBudgetCeilings({ tokens: cfg.maxTokensPerRun, wallMs: cfg.maxWallclockMs })
  )
}

async function runCandidate(
  task: string,
  modelId: string,
  signal: AbortSignal
): Promise<{ output: string; tokensEst: number; wallMs: number }> {
  const startedAt = Date.now()
  const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: task }]
  const r = await chatOnce(messages, modelId, signal)
  return {
    output: r.content,
    tokensEst: approximateTokenCount(task) + approximateTokenCount(r.content),
    wallMs: Math.max(0, Date.now() - startedAt)
  }
}

function buildJudgePrompt(task: string, candidates: CandidateResult[], rubric: string): string {
  const lines = [
    `You are judging ${candidates.length} candidate answers to a task. Pick the single best.`,
    rubric.trim()
      ? `Rubric:\n${rubric.trim()}`
      : 'Judge by correctness, completeness, and clarity.',
    `Task:\n${task}`,
    ''
  ]
  for (const c of candidates) {
    lines.push(`--- Candidate index ${c.index} (model ${c.modelId}) ---`)
    lines.push(c.output)
    lines.push('')
  }
  lines.push(
    'Respond with ONLY a JSON object: {"winnerIndex": <index of the best candidate>, ' +
      '"rationale": "<one sentence why>"}. No prose, no markdown.'
  )
  return lines.join('\n')
}

async function runJudge(
  task: string,
  candidates: CandidateResult[],
  rubric: string,
  judgeModel: string,
  signal: AbortSignal
): Promise<{
  judgment: { winnerIndex: number; rationale: string }
  tokensEst: number
  wallMs: number
}> {
  const startedAt = Date.now()
  const prompt = buildJudgePrompt(task, candidates, rubric)
  const r = await chatOnce([{ role: 'user', content: prompt }], judgeModel, signal)
  const tokensEst = approximateTokenCount(prompt) + approximateTokenCount(r.content)
  const wallMs = Math.max(0, Date.now() - startedAt)
  const validIndexes = new Set(candidates.map((c) => c.index))
  let winnerIndex = candidates[0].index
  let rationale = 'judge output unparseable — defaulted to the first candidate'
  try {
    const match = r.content.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { winnerIndex?: unknown; rationale?: unknown }
      if (typeof parsed.winnerIndex === 'number' && validIndexes.has(parsed.winnerIndex)) {
        winnerIndex = parsed.winnerIndex
      }
      if (typeof parsed.rationale === 'string' && parsed.rationale.trim()) {
        rationale = parsed.rationale.trim()
      }
    }
  } catch {
    /* keep the defaults */
  }
  return { judgment: { winnerIndex, rationale }, tokensEst, wallMs }
}

toolRegistry.registerNative(
  {
    id: 'agent_fanout',
    name: 'agent_fanout',
    title: 'Fan-out + judge',
    description:
      'Generate N candidate answers to a task (optionally each from a different model), then ' +
      'judge them against a rubric and return the winner. Use when the solution space is wide ' +
      'and one attempt is risky — competing candidates plus a judge beat a single pass. ' +
      'Candidates and the judge are budgeted; N is capped by the Orchestration settings. ' +
      'Only available when Orchestration is enabled.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task each candidate answers.' },
        candidateModels: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Model ids for the candidates (diversity comes from different models). ' +
            'Omit to use the active model. Capped by the max-candidates setting.'
        },
        rubric: {
          type: 'string',
          description: 'Optional judging criteria. Defaults to correctness/completeness/clarity.'
        }
      },
      required: ['task'],
      additionalProperties: false
    },
    risks: ['network', 'read'],
    requiresApproval: false,
    enabled: true
  },
  async (rawArgs, ctx) => {
    if (!readOrchestrationConfig().enabled) {
      throw new Error('agent_fanout requires Orchestration to be enabled in Settings.')
    }
    if (!ctx.model) throw new Error('agent_fanout: active model unavailable (internal error).')
    const args = (rawArgs ?? {}) as { task?: unknown; candidateModels?: unknown; rubric?: unknown }
    const task = typeof args.task === 'string' ? args.task.trim() : ''
    if (!task) throw new Error('agent_fanout: "task" is required.')
    const cfg = readOrchestrationConfig()
    const requested = Array.isArray(args.candidateModels)
      ? (args.candidateModels as unknown[]).filter((m): m is string => typeof m === 'string')
      : []
    // Default: the active model twice (a cheap generate-and-compare) — real
    // diversity comes from the caller passing distinct candidateModels.
    const candidateModels =
      requested.length > 0
        ? requested
        : [ctx.model, ctx.model].slice(0, Math.max(1, cfg.maxCandidates))
    const rubric = typeof args.rubric === 'string' ? args.rubric : ''
    const signal = ctx.signal ?? new AbortController().signal

    const { identityId } = governFork({
      conversationId: ctx.conversationId ?? null,
      scopeKind: 'conversation',
      agentType: 'agent_fanout',
      requestedTools: [],
      floor: new Set<string>(),
      label: `agent_fanout (${candidateModels.length} candidates)`
    })

    const result = await runFanout(
      { task, candidateModels, rubric, maxCandidates: cfg.maxCandidates },
      {
        budget: budgetForRun(),
        runCandidate: (t, m) => runCandidate(t, m, signal),
        runJudge: (t, c, rb) => runJudge(t, c, rb, ctx.model!, signal)
      }
    )

    settleRunSpend(identityId, result.budget.tokensSpent, result.budget.wallMsSpent)

    const summary = {
      strategy: 'fanout',
      candidates: result.candidates.map((c) => ({
        index: c.index,
        modelId: c.modelId,
        tokensEst: c.tokensEst,
        wallMs: c.wallMs,
        error: c.error
      })),
      judgment: result.judgment,
      winner: result.winner
        ? {
            index: result.winner.index,
            modelId: result.winner.modelId,
            output: result.winner.output
          }
        : null,
      breached: result.breached,
      breachNote: result.breachNote
    }
    return {
      result: JSON.stringify(summary, null, 2),
      status: result.breached ? 'error' : result.winner ? 'done' : 'error'
    }
  }
)
