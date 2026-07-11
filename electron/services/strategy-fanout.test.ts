import { describe, it, expect, vi } from 'vitest'
import { runFanout, FANOUT_JUDGE_SCHEMA } from './strategy-fanout'
import { createBudget } from './orchestration-budget'

// AO-6 — fan-out + judge. The strategy encodes search: generate candidates,
// judge, pick the winner — under a hard budget.

const unbounded = () => createBudget({ tokens: 0, wallMs: 0 })

describe('runFanout', () => {
  it('runs candidates, judges, and returns the judged winner', async () => {
    const runCandidate = vi.fn(async (_t, modelId, index) => ({
      output: `answer from ${modelId}`,
      tokensEst: 100,
      wallMs: 50,
      index
    }))
    const runJudge = vi.fn(async () => ({
      judgment: { winnerIndex: 1, rationale: 'candidate 1 was clearer' },
      tokensEst: 40,
      wallMs: 20
    }))
    const res = await runFanout(
      { task: 'do X', candidateModels: ['m1', 'm2'], maxCandidates: 4 },
      { budget: unbounded(), runCandidate, runJudge }
    )
    expect(runCandidate).toHaveBeenCalledTimes(2)
    expect(runJudge).toHaveBeenCalledOnce()
    expect(res.winner?.index).toBe(1)
    expect(res.winner?.modelId).toBe('m2')
    expect(res.judgment?.rationale).toMatch(/clearer/)
    expect(res.breached).toBe(false)
    expect(res.budget.tokensSpent).toBe(240) // 100 + 100 + 40 (judge)
  })

  it('caps N by maxCandidates', async () => {
    const runCandidate = vi.fn(async (_t, m) => ({ output: `x ${m}`, tokensEst: 1, wallMs: 1 }))
    const runJudge = vi.fn(async () => ({
      judgment: { winnerIndex: 0, rationale: 'r' },
      tokensEst: 1,
      wallMs: 1
    }))
    await runFanout(
      { task: 't', candidateModels: ['a', 'b', 'c', 'd', 'e'], maxCandidates: 2 },
      { budget: unbounded(), runCandidate, runJudge }
    )
    expect(runCandidate).toHaveBeenCalledTimes(2)
  })

  it('budget breach mid-fanout stops before the judge and reports honestly', async () => {
    const runCandidate = vi.fn(async (_t, m) => ({ output: `x ${m}`, tokensEst: 800, wallMs: 10 }))
    const runJudge = vi.fn(async () => ({
      judgment: { winnerIndex: 0, rationale: 'r' },
      tokensEst: 1,
      wallMs: 1
    }))
    const res = await runFanout(
      { task: 't', candidateModels: ['a', 'b', 'c'], maxCandidates: 4 },
      { budget: createBudget({ tokens: 1000, wallMs: 0 }), runCandidate, runJudge }
    )
    // candidate 1 (800) ok; candidate 2 (1600 > 1000) breaches; candidate 3 skipped.
    expect(runCandidate).toHaveBeenCalledTimes(2)
    expect(runJudge).not.toHaveBeenCalled()
    expect(res.breached).toBe(true)
    expect(res.winner).toBeNull()
    expect(res.breachNote).toMatch(/token budget exceeded/)
  })

  it('a single usable candidate wins without paying for a judge', async () => {
    const runCandidate = vi.fn(async (_t, m, i) =>
      i === 0
        ? { output: 'good', tokensEst: 10, wallMs: 5 }
        : { output: '', tokensEst: 5, wallMs: 5, error: 'model failed' }
    )
    const runJudge = vi.fn()
    const res = await runFanout(
      { task: 't', candidateModels: ['a', 'b'], maxCandidates: 4 },
      { budget: unbounded(), runCandidate, runJudge }
    )
    expect(runJudge).not.toHaveBeenCalled()
    expect(res.winner?.output).toBe('good')
    expect(res.judgment?.rationale).toMatch(/only one usable/)
  })

  it('all-failed candidates yield no winner and no judge call', async () => {
    const runCandidate = vi.fn(async () => ({ output: '', tokensEst: 1, wallMs: 1, error: 'boom' }))
    const runJudge = vi.fn()
    const res = await runFanout(
      { task: 't', candidateModels: ['a', 'b'], maxCandidates: 4 },
      { budget: unbounded(), runCandidate, runJudge }
    )
    expect(res.winner).toBeNull()
    expect(runJudge).not.toHaveBeenCalled()
  })

  it('the judge schema is a strict object with winnerIndex + rationale', () => {
    expect(FANOUT_JUDGE_SCHEMA.required).toEqual(['winnerIndex', 'rationale'])
    expect(FANOUT_JUDGE_SCHEMA.additionalProperties).toBe(false)
  })
})
