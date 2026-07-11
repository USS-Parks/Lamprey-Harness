// Agentic Orchestration Phase AO-4 — the budget meter, enforced OUTSIDE the
// model. The blog's "outcome and a budget" only governs if the budget is a fact
// the model can't argue with: tokens, wall-clock (active time), candidates, and
// depth are accounted here and breach aborts the whole fork tree. Token
// estimation reuses the JM-12 real-chars method (chars/4) supplied by the
// caller; this module only accumulates and decides.
//
// Pure and mutation-free at the type level: every operation returns a new
// BudgetState so a tree can branch accounting without shared-mutable surprises.

export interface BudgetCeilings {
  /** 0 = this cap disabled (the LP-7 0-disables convention). */
  tokens: number
  /** Active wall-clock ms across all forks in the tree. 0 = disabled. */
  wallMs: number
}

export interface BudgetState {
  ceilings: BudgetCeilings
  tokensSpent: number
  wallMsSpent: number
  breached: boolean
  breachReason: string | null
}

/**
 * Resolve the effective ceilings for a run. A per-call override may only
 * TIGHTEN a cap, never raise it above the settings ceiling — a call can ask for
 * less budget but cannot grant itself more. An override of 0 is treated as
 * "no override" (not "unbounded"), since 0 already means disabled at the base.
 */
export function resolveBudgetCeilings(
  base: BudgetCeilings,
  override?: Partial<BudgetCeilings>
): BudgetCeilings {
  const tighten = (baseCap: number, ov: number | undefined): number => {
    if (ov === undefined || ov <= 0) return baseCap
    if (baseCap <= 0) return ov // base unbounded → the override becomes the cap
    return Math.min(baseCap, ov)
  }
  return {
    tokens: tighten(base.tokens, override?.tokens),
    wallMs: tighten(base.wallMs, override?.wallMs)
  }
}

export function createBudget(ceilings: BudgetCeilings): BudgetState {
  return {
    ceilings: { ...ceilings },
    tokensSpent: 0,
    wallMsSpent: 0,
    breached: false,
    breachReason: null
  }
}

function detectBreach(
  ceilings: BudgetCeilings,
  tokensSpent: number,
  wallMsSpent: number
): string | null {
  if (ceilings.tokens > 0 && tokensSpent > ceilings.tokens) {
    return `token budget exceeded: ${tokensSpent} > ${ceilings.tokens}`
  }
  if (ceilings.wallMs > 0 && wallMsSpent > ceilings.wallMs) {
    return `wall-clock budget exceeded: ${wallMsSpent}ms > ${ceilings.wallMs}ms`
  }
  return null
}

/**
 * Accumulate one fork's spend into the budget. Returns the new state; once
 * breached it stays breached (further spend still accrues for an honest final
 * receipt, but the caller aborts the tree on the first breach).
 */
export function recordSpend(state: BudgetState, tokens: number, wallMs: number): BudgetState {
  const tokensSpent = state.tokensSpent + Math.max(0, Math.round(tokens))
  const wallMsSpent = state.wallMsSpent + Math.max(0, Math.round(wallMs))
  const reason = detectBreach(state.ceilings, tokensSpent, wallMsSpent)
  return {
    ceilings: state.ceilings,
    tokensSpent,
    wallMsSpent,
    breached: state.breached || reason !== null,
    breachReason: state.breachReason ?? reason
  }
}

/** Would recording `tokens` more push the budget over? A cheap pre-flight so a
 *  caller can decline a candidate before spending on it. */
export function wouldBreach(state: BudgetState, tokens: number): boolean {
  return (
    detectBreach(
      state.ceilings,
      state.tokensSpent + Math.max(0, Math.round(tokens)),
      state.wallMsSpent
    ) !== null
  )
}

/** Honest breach note text — persisted as a role:'system' message so the user
 *  sees why the run stopped and what the ceiling was. */
export function budgetBreachNote(state: BudgetState): string {
  const reason = state.breachReason ?? 'budget exceeded'
  return (
    `Orchestrated run stopped: ${reason}. ` +
    `Spent ${state.tokensSpent} tokens / ${Math.round(state.wallMsSpent / 1000)}s of active time. ` +
    `Raise the ceilings in Settings → Orchestration, or scope the task smaller.`
  )
}

export type ReceiptOutcome = 'done' | 'error' | 'aborted'

export interface RunReceipt {
  runId: string
  identityId: string | null
  tokensEst: number
  wallMs: number
  outcome: ReceiptOutcome
  toolCallsCount: number
}

export function buildRunReceipt(args: RunReceipt): RunReceipt {
  return {
    runId: args.runId,
    identityId: args.identityId,
    tokensEst: Math.max(0, Math.round(args.tokensEst)),
    wallMs: Math.max(0, Math.round(args.wallMs)),
    outcome: args.outcome,
    toolCallsCount: Math.max(0, Math.round(args.toolCallsCount))
  }
}

/** Depth guard for the fork tree — the identity/budget layer's answer to the
 *  blog's "agents calling agents". 0 = unbounded. */
export function depthExceeded(depth: number, maxDepth: number): boolean {
  return maxDepth > 0 && depth > maxDepth
}

/** Candidate-count clamp for fan-out. 0 = unbounded. */
export function clampCandidates(requested: number, maxCandidates: number): number {
  const n = Math.max(1, Math.floor(requested))
  if (maxCandidates <= 0) return n
  return Math.min(n, maxCandidates)
}
