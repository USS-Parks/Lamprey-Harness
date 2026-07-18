import { describe, expect, it, vi } from 'vitest'
import {
  buildFollowUpAuditEvent,
  buildQueueReorderedEvent,
  buildSubmissionRejectedEvent,
  tryRecordTurnControlEvent
} from './turn-control-events'
import type { FollowUpRecord } from './turn-control-store'

function followUp(overrides: Partial<FollowUpRecord> = {}): FollowUpRecord {
  return {
    id: 'follow-up-123456' as any,
    conversationId: 'conversation-1',
    turnId: 'turn-1' as any,
    expectedTurnId: 'turn-1' as any,
    clientUserMessageId: 'client-1' as any,
    deliveryMode: 'steer',
    status: 'accepted',
    inputVersion: 1,
    input: [
      { type: 'text', text: 'private follow-up text' },
      {
        type: 'localImage',
        path: 'C:\\private\\image.png',
        name: 'image.png',
        sizeBytes: 123
      }
    ],
    position: null,
    actor: 'user',
    sourceConversationId: 'conversation-1',
    sourceTaskId: null,
    targetAgentRunId: null,
    rejectionReason: null,
    rejectionMessage: null,
    recoveryReason: null,
    createdAt: 1,
    updatedAt: 2,
    deliveredAt: null,
    finalizedAt: null,
    ...overrides
  }
}

describe('ST-10 bounded turn-control audit events', () => {
  it('records identity, status, and input shape without content, bytes, or local paths', () => {
    const event = buildFollowUpAuditEvent(followUp(), 'accepted', {
      correlationId: 'correlation-1'
    })
    expect(event).toMatchObject({
      type: 'turn.followup.accepted',
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      entityId: 'follow-up-123456',
      payload: {
        disposition: 'accepted',
        inputItemCount: 2,
        inputTypes: ['text', 'localImage']
      },
      redaction: 'metadata'
    })
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain('private follow-up text')
    expect(serialized).not.toContain('C:\\private')
    expect(serialized).not.toContain('image.png')
    expect(serialized).not.toContain('sizeBytes')
  })

  it('reduces rejected raw submissions to bounded identifiers and known input types', () => {
    const event = buildSubmissionRejectedEvent(
      {
        conversationId: 'conversation-1',
        clientUserMessageId: 'client-1',
        expectedTurnId: 'turn-1',
        input: [
          { type: 'text', text: 'private' },
          { type: 'localImage', path: 'C:\\private\\image.png' },
          { type: 'audio', data: 'secret bytes' }
        ],
        apiKey: 'secret-token'
      },
      'steer',
      { reason: 'unsupportedInput', message: 'unsupported' }
    )
    expect(event.payload).toMatchObject({
      rejectionReason: 'unsupportedInput',
      inputItemCount: 3,
      inputTypes: ['text', 'localImage']
    })
    expect(JSON.stringify(event)).not.toMatch(/private|secret-token|secret bytes|apiKey/)
  })

  it('emits one bounded queue-order event with ids and count', () => {
    const event = buildQueueReorderedEvent('conversation-1', [
      followUp({ id: 'follow-up-2' as any }),
      followUp({ id: 'follow-up-1' as any })
    ])
    expect(event).toMatchObject({
      type: 'turn.followup.reordered',
      payload: { followUpIds: ['follow-up-2', 'follow-up-1'], count: 2 }
    })
  })

  it('never lets an audit write failure change the turn-control action', () => {
    const report = vi.fn()
    expect(() =>
      tryRecordTurnControlEvent(
        buildFollowUpAuditEvent(followUp(), 'accepted'),
        () => {
          throw new Error('event DB unavailable')
        },
        report
      )
    ).not.toThrow()
    expect(report).toHaveBeenCalledOnce()
  })
})
