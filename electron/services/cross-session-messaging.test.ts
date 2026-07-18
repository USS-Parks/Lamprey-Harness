import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: {
    getPath: () => {
      throw new Error('electron app not available in tests')
    }
  }
}))

vi.mock('./conversation-store', () => ({
  getConversation: (id: string) =>
    id === 'target'
      ? {
          id,
          title: 'Target',
          model: 'deepseek-chat',
          createdAt: 1,
          updatedAt: 2,
          messageCount: 0
        }
      : null,
  listConversations: () => [
    {
      id: 'target',
      title: 'Target',
      model: 'deepseek-chat',
      updatedAt: 2,
      archived: false
    }
  ]
}))

const { send } = vi.hoisted(() => ({
  send: vi.fn(() => ({
    id: 'follow-up-1',
    targetConversationId: 'target',
    mode: 'queue',
    status: 'queued',
    duplicate: false,
    createdAt: 3
  }))
}))
vi.mock('./task-delivery', () => ({ taskDelivery: { send } }))

import { listActiveSessions, sendSessionMessage } from './cross-session-messaging'

describe('G4 cross-session messaging', () => {
  it('lists active sessions from unarchived conversations', () => {
    expect(listActiveSessions()).toEqual([
      {
        id: 'target',
        title: 'Target',
        model: 'deepseek-chat',
        updatedAt: 2
      }
    ])
  })

  it('preserves send_to_session through canonical next-turn Queue delivery', () => {
    const sent = sendSessionMessage({
      targetSessionId: 'target',
      fromSessionId: 'source',
      body: 'The workflow finished.'
    })

    expect(sent.targetSessionId).toBe('target')
    expect(sent.fromSessionId).toBe('source')
    expect(send).toHaveBeenCalledWith({
      targetConversationId: 'target',
      body: 'The workflow finished.',
      mode: 'queue',
      sourceConversationId: 'source',
      sourceTaskId: 'source'
    })
  })
})
