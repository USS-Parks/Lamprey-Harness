import { describe, it, expect } from 'vitest'
import {
  resolveBudgetCeilings,
  createBudget,
  recordSpend,
  wouldBreach,
  budgetBreachNote,
  buildRunReceipt,
  depthExceeded,
  clampCandidates
} from './orchestration-budget'

// AO-4 — the budget meter. These tests are the phase's "outcome and a budget"
// guarantee: budget is a fact enforced outside the model.

describe('resolveBudgetCeilings — overrides tighten, never raise', () => {
  const base = { tokens: 100_000, wallMs: 60_000 }

  it('an override below the base tightens the cap', () => {
    expect(resolveBudgetCeilings(base, { tokens: 40_000 })).toEqual({
      tokens: 40_000,
      wallMs: 60_000
    })
  })

  it('an override above the base is clamped to the base (no self-granted budget)', () => {
    expect(resolveBudgetCeilings(base, { tokens: 999_999 }).tokens).toBe(100_000)
  })

  it('an override of 0 is ignored (0 = disabled at base, not "unbounded here")', () => {
    expect(resolveBudgetCeilings(base, { tokens: 0 }).tokens).toBe(100_000)
  })

  it('an unbounded base (0) adopts the override as the cap', () => {
    expect(resolveBudgetCeilings({ tokens: 0, wallMs: 0 }, { tokens: 5_000 }).tokens).toBe(5_000)
  })
})

describe('recordSpend + breach detection', () => {
  it('breach aborts mid-tree: the fork that crosses the ceiling flips breached', () => {
    let b = createBudget({ tokens: 3_000, wallMs: 0 })
    b = recordSpend(b, 1_000, 500) // fork 1
    expect(b.breached).toBe(false)
    b = recordSpend(b, 1_500, 500) // fork 2 — total 2500, still under
    expect(b.breached).toBe(false)
    b = recordSpend(b, 1_000, 500) // fork 3 — total 3500 > 3000
    expect(b.breached).toBe(true)
    expect(b.breachReason).toMatch(/token budget exceeded: 3500 > 3000/)
  })

  it('receipts sum to the parent accounting', () => {
    const forks = [
      { tokens: 800, wall: 200 },
      { tokens: 1200, wall: 400 },
      { tokens: 500, wall: 100 }
    ]
    let b = createBudget({ tokens: 0, wallMs: 0 }) // unbounded — just accounting
    for (const f of forks) b = recordSpend(b, f.tokens, f.wall)
    expect(b.tokensSpent).toBe(2500)
    expect(b.wallMsSpent).toBe(700)
    expect(b.breached).toBe(false)
  })

  it('0-disables: a token ceiling of 0 never breaches on tokens', () => {
    let b = createBudget({ tokens: 0, wallMs: 1_000 })
    b = recordSpend(b, 10_000_000, 200)
    expect(b.breached).toBe(false)
  })

  it('wall-clock breach fires on active-time accumulation', () => {
    let b = createBudget({ tokens: 0, wallMs: 1_000 })
    b = recordSpend(b, 0, 600)
    b = recordSpend(b, 0, 600) // total 1200 > 1000
    expect(b.breached).toBe(true)
    expect(b.breachReason).toMatch(/wall-clock budget exceeded/)
  })

  it('wouldBreach is a pre-flight that does not mutate', () => {
    const b = createBudget({ tokens: 1_000, wallMs: 0 })
    expect(wouldBreach(b, 2_000)).toBe(true)
    expect(wouldBreach(b, 500)).toBe(false)
    expect(b.tokensSpent).toBe(0)
  })

  it('the breach note is honest about the ceiling and the spend', () => {
    let b = createBudget({ tokens: 100, wallMs: 0 })
    b = recordSpend(b, 250, 4000)
    const note = budgetBreachNote(b)
    expect(note).toMatch(/token budget exceeded: 250 > 100/)
    expect(note).toMatch(/250 tokens/)
    expect(note).toMatch(/Settings . Orchestration/)
  })
})

describe('receipts + depth + candidate clamps', () => {
  it('buildRunReceipt rounds + clamps to non-negative ints', () => {
    const r = buildRunReceipt({
      runId: 'r1',
      identityId: 'i1',
      tokensEst: 123.7,
      wallMs: -5,
      outcome: 'done',
      toolCallsCount: 2.4
    })
    expect(r).toEqual({
      runId: 'r1',
      identityId: 'i1',
      tokensEst: 124,
      wallMs: 0,
      outcome: 'done',
      toolCallsCount: 2
    })
  })

  it('depthExceeded respects 0 = unbounded', () => {
    expect(depthExceeded(3, 2)).toBe(true)
    expect(depthExceeded(2, 2)).toBe(false)
    expect(depthExceeded(99, 0)).toBe(false)
  })

  it('clampCandidates caps N and floors at 1', () => {
    expect(clampCandidates(10, 4)).toBe(4)
    expect(clampCandidates(3, 4)).toBe(3)
    expect(clampCandidates(0, 4)).toBe(1)
    expect(clampCandidates(10, 0)).toBe(10) // 0 = unbounded
  })
})
