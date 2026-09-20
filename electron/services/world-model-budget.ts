// Workspace World Model Phase (WM-6) — per-turn intervention budget.
//
// GAVEL bounds LLM re-planning with the budget T; Lamprey bounds world-model
// interventions (verdicts returned + repairs applied) per turn the same way.
// On exhaustion the gate downgrades for the REST OF THE TURN — dispatch
// passes through untouched (FC-10 pattern) so a model thrashing against the
// gate cannot loop forever inside one turn. `beginWorldModelTurn` is the
// ONLY reset; recordIntervention only increments, so exhaustion cannot
// re-arm mid-turn (locked by world-model-safety.test.ts).

interface TurnBudgetState {
  interventions: number
  downgraded: boolean
  followThroughRounds: number
}

const turnState = new Map<string, TurnBudgetState>()

function stateFor(conversationId: string): TurnBudgetState {
  let s = turnState.get(conversationId)
  if (!s) {
    s = { interventions: 0, downgraded: false, followThroughRounds: 0 }
    turnState.set(conversationId, s)
  }
  return s
}

/** Reset the per-turn counters. Called from runHeadlessTurn at turn start. */
export function beginWorldModelTurn(conversationId: string): void {
  turnState.set(conversationId, { interventions: 0, downgraded: false, followThroughRounds: 0 })
}

/**
 * WM-9 — count one follow-through continuation round. Returns the new
 * count. Like interventions, only beginWorldModelTurn resets it, so an
 * exhausted follow-through cannot re-arm within a turn.
 */
export function recordFollowThroughRound(conversationId: string): number {
  const s = stateFor(conversationId)
  s.followThroughRounds++
  return s.followThroughRounds
}

export function getFollowThroughRounds(conversationId: string): number {
  return turnState.get(conversationId)?.followThroughRounds ?? 0
}

/** True when this turn's gate has downgraded — dispatch passes through. */
export function isWorldModelTurnDowngraded(conversationId: string): boolean {
  return turnState.get(conversationId)?.downgraded === true
}

/**
 * Record one intervention (a verdict returned or a repair applied) against
 * the budget. Returns true when this intervention CROSSED the threshold —
 * the caller emits the downgrade event exactly once.
 */
export function recordWorldModelIntervention(conversationId: string, budget: number): boolean {
  const s = stateFor(conversationId)
  s.interventions++
  if (!s.downgraded && budget > 0 && s.interventions >= budget) {
    s.downgraded = true
    return true
  }
  return false
}

export function getWorldModelInterventions(conversationId: string): number {
  return turnState.get(conversationId)?.interventions ?? 0
}

/** Drop budget state for a conversation (call on delete). */
export function clearWorldModelBudget(conversationId: string): void {
  turnState.delete(conversationId)
}

/** Test-only reset. */
export function __resetWorldModelBudgetForTesting(): void {
  turnState.clear()
}
