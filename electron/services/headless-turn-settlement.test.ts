import { describe, expect, it, vi } from 'vitest'
import { finalizeTurn, type FinalizeTurnDependencies } from './finalize-turn'
import { isUserAbortError } from './ghost-reply-guard'
import { ToolRoundCapError } from './tool-round-cap-error'
import { TurnRuntimeRegistry, type TurnRuntimePersistence } from './turn-runtime'
import type { TurnId } from './turn-control-types'

function observeDeps(
  runtimes: TurnRuntimeRegistry
): FinalizeTurnDependencies & {
  drained: string[]
  artifacts: string[]
} {
  const drained: string[] = []
  const artifacts: string[] = []
  return {
    drained,
    artifacts,
    recoverPendingSteers: (runtime) => runtime.pendingSteers.length,
    settle: (runtime, status, completedAt) => runtimes.settle(runtime, status, completedAt),
    emitSettled: () => undefined,
    drainDocuments: (id) => {
      if (id) drained.push(id)
    },
    drainArtifacts: (id) => {
      if (id) artifacts.push(id)
    },
    reportError: () => undefined
  }
}

describe('OD-1 headless cap failure settles failed', () => {
  it('ToolRoundCapError maps to failed and finalizeTurn withholds the queue', () => {
    const settled: Array<{ id: string; status: string }> = []
    const persistence: TurnRuntimePersistence = {
      createTurn: () => null,
      settleTurn: (id, status) => {
        settled.push({ id, status })
        return true
      }
    }
    const runtimes = new TurnRuntimeRegistry(persistence)
    const runtime = runtimes.register({
      conversationId: 'c1',
      correlationId: 'corr-1',
      turnId: 'turn-1' as TurnId
    })

    let settlementStatus: 'cancelled' | 'failed'
    try {
      throw new ToolRoundCapError()
    } catch (err) {
      const errObj = err instanceof Error ? err : { message: String(err) }
      settlementStatus =
        runtime.signal.aborted || isUserAbortError(errObj) ? 'cancelled' : 'failed'
    }

    const dispatchQueue = vi.fn()
    const d = observeDeps(runtimes)
    const result = finalizeTurn(
      {
        runtime,
        status: settlementStatus,
        conversationId: 'c1',
        model: 'm1',
        correlationId: 'corr-1',
        completedAt: 10,
        dispatchQueue
      },
      d
    )

    expect(settlementStatus).toBe('failed')
    expect(result.settled).toBe(true)
    expect(settled).toEqual([{ id: 'turn-1', status: 'failed' }])
    expect(d.drained).toEqual(['corr-1'])
    expect(d.artifacts).toEqual(['corr-1'])
    expect(dispatchQueue).not.toHaveBeenCalled()
    expect(runtimes.lookupActive('c1')).toBeNull()
  })
})
