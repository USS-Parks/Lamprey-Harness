import { describe, expect, it } from 'vitest'
import {
  buildConversationTaskRows,
  type TaskGraphNodeView
} from '../../lib/task-control-presentation'

function conversation(
  id: string,
  parentId: string | null,
  updatedAt: number
): TaskGraphNodeView {
  return {
    id: `conversation:${id}`,
    kind: 'conversation',
    title: id,
    status: 'idle',
    ownerConversationId: id,
    parentId,
    updatedAt,
    metadata: { entityId: id, unreadCount: 0 }
  }
}

describe('TC-6 task-control presentation model', () => {
  it('assigns bounded parent/child depth and keeps fresh roots first', () => {
    const rows = buildConversationTaskRows([
      conversation('child', 'conversation:root', 30),
      conversation('older', null, 10),
      conversation('root', null, 20)
    ])
    expect(rows.map((row) => [row.node.id, row.depth])).toEqual([
      ['conversation:root', 0],
      ['conversation:older', 0],
      ['conversation:child', 1]
    ])
  })

  it('terminates malformed parent cycles instead of hanging the activity UI', () => {
    const rows = buildConversationTaskRows([
      conversation('a', 'conversation:b', 2),
      conversation('b', 'conversation:a', 1)
    ])
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.depth <= 1)).toBe(true)
  })
})
