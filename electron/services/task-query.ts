import { createHash } from 'crypto'
import { buildTaskGraph, collectTaskDescendants, type TaskGraphNode } from './task-graph'
import * as conversationStore from './conversation-store'
import * as agentRunStore from './agent-run-store'
import { listIdentitiesByScope } from './agent-identity-store'
import { TurnControlStore } from './turn-control-store'
import { subscribeTaskChanges, type TaskChangeSignal } from './task-wait-signal'

export interface TaskReadSnapshot {
  taskId: string
  cursor: string
  node: TaskGraphNode
  descendants: TaskGraphNode[]
  childCount: number
}

export interface WaitTaskTarget {
  taskId: string
  afterCursor?: string | null
}

export interface WaitTasksResult {
  reason: 'changed' | 'timeout' | 'cancelled'
  tasks: TaskReadSnapshot[]
  changedTaskIds: string[]
}

function graphForRead() {
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

function normalizeTaskId(taskId: string): string {
  const trimmed = taskId.trim()
  if (!trimmed) throw new Error('task id is required')
  if (/^(conversation|agent-run|identity|turn):/.test(trimmed)) return trimmed
  return `conversation:${trimmed}`
}

function snapshotCursor(node: TaskGraphNode, descendants: TaskGraphNode[]): string {
  const value = [node, ...descendants]
    .map((item) => `${item.id}:${item.status}:${item.updatedAt}`)
    .sort()
    .join('|')
  return createHash('sha256').update(value).digest('base64url').slice(0, 24)
}

export function listTaskSnapshots(
  input: {
    cursor?: string | null
    limit?: number
    rootConversationId?: string | null
  } = {}
) {
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
    {
      cursor: input.cursor,
      limit: input.limit,
      rootConversationId: input.rootConversationId,
      includeKinds: ['conversation']
    }
  )
}

export function readTaskSnapshot(taskId: string, descendantLimit = 100): TaskReadSnapshot {
  const graph = graphForRead()
  const normalized = normalizeTaskId(taskId)
  const node = graph.nodes.find((candidate) => candidate.id === normalized)
  if (!node) throw new Error(`task not found: ${taskId}`)
  const descendants = collectTaskDescendants(
    graph,
    normalized,
    Math.min(Math.max(descendantLimit, 0), 200)
  )
  return {
    taskId: normalized,
    cursor: snapshotCursor(node, descendants),
    node,
    descendants,
    childCount: descendants.length
  }
}

function signalMatches(signal: TaskChangeSignal, snapshots: TaskReadSnapshot[]): boolean {
  return snapshots.some((snapshot) => {
    if (
      signal.entityId &&
      (snapshot.node.id.endsWith(`:${signal.entityId}`) ||
        snapshot.descendants.some((node) => node.id.endsWith(`:${signal.entityId}`)))
    )
      return true
    return (
      signal.conversationId !== null &&
      (snapshot.node.ownerConversationId === signal.conversationId ||
        snapshot.descendants.some((node) => node.ownerConversationId === signal.conversationId))
    )
  })
}

export async function waitForTasks(
  targets: WaitTaskTarget[],
  options: {
    timeoutMs?: number
    signal?: AbortSignal
    read?: typeof readTaskSnapshot
    subscribe?: typeof subscribeTaskChanges
  } = {}
): Promise<WaitTasksResult> {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 8) {
    throw new Error('wait_tasks requires 1 to 8 targets')
  }
  const read = options.read ?? readTaskSnapshot
  const subscribe = options.subscribe ?? subscribeTaskChanges
  const initial = targets.map((target) => read(target.taskId))
  const changedImmediately = initial.filter((snapshot, index) => {
    const after = targets[index].afterCursor
    return typeof after === 'string' && after.length > 0 && after !== snapshot.cursor
  })
  if (changedImmediately.length) {
    return {
      reason: 'changed',
      tasks: initial,
      changedTaskIds: changedImmediately.map((task) => task.taskId)
    }
  }
  const timeoutMs = Math.min(Math.max(Math.floor(options.timeoutMs ?? 30_000), 0), 300_000)
  if (options.signal?.aborted) return { reason: 'cancelled', tasks: initial, changedTaskIds: [] }

  return new Promise<WaitTasksResult>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (reason: WaitTasksResult['reason'], changedTaskIds: string[] = []): void => {
      if (settled) return
      settled = true
      unsubscribe()
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      const tasks = targets.map((target) => read(target.taskId))
      resolve({ reason, tasks, changedTaskIds })
    }
    const onAbort = (): void => finish('cancelled')
    const unsubscribe = subscribe((signal) => {
      if (!signalMatches(signal, initial)) return
      const next = targets.map((target) => read(target.taskId))
      const changed = next.filter((snapshot, index) => snapshot.cursor !== initial[index].cursor)
      if (signal.kind === 'steer' || changed.length) {
        finish(
          'changed',
          changed.length ? changed.map((task) => task.taskId) : next.map((task) => task.taskId)
        )
      }
    })
    options.signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => finish('timeout'), timeoutMs)
  })
}
