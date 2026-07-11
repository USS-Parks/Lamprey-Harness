import { chatOnce } from './providers/registry'
import { toolRegistry } from './tool-registry'
import { readOrchestrationConfig } from './orchestration-config'
import { governFork, settleRunSpend } from './orchestration-governance'
import { createBudget, resolveBudgetCeilings } from './orchestration-budget'
import { runFanout, FANOUT_JUDGE_SCHEMA, type CandidateResult } from './strategy-fanout'
import { runCritic, type CriticVerdict } from './strategy-critic'
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

// ── AO-7 — agent_critique: generator + adversarial critic ──────────────────

async function oneShot(
  prompt: string,
  modelId: string,
  signal: AbortSignal
): Promise<{ output: string; tokensEst: number; wallMs: number }> {
  const startedAt = Date.now()
  const r = await chatOnce([{ role: 'user', content: prompt }], modelId, signal)
  return {
    output: r.content,
    tokensEst: approximateTokenCount(prompt) + approximateTokenCount(r.content),
    wallMs: Math.max(0, Date.now() - startedAt)
  }
}

function parseCritique(text: string): { verdict: CriticVerdict; notes: string } {
  const trimmed = text.trim()
  // Verdict is the first token; SHIP ends the loop, anything else revises.
  const verdict: CriticVerdict = /^\s*ship\b/i.test(trimmed) ? 'ship' : 'revise'
  const notes = trimmed.replace(/^\s*(ship|revise)\b[:.\-\s]*/i, '').trim()
  return { verdict, notes: notes || trimmed }
}

toolRegistry.registerNative(
  {
    id: 'agent_critique',
    name: 'agent_critique',
    title: 'Generator + adversarial critic',
    description:
      'Draft an answer, have an adversarial critic try to break it, revise, and repeat to a ' +
      'hard iteration cap. Use when a first pass is likely flawed and a skeptical second pass ' +
      'improves it. The critic is read-only by construction (it runs with no tools). Budgeted; ' +
      'iterations bounded by the Orchestration settings. Only available when Orchestration is ' +
      'enabled.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task to draft and refine.' },
        maxIterations: {
          type: 'integer',
          description: 'Max generate→critique→revise cycles. Defaults to 3, capped internally.'
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
      throw new Error('agent_critique requires Orchestration to be enabled in Settings.')
    }
    if (!ctx.model) throw new Error('agent_critique: active model unavailable (internal error).')
    const args = (rawArgs ?? {}) as { task?: unknown; maxIterations?: unknown }
    const task = typeof args.task === 'string' ? args.task.trim() : ''
    if (!task) throw new Error('agent_critique: "task" is required.')
    const maxIterations =
      typeof args.maxIterations === 'number' && args.maxIterations > 0
        ? Math.min(6, Math.floor(args.maxIterations))
        : 3
    const model = ctx.model
    const signal = ctx.signal ?? new AbortController().signal

    const { identityId } = governFork({
      conversationId: ctx.conversationId ?? null,
      scopeKind: 'conversation',
      agentType: 'agent_critique',
      requestedTools: [],
      floor: new Set<string>(), // critic + generator are tool-less by construction
      label: 'agent_critique'
    })

    const result = await runCritic(
      { task, maxIterations },
      {
        budget: budgetForRun(),
        generate: (t) => oneShot(`Complete this task as well as you can:\n\n${t}`, model, signal),
        critique: async (t, draft) => {
          const prompt =
            `You are an adversarial critic. Try to find real flaws in the draft answer below ` +
            `for the task. Reply with "SHIP" on the first line if it is genuinely good enough, ` +
            `otherwise "REVISE" followed by the specific problems to fix.\n\nTask:\n${t}\n\nDraft:\n${draft}`
          const r = await oneShot(prompt, model, signal)
          const { verdict, notes } = parseCritique(r.output)
          return { verdict, notes, tokensEst: r.tokensEst, wallMs: r.wallMs }
        },
        revise: (t, draft, notes) =>
          oneShot(
            `Revise the draft to fix the critic's problems. Return only the improved answer.\n\n` +
              `Task:\n${t}\n\nDraft:\n${draft}\n\nProblems to fix:\n${notes}`,
            model,
            signal
          )
      }
    )

    settleRunSpend(identityId, result.budget.tokensSpent, result.budget.wallMsSpent)

    const summary = {
      strategy: 'critic',
      iterations: result.iterations,
      finalVerdict: result.finalVerdict,
      finalOutput: result.finalOutput,
      breached: result.breached,
      breachNote: result.breachNote
    }
    return {
      result: JSON.stringify(summary, null, 2),
      status: result.breached ? 'error' : 'done'
    }
  }
)
