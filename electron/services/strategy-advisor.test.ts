import { describe, it, expect, vi } from 'vitest'
import { runAdvisor, buildAdvisorPrompt } from './strategy-advisor'
import { createBudget } from './orchestration-budget'

// AO-8 — advisor escalation (one-shot).

const unbounded = () => createBudget({ tokens: 0, wallMs: 0 })

describe('runAdvisor', () => {
  it('returns configured:false and NEVER calls the model when no advisor is set', async () => {
    const ask = vi.fn()
    const res = await runAdvisor(
      { question: 'why is this failing?', context: 'tried X', advisorModel: '' },
      { ask, budget: unbounded() }
    )
    expect(res.configured).toBe(false)
    expect(res.answer).toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks the configured advisor once and receipts the spend', async () => {
    const ask = vi.fn(async (_model: string, _prompt: string) => ({
      output: 'try approach Y',
      tokensEst: 120,
      wallMs: 40
    }))
    const res = await runAdvisor(
      { question: 'q', context: 'c', advisorModel: 'claude-opus-4-8' },
      { ask, budget: unbounded() }
    )
    expect(ask).toHaveBeenCalledOnce()
    expect(ask.mock.calls[0][0]).toBe('claude-opus-4-8')
    expect(res.answer).toBe('try approach Y')
    expect(res.configured).toBe(true)
    expect(res.budget.tokensSpent).toBe(120)
  })

  it('the advisor prompt frames a stuck agent escalating', () => {
    const p = buildAdvisorPrompt('how do I parse this?', 'my parser loops forever')
    expect(p).toMatch(/stuck/i)
    expect(p).toMatch(/how do I parse this\?/)
    expect(p).toMatch(/my parser loops forever/)
  })

  it('omits the context block when no context is supplied', () => {
    const p = buildAdvisorPrompt('q', '   ')
    expect(p).not.toMatch(/Context:/)
  })

  it('a breaching advisor call reports honestly', async () => {
    const ask = vi.fn(async () => ({ output: 'long answer', tokensEst: 5000, wallMs: 10 }))
    const res = await runAdvisor(
      { question: 'q', context: '', advisorModel: 'm' },
      { ask, budget: createBudget({ tokens: 1000, wallMs: 0 }) }
    )
    expect(res.breached).toBe(true)
    expect(res.breachNote).toMatch(/token budget exceeded/)
  })
})
