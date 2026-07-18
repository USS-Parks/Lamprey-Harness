import { describe, expect, it, vi } from 'vitest'
import { createTurnInterruptAction } from './turn-interrupt'
import { TurnRuntimeRegistry, type TurnRuntimePersistence } from './turn-runtime'
import type { RecordEventInput } from './event-log'
import type { TurnId } from './turn-control-types'

function harness(options: { settlementThrows?: boolean } = {}) {
  const settled: Array<{ id: string; status: string; completedAt: number }> = []
  const persistence: TurnRuntimePersistence = {
    createTurn: () => null,
    settleTurn: (id, status, completedAt) => {
      settled.push({ id, status, completedAt })
      if (options.settlementThrows) throw new Error('disk unavailable')
      return true
    }
  }
  const runtimes = new TurnRuntimeRegistry(persistence)
  const events: RecordEventInput[] = []
  const drained: Array<string | undefined> = []
  const errors: Array<{ message: string; error: unknown }> = []
  const recoverPendingSteers = vi.fn((runtime) => runtime.drainAllSteers().length)
  const action = createTurnInterruptAction({
    runtimes,
    now: () => 250,
    recoverPendingSteers,
    drainDocuments: (correlationId) => drained.push(correlationId),
    record: (event) => events.push(event),
    reportError: (message, error) => errors.push({ message, error })
  })
  return { action, drained, errors, events, recoverPendingSteers, runtimes, settled }
}

describe('ST-7 turn-aware interrupt', () => {
  it('recovers retained Steering, aborts, and settles the exact turn once', () => {
    const h = harness()
    const runtime = h.runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId,
      startedAt: 100
    })
    runtime.enqueueSteer({
      followUpId: 'follow-up-1' as any,
      input: [{ type: 'text', text: 'retained' }],
      clientUserMessageId: null,
      targetAgentRunId: null,
      receivedAt: 150
    })

    expect(h.action({ conversationId: 'conversation-1', expectedTurnId: 'turn-1' })).toEqual({
      success: true,
      data: {
        turnId: 'turn-1',
        status: 'interrupted',
        recoveredFollowUps: 1,
        persisted: true
      }
    })
    expect(runtime.signal.aborted).toBe(true)
    expect(runtime.signal.reason).toBe('user-interrupt')
    expect(runtime.status).toBe('interrupted')
    expect(h.runtimes.lookupActive('conversation-1')).toBeNull()
    expect(h.recoverPendingSteers).toHaveBeenCalledTimes(1)
    expect(runtime.pendingSteers).toEqual([])
    expect(h.drained).toEqual(['correlation-1'])
    expect(h.settled).toEqual([{ id: 'turn-1', status: 'interrupted', completedAt: 250 }])
    expect(h.events).toHaveLength(1)
    expect(h.events[0]).toMatchObject({
      type: 'chat.cancelled',
      entityKind: 'turn',
      entityId: 'turn-1',
      payload: {
        disposition: 'interrupted',
        elapsedMs: 150,
        recoveredFollowUps: 1,
        persisted: true
      }
    })
  })

  it('rejects invalid, missing, mismatched, and already-settled identities before effects', () => {
    const h = harness()
    const runtime = h.runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })

    expect(h.action({ conversationId: 'conversation-1' })).toMatchObject({
      success: false,
      rejection: { reason: 'invalidInput', field: 'expectedTurnId' }
    })
    expect(
      h.action({ conversationId: 'conversation-1', expectedTurnId: 'wrong-turn' })
    ).toMatchObject({
      success: false,
      rejection: { reason: 'turnMismatch', activeTurnId: 'turn-1' }
    })
    expect(runtime.signal.aborted).toBe(false)
    expect(h.events).toEqual([])
    expect(h.drained).toEqual([])

    h.runtimes.settle(runtime, 'completed', 200)
    expect(h.action({ conversationId: 'conversation-1', expectedTurnId: 'turn-1' })).toMatchObject({
      success: false,
      rejection: { reason: 'noActiveTurn' }
    })
    expect(h.events).toEqual([])
  })

  it('makes duplicate interrupt attempts visible without a second settlement or event', () => {
    const h = harness()
    h.runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })
    const request = { conversationId: 'conversation-1', expectedTurnId: 'turn-1' }

    expect(h.action(request)).toMatchObject({ success: true })
    expect(h.action(request)).toMatchObject({
      success: false,
      rejection: { reason: 'noActiveTurn' }
    })
    expect(h.settled).toHaveLength(1)
    expect(h.events).toHaveLength(1)
  })

  it('reports an honest non-persisted success when durable settlement fails', () => {
    const h = harness({ settlementThrows: true })
    const runtime = h.runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })

    expect(h.action({ conversationId: 'conversation-1', expectedTurnId: 'turn-1' })).toMatchObject({
      success: true,
      data: { status: 'interrupted', persisted: false }
    })
    expect(runtime.status).toBe('interrupted')
    expect(h.runtimes.lookupActive('conversation-1')).toBeNull()
    expect(h.errors).toHaveLength(1)
    expect(h.events).toHaveLength(1)
    expect(h.events[0].payload).toMatchObject({ persisted: false })
  })
})
