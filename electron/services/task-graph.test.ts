import { describe, expect, it } from 'vitest'
import { buildTaskGraph, collectTaskDescendants, type TaskGraphInput } from './task-graph'

const input = {
  conversations: [
    {
      id: 'root',
      title: 'Root',
      model: 'm',
      createdAt: 1,
      updatedAt: 10,
      messageCount: 2,
      kind: 'local',
      worktreePath: null,
      projectId: null,
      archived: false,
      pinnedAt: null,
      forkedFromId: null,
      forkedFromMessageId: null,
      seedBlob: null,
      seedSourceKind: 'none'
    },
    {
      id: 'child',
      title: 'Child',
      model: 'm',
      createdAt: 2,
      updatedAt: 20,
      messageCount: 1,
      kind: 'worktree',
      worktreePath: 'C:/work',
      projectId: null,
      archived: false,
      pinnedAt: null,
      forkedFromId: 'root',
      forkedFromMessageId: 'message-1',
      seedBlob: null,
      seedSourceKind: 'message'
    }
  ],
  runs: [
    {
      id: 'run-1',
      parentConvId: 'child',
      parentRunId: null,
      agentType: 'reader',
      label: 'Read',
      status: 'running',
      startedAt: 30,
      finishedAt: null,
      resultText: null,
      error: null,
      worktreePath: null,
      background: true,
      tokensEst: 4,
      toolCalls: 1
    },
    {
      id: 'run-2',
      parentConvId: null,
      parentRunId: 'run-1',
      agentType: 'reviewer',
      label: 'Review',
      status: 'done',
      startedAt: 31,
      finishedAt: 40,
      resultText: 'ok',
      error: null,
      worktreePath: null,
      background: false
    }
  ],
  identities: [
    {
      id: 'identity-1',
      label: 'Reader identity',
      agentType: 'reader',
      scopeKind: 'conversation',
      scopeId: 'child',
      requestedTools: [],
      grantedTools: [],
      status: 'active',
      tokensCeiling: 0,
      wallMsCeiling: 0,
      tokensSpent: 4,
      wallMsSpent: 10,
      createdAt: 25,
      revokedAt: null
    }
  ],
  turns: [
    {
      id: 'turn-1',
      conversationId: 'child',
      kind: 'regular',
      status: 'running',
      correlationId: 'corr',
      activeAgentRunId: 'run-1',
      startedAt: 28,
      completedAt: null,
      recoveryReason: null,
      createdAt: 28,
      updatedAt: 28
    }
  ]
} as unknown as TaskGraphInput

describe('canonical task graph', () => {
  it('keeps entities distinct while assigning ownership and roots', () => {
    const graph = buildTaskGraph(input, { limit: 20 })
    expect(graph.nodes).toHaveLength(6)
    expect(graph.nodes.find((n) => n.id === 'conversation:child')).toMatchObject({
      status: 'running',
      parentId: 'conversation:root',
      rootConversationId: 'root'
    })
    expect(graph.nodes.find((n) => n.id === 'agent-run:run-2')).toMatchObject({
      ownerConversationId: 'child',
      rootConversationId: 'root',
      parentId: 'agent-run:run-1'
    })
    expect(graph.edges).toContainEqual({
      from: 'conversation:root',
      to: 'conversation:child',
      relation: 'fork'
    })
  })

  it('pages with an opaque stable cursor', () => {
    const first = buildTaskGraph(input, { limit: 2 })
    const second = buildTaskGraph(input, { limit: 2, cursor: first.nextCursor })
    expect(first.nextCursor).toBeTruthy()
    expect(second.nodes).toHaveLength(2)
    expect(second.nodes.map((n) => n.id)).not.toEqual(
      expect.arrayContaining(first.nodes.map((n) => n.id))
    )
    expect(() => buildTaskGraph(input, { cursor: 'not-a-cursor' })).toThrow('invalid cursor')
  })

  it('traverses descendants and defends against cycles', () => {
    const graph = buildTaskGraph(input, { limit: 20 })
    graph.edges.push({ from: 'agent-run:run-2', to: 'conversation:root', relation: 'run' })
    const descendants = collectTaskDescendants(graph, 'conversation:root')
    expect(descendants.map((n) => n.id)).toEqual(
      expect.arrayContaining([
        'conversation:child',
        'agent-run:run-1',
        'agent-run:run-2',
        'identity:identity-1',
        'turn:turn-1'
      ])
    )
    expect(new Set(descendants.map((n) => n.id)).size).toBe(descendants.length)
  })

  it('filters one ownership tree and selected node kinds', () => {
    const graph = buildTaskGraph(input, {
      rootConversationId: 'root',
      includeKinds: ['conversation', 'turn']
    })
    expect(graph.nodes.map((n) => n.kind)).toEqual(['turn', 'conversation', 'conversation'])
  })
})
