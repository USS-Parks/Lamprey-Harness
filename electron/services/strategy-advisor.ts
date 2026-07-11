import { type BudgetState, recordSpend, budgetBreachNote } from './orchestration-budget'

// Agentic Orchestration Phase AO-8 — advisor escalation. The blog's "an advisor
// pattern where a stuck agent calls a smarter model for help." A running agent
// (or the main turn) escalates ONE bounded question plus a context excerpt to a
// configured advisor model; the answer returns as a tool result and the spend
// is receipted onto the caller's identity.
//
// Manual-only by default (decision 2): the advisor is invoked when the model
// decides it is stuck; there is no auto-offer-after-N-failures machinery in this
// phase (deferred — no setting added for a feature not built).
//
// Pure: the provider call is injected so the one-shot bound + budget accounting
// are unit-tested without a network.

export interface AdvisorSpec {
  question: string
  context: string
  advisorModel: string
}

export interface AdvisorAskRun {
  output: string
  tokensEst: number
  wallMs: number
}

export interface AdvisorDeps {
  ask: (model: string, prompt: string) => Promise<AdvisorAskRun>
  budget: BudgetState
}

export interface AdvisorResult {
  /** The advisor's answer, or null when no advisor is configured. */
  answer: string | null
  /** False ⇒ orchAdvisorModel is unset; the tool reports this honestly. */
  configured: boolean
  tokensEst: number
  wallMs: number
  budget: BudgetState
  breached: boolean
  breachNote?: string
}

export function buildAdvisorPrompt(question: string, context: string): string {
  const parts = [
    'A less-capable agent is stuck and is escalating to you for help. Give a direct, ' +
      'actionable answer to its question — the specific insight or approach it is missing.',
    `Question:\n${question.trim()}`
  ]
  if (context.trim()) parts.push(`Context:\n${context.trim()}`)
  return parts.join('\n\n')
}

export async function runAdvisor(spec: AdvisorSpec, deps: AdvisorDeps): Promise<AdvisorResult> {
  if (!spec.advisorModel.trim()) {
    return {
      answer: null,
      configured: false,
      tokensEst: 0,
      wallMs: 0,
      budget: deps.budget,
      breached: false
    }
  }
  const prompt = buildAdvisorPrompt(spec.question, spec.context)
  const r = await deps.ask(spec.advisorModel, prompt)
  const budget = recordSpend(deps.budget, r.tokensEst, r.wallMs)
  return {
    answer: r.output,
    configured: true,
    tokensEst: r.tokensEst,
    wallMs: r.wallMs,
    budget,
    breached: budget.breached,
    breachNote: budget.breached ? budgetBreachNote(budget) : undefined
  }
}
