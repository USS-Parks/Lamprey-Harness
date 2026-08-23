import { describe, expect, it, vi } from 'vitest'
import { finalizeTurn, type FinalizeTurnDependencies } from './finalize-turn'
import type { TurnRuntime } from './turn-runtime'
import type { TurnId } from './turn-control-types'

function runtime(pending = 0): TurnRuntime {
  const steers = Array.from({ length: pending }, (_, i) => ({
    followUpId: `fu-${i}`,
    input: [],
    clientUserMessageId: null,
    targetAgentRunId: null,
    receivedAt: i
  }))
  return {
    conversationId: 'c1',
    correlationId: 'corr-1',
    turnId: 'turn-1' as TurnId,
    pendingSteers: steers
  } as unknown as TurnRuntime
}

function deps(): FinalizeTurnDependencies & {
  settled: Array<{ status: string; at: number }>
  drained: string[]
  artifacts: string[]
  emitted: Array<{ status: string; persisted: boolean }>
  recovered: string[]
} {
  const settled: Array<{ status: string; at: number }> = []
  const drained: string[] = []
  const artifacts: string[] = []
  const emitted: Array<{ status: string; persisted: boolean }> = []
  const recovered: string[] = []
  return {
    settled,
    drained,
    artifacts,
    emitted,
    recovered,
    recoverPendingSteers: (rt, reason) => {
      recovered.push(reason)
      return rt.pendingSteers.length
    },
    settle: (_rt, status, at) => {
      settled.push({ status, at })
      return true
    },
    emitSettled: (_rt, status, _at, persisted) => {
      emitted.push({ status, persisted })
    },
    drainDocuments: (id) => {
      if (id) drained.push(id)
    },
    drainArtifacts: (id) => {
      if (id) artifacts.push(id)
    },
    reportError: () => undefined
  }
}

describe('AC-3 finalizeTurn', () => {
  it('recovers, settles, drains, then queues only on completed', () => {
    const d = deps()
    const dispatchQueue = vi.fn()
    const result = finalizeTurn(
      {
        runtime: runtime(1),
        status: 'completed',
        conversationId: 'c1',
        model: 'm1',
        activeSkillIds: ['s'],
        correlationId: 'corr-1',
        completedAt: 10,
        dispatchQueue
      },
      d
    )
    expect(result).toEqual({ settled: true, recoveredFollowUps: 1 })
    expect(d.recovered).toEqual(['turn completed before pending Steering was delivered'])
    expect(d.settled).toEqual([{ status: 'completed', at: 10 }])
    expect(d.drained).toEqual(['corr-1'])
    expect(d.artifacts).toEqual(['corr-1'])
    expect(dispatchQueue).toHaveBeenCalledWith({
      conversationId: 'c1',
      model: 'm1',
      activeSkillIds: ['s']
    })
  })

  it('OD-3: cancelled drains and withholds the queue', () => {
    const d = deps()
    const dispatchQueue = vi.fn()
    const result = finalizeTurn(
      {
        runtime: runtime(),
        status: 'cancelled',
        conversationId: 'c1',
        model: 'm1',
        correlationId: 'corr-1',
        dispatchQueue
      },
      d
    )
    expect(result.settled).toBe(true)
    expect(d.settled).toEqual([expect.objectContaining({ status: 'cancelled' })])
    expect(d.drained).toEqual(['corr-1'])
    expect(d.artifacts).toEqual(['corr-1'])
    expect(dispatchQueue).not.toHaveBeenCalled()
  })

  it('does not dispatch the queue when settlement is failed', () => {
    const d = deps()
    const dispatchQueue = vi.fn()
    const result = finalizeTurn(
      {
        runtime: runtime(),
        status: 'failed',
        conversationId: 'c1',
        model: 'm1',
        dispatchQueue
      },
      d
    )
    expect(result.settled).toBe(true)
    expect(dispatchQueue).not.toHaveBeenCalled()
  })

  it('still drains when settle throws and does not dispatch', () => {
    const d = deps()
    d.settle = () => {
      throw new Error('disk')
    }
    const dispatchQueue = vi.fn()
    const result = finalizeTurn(
      {
        runtime: runtime(),
        status: 'completed',
        conversationId: 'c1',
        model: 'm1',
        correlationId: 'corr-1',
        dispatchQueue
      },
      d
    )
    expect(result.settled).toBe(false)
    expect(d.emitted).toEqual([{ status: 'completed', persisted: false }])
    expect(d.drained).toEqual(['corr-1'])
    expect(dispatchQueue).not.toHaveBeenCalled()
  })
})
