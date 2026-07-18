import { describe, expect, it } from 'vitest'
import {
  applyTurnSettledEvent,
  applyTurnStartedEvent,
  getConversationFollowUpState,
  reconcileTurnControlSnapshot,
  selectQueuedFollowUps,
  selectRecoverableDrafts,
  type ConversationFollowUpState,
  type FollowUpStateByConversation
} from './follow-up-state'
import type { TurnControlSnapshot, TurnFollowUpRecord, TurnId } from './turn-control-types'

function followUp(
  id: string,
  status: TurnFollowUpRecord['status'],
  position: number | null
): TurnFollowUpRecord {
  return {
    id: id as any,
    conversationId: 'conversation-a',
    turnId: null,
    expectedTurnId: null,
    clientUserMessageId: null,
    deliveryMode: status === 'queued' ? 'queue' : 'steer',
    status,
    inputVersion: 1,
    input: [{ type: 'text', text: id }],
    position,
    actor: 'user',
    sourceConversationId: null,
    sourceTaskId: null,
    targetAgentRunId: null,
    rejectionReason: status === 'rejected' ? 'turnMismatch' : null,
    rejectionMessage: status === 'rejected' ? 'stale turn' : null,
    recoveryReason: status === 'recovered' ? 'restart' : null,
    createdAt: 1,
    updatedAt: 1,
    deliveredAt: null,
    finalizedAt: null
  }
}

function snapshot(overrides: Partial<TurnControlSnapshot> = {}): TurnControlSnapshot {
  return {
    conversationId: 'conversation-a',
    activeTurn: {
      conversationId: 'conversation-a',
      turnId: 'turn-a' as TurnId,
      kind: 'regular',
      status: 'running',
      startedAt: 100
    },
    followUps: [],
    observedAt: 110,
    revision: 10,
    ...overrides
  }
}

describe('ST-8 per-conversation follow-up state', () => {
  it('keeps active identities isolated while switching conversations', () => {
    const states: FollowUpStateByConversation = {
      'conversation-a': reconcileTurnControlSnapshot(undefined, snapshot()),
      'conversation-b': reconcileTurnControlSnapshot(
        undefined,
        snapshot({ conversationId: 'conversation-b', activeTurn: null })
      )
    }
    expect(getConversationFollowUpState(states, 'conversation-a').activeTurn?.turnId).toBe('turn-a')
    expect(getConversationFollowUpState(states, 'conversation-b').activeTurn).toBeNull()
    expect(getConversationFollowUpState(states, 'never-opened').activeTurn).toBeNull()
  })

  it('rehydrates running identity and deterministic Queue state after reload', () => {
    const state = reconcileTurnControlSnapshot(
      undefined,
      snapshot({
        followUps: [followUp('queue-b', 'queued', 1), followUp('queue-a', 'queued', 0)]
      })
    )
    expect(state.activeTurn?.turnId).toBe('turn-a')
    expect(selectQueuedFollowUps(state).map((item) => item.id)).toEqual(['queue-a', 'queue-b'])
  })

  it('ignores a stale reconnect snapshot that would resurrect a settled turn', () => {
    const running = reconcileTurnControlSnapshot(undefined, snapshot())
    const settled = applyTurnSettledEvent(running, {
      conversationId: 'conversation-a',
      turnId: 'turn-a' as TurnId,
      status: 'completed',
      completedAt: 150,
      occurredAt: 150,
      revision: 11,
      persisted: true
    })
    const stale = reconcileTurnControlSnapshot(settled, snapshot({ observedAt: 120, revision: 10 }))
    expect(stale).toBe(settled)
    expect(stale.activeTurn).toBeNull()
  })

  it('does not let a late settled event clear a newer turn', () => {
    const oldTurn = reconcileTurnControlSnapshot(undefined, snapshot())
    const newTurn = applyTurnStartedEvent(oldTurn, {
      conversationId: 'conversation-a',
      turnId: 'turn-b' as TurnId,
      kind: 'regular',
      status: 'running',
      startedAt: 200,
      occurredAt: 200,
      revision: 11
    })
    const afterLateEvent = applyTurnSettledEvent(newTurn, {
      conversationId: 'conversation-a',
      turnId: 'turn-a' as TurnId,
      status: 'completed',
      completedAt: 210,
      occurredAt: 210,
      revision: 12,
      persisted: true
    })
    expect(afterLateEvent.activeTurn?.turnId).toBe('turn-b')
    expect(afterLateEvent.observedAt).toBe(210)
  })

  it('retains rejected and restart-recovered Steering as editable drafts', () => {
    const state: ConversationFollowUpState = {
      activeTurn: null,
      followUps: [
        followUp('rejected', 'rejected', null),
        followUp('recovered', 'recovered', null),
        followUp('delivered', 'delivered', null)
      ],
      observedAt: 1,
      revision: 1
    }
    expect(selectRecoverableDrafts(state).map((item) => item.id)).toEqual(['rejected', 'recovered'])
  })
})
