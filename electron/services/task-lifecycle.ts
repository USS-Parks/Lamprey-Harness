import { randomUUID } from 'crypto'
import { getDb } from './database'
import * as conversationStore from './conversation-store'
import { buildTaskGraph, collectTaskDescendants, type TaskGraphSnapshot } from './task-graph'
import { TurnControlStore } from './turn-control-store'
import * as agentRunStore from './agent-run-store'
import { listIdentitiesByScope } from './agent-identity-store'
import { recordEvent, type EventActorKind } from './event-log'
import { notifyTaskChange } from './task-wait-signal'

export type RecoverableTaskAction = 'rename' | 'pin' | 'unpin' | 'archive' | 'restore' | 'close'

export interface DeleteTaskPreview {
  taskId: string
  previewToken: string
  expiresAt: number
  conversationIds: string[]
  agentRunIds: string[]
  identityIds: string[]
  turnIds: string[]
  activeNodeIds: string[]
}

export interface TaskLifecycleDependencies {
  graph: () => TaskGraphSnapshot
  getConversation: typeof conversationStore.getConversation
  updateTitle: typeof conversationStore.updateConversationTitle
  setPinned: typeof conversationStore.setConversationPinned
  setArchived: typeof conversationStore.setConversationArchived
  setClosed: typeof conversationStore.setConversationClosed
  deleteConversation: typeof conversationStore.deleteConversation
  deleteAuxiliary: (preview: DeleteTaskPreview) => void
  record: typeof recordEvent
  now: () => number
  newToken: () => string
}

function productionGraph(): TaskGraphSnapshot {
  const conversations = conversationStore.listConversations()
  const turnStore = new TurnControlStore()
  return buildTaskGraph(
    {
      conversations,
      runs: agentRunStore.listRuns(),
      identities: conversations.flatMap((conversation) =>
        listIdentitiesByScope('conversation', conversation.id)
      ),
      turns: conversations.flatMap((conversation) => turnStore.listTurns(conversation.id))
    },
    { limit: 200 }
  )
}

function productionDeleteAuxiliary(preview: DeleteTaskPreview): void {
  const db = getDb()
  const removeIds = (table: string, ids: string[]): void => {
    if (!ids.length) return
    db.prepare(`DELETE FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids)
  }
  removeIds('agent_runs', preview.agentRunIds)
  removeIds('agent_identities', preview.identityIds)
}

function conversationNodeId(taskId: string): string {
  const value = taskId.trim()
  if (!value) throw new Error('taskId is required')
  return value.startsWith('conversation:') ? value : `conversation:${value}`
}

export function createTaskLifecycleService(deps: TaskLifecycleDependencies) {
  const previews = new Map<string, DeleteTaskPreview>()

  function previewDelete(taskId: string): DeleteTaskPreview {
    const graph = deps.graph()
    if (graph.total > graph.nodes.length) {
      throw new Error('task graph exceeds the bounded deletion preview; narrow the tree first')
    }
    const id = conversationNodeId(taskId)
    const root = graph.nodes.find((node) => node.id === id && node.kind === 'conversation')
    if (!root) throw new Error('task not found')
    const nodes = [root, ...collectTaskDescendants(graph, id, 500)]
    const preview: DeleteTaskPreview = {
      taskId: id,
      previewToken: deps.newToken(),
      expiresAt: deps.now() + 60_000,
      conversationIds: nodes
        .filter((node) => node.kind === 'conversation')
        .map((node) => String(node.metadata.entityId)),
      agentRunIds: nodes
        .filter((node) => node.kind === 'agent-run')
        .map((node) => String(node.metadata.entityId)),
      identityIds: nodes
        .filter((node) => node.kind === 'identity')
        .map((node) => String(node.metadata.entityId)),
      turnIds: nodes
        .filter((node) => node.kind === 'turn')
        .map((node) => String(node.metadata.entityId)),
      activeNodeIds: nodes.filter((node) => node.status === 'running').map((node) => node.id)
    }
    previews.set(preview.previewToken, preview)
    return preview
  }

  return {
    update(
      taskId: string,
      action: RecoverableTaskAction,
      value?: string | null,
      actorKind: EventActorKind = 'model'
    ) {
      const id = conversationNodeId(taskId).slice('conversation:'.length)
      if (!deps.getConversation(id)) throw new Error('task not found')
      if (action === 'rename') {
        if (!value?.trim()) throw new Error('rename requires a title')
        deps.updateTitle(id, value.trim().slice(0, 160))
      } else if (action === 'pin' || action === 'unpin') {
        deps.setPinned(id, action === 'pin')
      } else if (action === 'archive') {
        deps.setArchived(id, true)
      } else if (action === 'close') {
        deps.setClosed(id, true)
      } else if (action === 'restore') {
        deps.setClosed(id, false)
        deps.setArchived(id, false)
      } else {
        throw new Error('unsupported task action')
      }
      deps.record({
        type: 'task.metadata.updated',
        actorKind,
        conversationId: id,
        entityKind: 'conversation',
        entityId: id,
        payload: {
          action,
          title: action === 'rename' ? value?.trim().slice(0, 160) : undefined
        }
      })
      notifyTaskChange({ conversationId: id, entityId: id, kind: 'metadata' })
      return deps.getConversation(id)
    },

    previewDelete,

    delete(taskId: string, previewToken: string, actorKind: EventActorKind = 'model') {
      const id = conversationNodeId(taskId)
      const preview = previews.get(previewToken)
      previews.delete(previewToken)
      if (!preview || preview.taskId !== id || preview.expiresAt < deps.now()) {
        throw new Error('delete_task requires a fresh matching preview token')
      }
      if (preview.activeNodeIds.length) {
        throw new Error(
          `delete_task blocked by active descendants: ${preview.activeNodeIds.join(', ')}`
        )
      }
      const current = previewDelete(taskId)
      previews.delete(current.previewToken)
      if (
        JSON.stringify(current.conversationIds.sort()) !==
        JSON.stringify([...preview.conversationIds].sort())
      ) {
        throw new Error('task descendants changed after preview; preview again')
      }
      deps.deleteAuxiliary(preview)
      for (const conversationId of [...preview.conversationIds].reverse()) {
        deps.deleteConversation(conversationId)
      }
      deps.record({
        type: 'task.deleted',
        actorKind,
        severity: 'warning',
        entityKind: 'conversation',
        entityId: id.slice('conversation:'.length),
        payload: {
          disposition: 'permanent',
          conversationCount: preview.conversationIds.length,
          agentRunCount: preview.agentRunIds.length,
          identityCount: preview.identityIds.length,
          turnCount: preview.turnIds.length
        }
      })
      return { deleted: true, ...preview }
    }
  }
}

export const taskLifecycle = createTaskLifecycleService({
  graph: productionGraph,
  getConversation: conversationStore.getConversation,
  updateTitle: conversationStore.updateConversationTitle,
  setPinned: conversationStore.setConversationPinned,
  setArchived: conversationStore.setConversationArchived,
  setClosed: conversationStore.setConversationClosed,
  deleteConversation: conversationStore.deleteConversation,
  deleteAuxiliary: productionDeleteAuxiliary,
  record: recordEvent,
  now: Date.now,
  newToken: randomUUID
})
