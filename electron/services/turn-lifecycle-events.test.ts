import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TurnRuntime } from './turn-runtime'
import type { TurnId } from './turn-control-types'

const emitChatEvent = vi.hoisted(() => vi.fn())
vi.mock('./chat-events', () => ({ emitChatEvent }))

import { emitTurnSettled, emitTurnStarted } from './turn-lifecycle-events'

function runtime(): TurnRuntime {
  return new TurnRuntime({
    conversationId: 'conversation-1',
    correlationId: 'correlation-1',
    turnId: 'turn-1' as TurnId,
    kind: 'regular',
    controller: new AbortController(),
    startedAt: 100,
    activeAgentRunId: null
  })
}

describe('ST-8 renderer turn lifecycle events', () => {
  beforeEach(() => emitChatEvent.mockReset())

  it('emits stable running identity without prompt or attachment data', () => {
    emitTurnStarted(runtime())
    expect(emitChatEvent).toHaveBeenCalledWith('chat:turn-started', {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      kind: 'regular',
      status: 'running',
      startedAt: 100,
      occurredAt: expect.any(Number),
      revision: expect.any(Number)
    })
  })

  it('emits terminal identity and durable-write truth', () => {
    emitTurnSettled(runtime(), 'interrupted', 200, false)
    expect(emitChatEvent).toHaveBeenCalledWith('chat:turn-settled', {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      status: 'interrupted',
      completedAt: 200,
      occurredAt: expect.any(Number),
      persisted: false,
      revision: expect.any(Number)
    })
  })
})
