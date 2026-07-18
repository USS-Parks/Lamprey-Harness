import { describe, expect, it, vi } from 'vitest'
import { waitForTasks, type TaskReadSnapshot } from './task-query'
import type { TaskChangeSignal } from './task-wait-signal'

function snapshot(cursor: string): TaskReadSnapshot {
  return {
    taskId: 'conversation:c1',
    cursor,
    childCount: 0,
    descendants: [],
    node: {
      id: 'conversation:c1',
      kind: 'conversation',
      title: 'One',
      status: 'idle',
      ownerConversationId: 'c1',
      rootConversationId: 'c1',
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      metadata: {}
    }
  }
}

describe('wait_tasks', () => {
  it('returns immediately when afterCursor is stale', async () => {
    const result = await waitForTasks([{ taskId: 'c1', afterCursor: 'old' }], {
      read: () => snapshot('new')
    })
    expect(result).toMatchObject({ reason: 'changed', changedTaskIds: ['conversation:c1'] })
  })

  it('wakes from a matching lifecycle signal without polling', async () => {
    let listener: ((signal: TaskChangeSignal) => void) | null = null
    let current = 'same'
    const read = vi.fn(() => snapshot(current))
    const promise = waitForTasks([{ taskId: 'c1', afterCursor: 'same' }], {
      timeoutMs: 1000,
      read,
      subscribe: (next) => {
        listener = next
        return () => {
          listener = null
        }
      }
    })
    current = 'changed'
    listener!({ conversationId: 'c1', entityId: null, kind: 'turn', occurredAt: 2 })
    await expect(promise).resolves.toMatchObject({
      reason: 'changed',
      changedTaskIds: ['conversation:c1']
    })
    expect(read.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('wakes on Steering even when the graph cursor is unchanged', async () => {
    let listener: ((signal: TaskChangeSignal) => void) | null = null
    const promise = waitForTasks([{ taskId: 'c1', afterCursor: 'same' }], {
      timeoutMs: 1000,
      read: () => snapshot('same'),
      subscribe: (next) => {
        listener = next
        return () => {
          listener = null
        }
      }
    })
    listener!({ conversationId: 'c1', entityId: null, kind: 'steer', occurredAt: 2 })
    await expect(promise).resolves.toMatchObject({ reason: 'changed' })
  })

  it('supports timeout, cancellation, and target-count bounds', async () => {
    const timeout = await waitForTasks([{ taskId: 'c1' }], {
      timeoutMs: 0,
      read: () => snapshot('same')
    })
    expect(timeout.reason).toBe('timeout')
    const controller = new AbortController()
    controller.abort()
    const cancelled = await waitForTasks([{ taskId: 'c1' }], {
      signal: controller.signal,
      read: () => snapshot('same')
    })
    expect(cancelled.reason).toBe('cancelled')
    await expect(waitForTasks([], { read: () => snapshot('same') })).rejects.toThrow('1 to 8')
  })
})
