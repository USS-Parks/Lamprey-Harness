import {
  type BudgetState,
  recordSpend,
  budgetBreachNote,
  clampCandidates
} from './orchestration-budget'

// Agentic Orchestration Phase AO-6 — fan-out + judge. The blog's "multiple
// agents competing on the same problem … fan out wide, judge the candidates,
// then iterate on the winner." Structure encodes search, not business process.
//
// Pure: the provider calls are injected (runCandidate / runJudge) so the whole
// strategy — candidate loop, budget accounting, breach-before-judge, winner
// selection — is unit-tested without a network. The tool-pack (AO-6 wiring)
// supplies real chatOnce candidates and a schema-forced judge.
//
// ponytail: candidates run SEQUENTIALLY so budget breach aborts mid-fan-out
// deterministically (the AO-4 semantics). A local layer values the hard budget
// stop over fan-out latency; parallelize behind a flag if throughput matters.

export interface CandidateResult {
  index: number
  modelId: string
  output: string
  tokensEst: number
  wallMs: number
  error?: string
}

export interface Judgment {
  winnerIndex: number
  rationale: string
}

export interface FanoutSpec {
  task: string
  /** One entry per candidate (already the caller's chosen models). Clamped to
   *  `maxCandidates` here. */
  candidateModels: string[]
  rubric?: string
  maxCandidates: number
}

export interface CandidateRun {
  output: string
  tokensEst: number
  wallMs: number
  error?: string
}

export interface JudgeRun {
  judgment: Judgment
  tokensEst: number
  wallMs: number
}

export interface FanoutDeps {
  runCandidate: (task: string, modelId: string, index: number) => Promise<CandidateRun>
  runJudge: (task: string, candidates: CandidateResult[], rubric: string) => Promise<JudgeRun>
  budget: BudgetState
}

export interface FanoutResult {
  candidates: CandidateResult[]
  judgment: Judgment | null
  winner: CandidateResult | null
  budget: BudgetState
  breached: boolean
  breachNote?: string
}

export async function runFanout(spec: FanoutSpec, deps: FanoutDeps): Promise<FanoutResult> {
  const n = clampCandidates(spec.candidateModels.length, spec.maxCandidates)
  const models = spec.candidateModels.slice(0, n)
  const candidates: CandidateResult[] = []
  let budget = deps.budget

  for (let i = 0; i < models.length; i++) {
    if (budget.breached) break
    const modelId = models[i]
    try {
      const r = await deps.runCandidate(spec.task, modelId, i)
      candidates.push({
        index: i,
        modelId,
        output: r.output,
        tokensEst: r.tokensEst,
        wallMs: r.wallMs,
        error: r.error
      })
      budget = recordSpend(budget, r.tokensEst, r.wallMs)
    } catch (err) {
      candidates.push({
        index: i,
        modelId,
        output: '',
        tokensEst: 0,
        wallMs: 0,
        error: (err as Error).message
      })
    }
  }

  if (budget.breached) {
    return {
      candidates,
      judgment: null,
      winner: null,
      budget,
      breached: true,
      breachNote: budgetBreachNote(budget)
    }
  }

  // Judge only the candidates that produced usable output.
  const usable = candidates.filter((c) => !c.error && c.output.trim().length > 0)
  if (usable.length === 0) {
    return { candidates, judgment: null, winner: null, budget, breached: false }
  }
  if (usable.length === 1) {
    // No contest — the single usable candidate wins without paying for a judge.
    return {
      candidates,
      judgment: { winnerIndex: usable[0].index, rationale: 'only one usable candidate' },
      winner: usable[0],
      budget,
      breached: false
    }
  }

  const judged = await deps.runJudge(spec.task, usable, spec.rubric ?? '')
  budget = recordSpend(budget, judged.tokensEst, judged.wallMs)
  const winner = candidates.find((c) => c.index === judged.judgment.winnerIndex) ?? usable[0]
  return {
    candidates,
    judgment: judged.judgment,
    winner,
    budget,
    breached: budget.breached,
    breachNote: budget.breached ? budgetBreachNote(budget) : undefined
  }
}

/** The JSON schema the judge fork is forced to return (reuses the forkAgent
 *  schema seam). Kept here so the tool-pack and tests share one definition. */
export const FANOUT_JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    winnerIndex: { type: 'integer' },
    rationale: { type: 'string' }
  },
  required: ['winnerIndex', 'rationale'],
  additionalProperties: false
} as const
