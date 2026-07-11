import { describe, it, expect, vi } from 'vitest'
import { runCritic } from './strategy-critic'
import { createBudget } from './orchestration-budget'

// AO-7 — generator + adversarial critic.

const unbounded = () => createBudget({ tokens: 0, wallMs: 0 })

describe('runCritic', () => {
  it('stops early when the critic ships', async () => {
    const generate = vi.fn(async () => ({ output: 'draft-0', tokensEst: 10, wallMs: 5 }))
    const critique = vi.fn(async () => ({
      verdict: 'ship' as const,
      notes: 'good',
      tokensEst: 5,
      wallMs: 2
    }))
    const revise = vi.fn()
    const res = await runCritic(
      { task: 't', maxIterations: 3 },
      { generate, critique, revise, budget: unbounded() }
    )
    expect(res.finalVerdict).toBe('ship')
    expect(res.iterations).toBe(1)
    expect(revise).not.toHaveBeenCalled()
    expect(res.finalOutput).toBe('draft-0')
  })

  it('revise consumes the critic notes and the draft advances', async () => {
    const generate = vi.fn(async () => ({ output: 'draft-0', tokensEst: 10, wallMs: 5 }))
    let round = 0
    const critique = vi.fn(async () =>
      round++ === 0
        ? { verdict: 'revise' as const, notes: 'fix the bug', tokensEst: 5, wallMs: 2 }
        : { verdict: 'ship' as const, notes: 'ok now', tokensEst: 5, wallMs: 2 }
    )
    const revise = vi.fn(async (_t, _draft, notes) => ({
      output: `revised for: ${notes}`,
      tokensEst: 8,
      wallMs: 4
    }))
    const res = await runCritic(
      { task: 't', maxIterations: 3 },
      { generate, critique, revise, budget: unbounded() }
    )
    expect(revise).toHaveBeenCalledWith('t', 'draft-0', 'fix the bug')
    expect(res.finalOutput).toBe('revised for: fix the bug')
    expect(res.finalVerdict).toBe('ship')
  })

  it('respects the hard iteration cap (no infinite revise loop)', async () => {
    const generate = vi.fn(async () => ({ output: 'd', tokensEst: 1, wallMs: 1 }))
    const critique = vi.fn(async () => ({
      verdict: 'revise' as const,
      notes: 'more',
      tokensEst: 1,
      wallMs: 1
    }))
    const revise = vi.fn(async () => ({ output: 'd2', tokensEst: 1, wallMs: 1 }))
    const res = await runCritic(
      { task: 't', maxIterations: 2 },
      { generate, critique, revise, budget: unbounded() }
    )
    expect(res.iterations).toBe(2)
    expect(critique).toHaveBeenCalledTimes(2)
    // No revise after the final critique.
    expect(revise).toHaveBeenCalledTimes(1)
  })

  it('budget breach stops the loop and reports honestly', async () => {
    const generate = vi.fn(async () => ({ output: 'd', tokensEst: 600, wallMs: 1 }))
    const critique = vi.fn(async () => ({
      verdict: 'revise' as const,
      notes: 'x',
      tokensEst: 600,
      wallMs: 1
    }))
    const revise = vi.fn(async () => ({ output: 'd2', tokensEst: 600, wallMs: 1 }))
    const res = await runCritic(
      { task: 't', maxIterations: 5 },
      { generate, critique, revise, budget: createBudget({ tokens: 1000, wallMs: 0 }) }
    )
    // generate (600) ok; first critique pushes to 1200 > 1000 → breach; loop stops.
    expect(res.breached).toBe(true)
    expect(res.breachNote).toMatch(/token budget exceeded/)
    expect(revise).not.toHaveBeenCalled()
  })

  it('records per-step budget spend (generator + each critique/revise)', async () => {
    const generate = vi.fn(async () => ({ output: 'd', tokensEst: 100, wallMs: 10 }))
    let round = 0
    const critique = vi.fn(async () =>
      round++ === 0
        ? { verdict: 'revise' as const, notes: 'n', tokensEst: 50, wallMs: 5 }
        : { verdict: 'ship' as const, notes: 'ok', tokensEst: 50, wallMs: 5 }
    )
    const revise = vi.fn(async () => ({ output: 'd2', tokensEst: 70, wallMs: 7 }))
    const res = await runCritic(
      { task: 't', maxIterations: 3 },
      { generate, critique, revise, budget: unbounded() }
    )
    // 100 (gen) + 50 (crit1) + 70 (revise) + 50 (crit2) = 270
    expect(res.budget.tokensSpent).toBe(270)
    expect(res.budget.wallMsSpent).toBe(27)
  })
})
