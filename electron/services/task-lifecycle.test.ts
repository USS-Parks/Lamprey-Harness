import { describe, expect, it, vi } from 'vitest'
import { createTaskLifecycleService } from './task-lifecycle'
import type { TaskGraphSnapshot } from './task-graph'

function graph(active = false): TaskGraphSnapshot {
  return {
    nextCursor: null,
    total: 3,
    nodes: [
      {
        id: 'conversation:root',
        kind: 'conversation',
        title: 'Root',
        status: 'idle',
        ownerConversationId: 'root',
        rootConversationId: 'root',
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
        metadata: { entityId: 'root' }
      },
      {
        id: 'conversation:child',
        kind: 'conversation',
        title: 'Child',
        status: 'archived',
        ownerConversationId: 'child',
        rootConversationId: 'root',
        parentId: 'conversation:root',
        createdAt: 2,
        updatedAt: 2,
        metadata: { entityId: 'child' }
      },
      {
        id: 'agent-run:r1',
        kind: 'agent-run',
        title: 'Run',
        status: active ? 'running' : 'done',
        ownerConversationId: 'child',
        rootConversationId: 'root',
        parentId: 'conversation:child',
        createdAt: 3,
        updatedAt: 3,
        metadata: { entityId: 'r1' }
      }
    ],
    edges: [
      { from: 'conversation:root', to: 'conversation:child', relation: 'fork' },
      { from: 'conversation:child', to: 'agent-run:r1', relation: 'run' }
    ]
  }
}

function setup(active = false) {
  let now = 100
  const deps = {
    graph: vi.fn(() => graph(active)),
    getConversation: vi.fn((id) => ({ id, title: 'T' })),
    updateTitle: vi.fn(),
    setPinned: vi.fn(),
    setArchived: vi.fn(),
    setClosed: vi.fn(),
    deleteConversation: vi.fn(),
    deleteAuxiliary: vi.fn(),
    record: vi.fn(),
    now: () => now,
    newToken: () => 'preview-1'
  } as any
  return {
    service: createTaskLifecycleService(deps),
    deps,
    expire: () => {
      now = 61_000
    }
  }
}

describe('task lifecycle', () => {
  it('keeps title, pin, archive, close, and restore recoverable', () => {
    const { service, deps } = setup()
    service.update('root', 'rename', 'New title')
    service.update('root', 'pin')
    service.update('root', 'archive')
    service.update('root', 'close')
    service.update('root', 'restore')
    expect(deps.updateTitle).toHaveBeenCalledWith('root', 'New title')
    expect(deps.setPinned).toHaveBeenCalledWith('root', true)
    expect(deps.setClosed).toHaveBeenCalledWith('root', true)
    expect(deps.setClosed).toHaveBeenCalledWith('root', false)
    expect(deps.setArchived).toHaveBeenLastCalledWith('root', false)
  })

  it('previews every descendant impact before permanent deletion', () => {
    const { service, deps } = setup()
    const preview = service.previewDelete('root')
    expect(preview).toMatchObject({
      conversationIds: ['root', 'child'],
      agentRunIds: ['r1'],
      activeNodeIds: []
    })
    expect(service.delete('root', preview.previewToken).deleted).toBe(true)
    expect(deps.deleteAuxiliary).toHaveBeenCalledWith(
      expect.objectContaining({ agentRunIds: ['r1'] })
    )
    expect(deps.deleteConversation).toHaveBeenCalledTimes(2)
  })

  it('rejects missing, stale, and active-tree delete attempts', () => {
    const { service, expire } = setup()
    expect(() => service.delete('root', 'invented')).toThrow('fresh matching preview')
    const preview = service.previewDelete('root')
    expire()
    expect(() => service.delete('root', preview.previewToken)).toThrow('fresh matching preview')
    const active = setup(true).service
    const activePreview = active.previewDelete('root')
    expect(() => active.delete('root', activePreview.previewToken)).toThrow('active descendants')
  })
})
