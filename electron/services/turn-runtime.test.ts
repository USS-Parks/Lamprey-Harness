import { describe, expect, it, vi } from 'vitest'
import {
  TurnRuntimeRegistry,
  type TurnRuntimePersistence,
  type SettledTurnStatus
} from './turn-runtime'
import type { CreateTurnInput } from './turn-control-store'
import type { ClientUserMessageId, FollowUpId, TurnId } from './turn-control-types'

function harness(): {
  registry: TurnRuntimeRegistry
  created: CreateTurnInput[]
  settled: Array<{ id: string; status: SettledTurnStatus; at: number; reason?: string }>
  persistence: TurnRuntimePersistence
} {
  const created: CreateTurnInput[] = []
  const settled: Array<{
    id: string
    status: SettledTurnStatus
    at: number
    reason?: string
  }> = []
  const persistence: TurnRuntimePersistence = {
    createTurn: (input) => created.push(input),
    settleTurn: (id, status, at, reason) => {
      settled.push({ id, status, at, ...(reason ? { reason } : {}) })
      return true
    }
  }
  return { registry: new TurnRuntimeRegistry(persistence), created, settled, persistence }
}

function steer(id: string, targetAgentRunId: string | null = null) {
  return {
    followUpId: id as FollowUpId,
    input: [{ type: 'text' as const, text: id }],
    clientUserMessageId: null,
    targetAgentRunId,
    receivedAt: 100
  }
}

describe('TurnRuntimeRegistry', () => {
  it('registers one persisted running identity per conversation', () => {
    const { registry, created } = harness()
    const runtime = registry.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId,
      startedAt: 42
    })

    expect(runtime.identity).toEqual({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      kind: 'regular',
      status: 'running'
    })
    expect(created).toEqual([
      {
        id: 'turn-1',
        conversationId: 'conversation-1',
        kind: 'regular',
        correlationId: 'correlation-1',
        activeAgentRunId: null,
        startedAt: 42
      }
    ])
    expect(registry.lookupActive('conversation-1')).toBe(runtime)
  })

  it('rejects overlapping registrations and leaves a failed persistence write unregistered', () => {
    const { registry } = harness()
    registry.register({ conversationId: 'c1', correlationId: 'r1' })
    expect(() => registry.register({ conversationId: 'c1', correlationId: 'r2' })).toThrow(
      /already has running turn/
    )

    const failing = new TurnRuntimeRegistry({
      createTurn: () => {
        throw new Error('database unavailable')
      },
      settleTurn: () => true
    })
    expect(() => failing.register({ conversationId: 'c2', correlationId: 'r3' })).toThrow(
      'database unavailable'
    )
    expect(failing.lookupActive('c2')).toBeNull()
  })

  it('applies the typed expected-turn and steerability guard', () => {
    const { registry } = harness()
    registry.register({
      conversationId: 'c1',
      correlationId: 'r1',
      turnId: 'turn-1' as TurnId
    })
    expect(registry.lookupExpected('c1', 'wrong')).toMatchObject({
      ok: false,
      rejection: { reason: 'turnMismatch', activeTurnId: 'turn-1' }
    })
    expect(registry.lookupExpected('c1', 'turn-1')).toMatchObject({ ok: true })
    expect(registry.lookupExpected('missing', 'turn-1')).toMatchObject({
      ok: false,
      rejection: { reason: 'noActiveTurn' }
    })
  })

  it('retains steer order, clones inputs, and drains only the requested target', () => {
    const { registry } = harness()
    const runtime = registry.register({ conversationId: 'c1', correlationId: 'r1' })
    const first = steer('one')
    runtime.enqueueSteer(first)
    first.input[0].text = 'mutated-after-enqueue'
    runtime.enqueueSteer(steer('two', 'child-1'))
    runtime.enqueueSteer({
      ...steer('three'),
      clientUserMessageId: 'client-3' as ClientUserMessageId
    })

    expect(runtime.drainSteers().map((item) => item.input[0])).toEqual([
      { type: 'text', text: 'one' },
      { type: 'text', text: 'three' }
    ])
    expect(runtime.pendingSteers.map((item) => item.followUpId)).toEqual(['two'])
    expect(runtime.drainSteers('child-1').map((item) => item.followUpId)).toEqual(['two'])
  })

  it('wakes root and target waiters without synthesizing another runtime', async () => {
    const { registry } = harness()
    const runtime = registry.register({ conversationId: 'c1', correlationId: 'r1' })
    const anyWake = runtime.waitForWake()
    const childWake = runtime.waitForWake({ targetAgentRunId: 'child-1' })
    const otherChildWake = runtime.waitForWake({ targetAgentRunId: 'child-2' })

    runtime.enqueueSteer(steer('one', 'child-1'))
    await expect(anyWake).resolves.toMatchObject({ reason: 'steer', targetAgentRunId: 'child-1' })
    await expect(childWake).resolves.toMatchObject({
      reason: 'steer',
      targetAgentRunId: 'child-1'
    })

    runtime.wakeExternal('child-2')
    await expect(otherChildWake).resolves.toMatchObject({
      reason: 'external',
      targetAgentRunId: 'child-2'
    })
    expect(registry.lookupActive('c1')).toBe(runtime)
  })

  it('bridges cancellation while keeping the runtime registered until settlement', async () => {
    const { registry } = harness()
    const runtime = registry.register({ conversationId: 'c1', correlationId: 'r1' })
    const external = new AbortController()
    const unlink = runtime.linkAbortSignal(external.signal)
    const wake = runtime.waitForWake()

    external.abort('loop stopped')
    await expect(wake).resolves.toMatchObject({ reason: 'aborted' })
    expect(runtime.signal.aborted).toBe(true)
    expect(registry.lookupActive('c1')).toBe(runtime)
    unlink()
  })

  it('wakes waiters when its owned controller is aborted directly', async () => {
    const { registry } = harness()
    const controller = new AbortController()
    const runtime = registry.register({
      conversationId: 'c1',
      correlationId: 'r1',
      controller
    })
    const wake = runtime.waitForWake({ targetAgentRunId: 'child-1' })

    controller.abort()
    await expect(wake).resolves.toMatchObject({ reason: 'aborted' })
    expect(registry.lookupActive('c1')).toBe(runtime)
  })

  it('settles once under a completion/cancel race and clears the registry first', () => {
    const { registry, settled } = harness()
    const runtime = registry.register({ conversationId: 'c1', correlationId: 'r1' })

    registry.abort('c1')
    expect(registry.settle(runtime, 'cancelled', 200)).toBe(true)
    expect(registry.settle(runtime, 'completed', 201)).toBe(false)
    expect(registry.lookupActive('c1')).toBeNull()
    expect(settled).toEqual([{ id: runtime.turnId, status: 'cancelled', at: 200 }])
  })

  it('cleans up and resolves waiters even when settlement persistence throws', async () => {
    const settleTurn = vi.fn(() => {
      throw new Error('settlement write failed')
    })
    const registry = new TurnRuntimeRegistry({ createTurn: () => null, settleTurn })
    const runtime = registry.register({ conversationId: 'c1', correlationId: 'r1' })
    const wake = runtime.waitForWake()

    expect(() => registry.settle(runtime, 'failed', 300)).toThrow('settlement write failed')
    await expect(wake).resolves.toMatchObject({ reason: 'settled' })
    expect(runtime.status).toBe('failed')
    expect(registry.lookupActive('c1')).toBeNull()
    expect(settleTurn).toHaveBeenCalledTimes(1)
  })
})
