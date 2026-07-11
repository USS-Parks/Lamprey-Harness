import { type BudgetState, recordSpend, budgetBreachNote } from './orchestration-budget'

// Agentic Orchestration Phase AO-7 — generator + adversarial critic. The blog's
// "a generator paired with an adversarial critic." Generate a draft, have a
// critic try to break it, revise, repeat to a hard iteration cap.
//
// The critic is READ-ONLY BY CONSTRUCTION: the tool-pack runs it via chatOnce
// with no tools, so it cannot mutate anything regardless of what any prompt
// says — the blog's advisory-vs-fact line implemented literally, not asserted.
//
// Pure: generate / critique / revise are injected so the loop, the iteration
// cap, and the per-step budget accounting are unit-tested without a network.

export type CriticVerdict = 'ship' | 'revise'

export interface StepRun {
  output: string
  tokensEst: number
  wallMs: number
}

export interface CritiqueRun {
  verdict: CriticVerdict
  notes: string
  tokensEst: number
  wallMs: number
}

export interface CriticSpec {
  task: string
  /** Hard cap on generate→critique→revise cycles. */
  maxIterations: number
}

export interface CriticDeps {
  generate: (task: string) => Promise<StepRun>
  critique: (task: string, draft: string) => Promise<CritiqueRun>
  revise: (task: string, draft: string, notes: string) => Promise<StepRun>
  budget: BudgetState
}

export interface CriticIteration {
  draft: string
  verdict: CriticVerdict
  notes: string
}

export interface CriticResult {
  finalOutput: string
  iterations: number
  finalVerdict: CriticVerdict
  history: CriticIteration[]
  budget: BudgetState
  breached: boolean
  breachNote?: string
}

export async function runCritic(spec: CriticSpec, deps: CriticDeps): Promise<CriticResult> {
  const maxIterations = Math.max(1, Math.floor(spec.maxIterations))
  let budget = deps.budget
  const history: CriticIteration[] = []

  const first = await deps.generate(spec.task)
  budget = recordSpend(budget, first.tokensEst, first.wallMs)
  let draft = first.output
  let finalVerdict: CriticVerdict = 'revise'

  for (let i = 0; i < maxIterations; i++) {
    if (budget.breached) break
    const c = await deps.critique(spec.task, draft)
    budget = recordSpend(budget, c.tokensEst, c.wallMs)
    finalVerdict = c.verdict
    history.push({ draft, verdict: c.verdict, notes: c.notes })
    if (c.verdict === 'ship') break
    if (budget.breached) break
    if (i === maxIterations - 1) break // no revise after the last critique
    const revised = await deps.revise(spec.task, draft, c.notes)
    budget = recordSpend(budget, revised.tokensEst, revised.wallMs)
    draft = revised.output
  }

  return {
    finalOutput: draft,
    iterations: history.length,
    finalVerdict,
    history,
    budget,
    breached: budget.breached,
    breachNote: budget.breached ? budgetBreachNote(budget) : undefined
  }
}
