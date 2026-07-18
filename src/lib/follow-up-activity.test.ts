import { describe, expect, it } from 'vitest'
import { FOLLOW_UP_ACTIVITY_CAP, presentFollowUpActivity } from './follow-up-activity'
import type {
  ClientUserMessageId,
  FollowUpId,
  TurnFollowUpRecord,
  TurnId
} from './turn-control-types'

function record(id: string, updatedAt: number): TurnFollowUpRecord {
  return {
    id: id as FollowUpId,
    conversationId: 'conversation-1',
    turnId: 'turn-1' as TurnId,
    expectedTurnId: 'turn-1' as TurnId,
    clientUserMessageId: `client-${id}` as ClientUserMessageId,
    deliveryMode: 'steer',
    status: 'accepted',
    inputVersion: 1,
    input: [
      { type: 'text', text: 'do not render this text' },
      { type: 'localImage', path: 'C:\\secret\\image.png' }
    ],
    position: null,
    actor: 'user',
    sourceConversationId: 'conversation-1',
    sourceTaskId: null,
    targetAgentRunId: null,
    rejectionReason: null,
    rejectionMessage: null,
    recoveryReason: null,
    createdAt: updatedAt,
    updatedAt,
    deliveredAt: null,
    finalizedAt: null
  }
}

describe('ST-10 follow-up activity presentation', () => {
  it('shows only bounded identity, status, and counts without input or path content', () => {
    const item = presentFollowUpActivity([record('follow-up-123456', 10)])[0]
    expect(item).toMatchObject({ label: 'Steering accepted', status: 'accepted' })
    expect(item.detail).toContain('#follow-u')
    expect(item.detail).toContain('2 input items')
    expect(JSON.stringify(item)).not.toContain('do not render')
    expect(JSON.stringify(item)).not.toContain('secret')
    expect(JSON.stringify(item)).not.toContain('image.png')
  })

  it('sorts newest first and caps the activity list', () => {
    const records = Array.from({ length: FOLLOW_UP_ACTIVITY_CAP + 5 }, (_, index) =>
      record(`follow-up-${index}`, index)
    )
    const items = presentFollowUpActivity(records)
    expect(items).toHaveLength(FOLLOW_UP_ACTIVITY_CAP)
    expect(items[0].id).toBe(`follow-up-${FOLLOW_UP_ACTIVITY_CAP + 4}`)
  })

  it('labels automatically dispatched queue records as queued follow-ups', () => {
    const queued = {
      ...record('queued-follow-up', 10),
      deliveryMode: 'queue' as const,
      status: 'delivered' as const,
      expectedTurnId: null,
      position: 0
    }
    expect(presentFollowUpActivity([queued])[0].label).toBe('Queued follow-up delivered')
  })
})
