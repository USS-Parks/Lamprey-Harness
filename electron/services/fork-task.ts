import { randomUUID } from 'crypto'
import * as conversationStore from './conversation-store'
import { TurnControlStore, type ConversationTurnRecord } from './turn-control-store'
import { copyAttachments } from './rag/store'
import { recordEvent } from './event-log'
import type { WorktreeManager } from './worktree-runner'
import { notifyTaskChange } from './task-wait-signal'
import { getDb } from './database'

export interface ForkTaskAtTurnInput {
  sourceConversationId: string
  turnId: string
  title?: string | null
  includeRagAttachments?: boolean
  isolateWorktree?: boolean
}

export interface ForkTaskAtTurnResult {
  conversationId: string
  sourceConversationId: string
  sourceTurnId: string
  copiedMessageCount: number
  copiedAttachmentCount: number
  worktreePath: string | null
  branch: string | null
}

export interface ForkTaskDependencies {
  getConversation?: typeof conversationStore.getConversation
  getMessages?: typeof conversationStore.getMessages
  createConversation?: typeof conversationStore.createConversation
  updateConversationTitle?: typeof conversationStore.updateConversationTitle
  saveMessage?: typeof conversationStore.saveMessage
  transaction?: <T>(write: () => T) => T
  listTurns?: (conversationId: string) => ConversationTurnRecord[]
  copyAttachments?: typeof copyAttachments
  worktreeManager?: WorktreeManager | null
  record?: typeof recordEvent
  newId?: () => string
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

export async function forkTaskAtTurn(
  input: ForkTaskAtTurnInput,
  deps: ForkTaskDependencies = {}
): Promise<ForkTaskAtTurnResult> {
  const sourceConversationId = requiredId(input.sourceConversationId, 'sourceConversationId')
  const turnId = requiredId(input.turnId, 'turnId')
  const getConversation = deps.getConversation ?? conversationStore.getConversation
  const getMessages = deps.getMessages ?? conversationStore.getMessages
  const createConversation = deps.createConversation ?? conversationStore.createConversation
  const updateTitle = deps.updateConversationTitle ?? conversationStore.updateConversationTitle
  const saveMessage = deps.saveMessage ?? conversationStore.saveMessage
  const transaction = deps.transaction ?? (<T>(write: () => T): T => getDb().transaction(write)())
  const listTurns = deps.listTurns ?? ((id) => new TurnControlStore().listTurns(id))
  const source = getConversation(sourceConversationId)
  if (!source) throw new Error('fork_task: source task not found')
  const turn = listTurns(sourceConversationId).find((candidate) => candidate.id === turnId)
  if (!turn) throw new Error('fork_task: turn does not belong to the source task')
  if (turn.status === 'running' || turn.completedAt === null) {
    throw new Error('fork_task: turn must be completed')
  }

  const boundaryMessages = getMessages(sourceConversationId).filter(
    (message) => message.timestamp <= turn.completedAt!
  )
  const forkId = deps.newId?.() ?? randomUUID()
  const worktree =
    input.isolateWorktree && deps.worktreeManager ? await deps.worktreeManager.create(forkId) : null
  let result: ForkTaskAtTurnResult
  try {
    result = transaction(() => {
      const child = createConversation(source.model, {
        kind: worktree ? 'worktree' : 'local',
        worktreePath: worktree?.path ?? null,
        projectId: source.projectId ?? null,
        forkedFromId: sourceConversationId,
        forkedFromTurnId: turnId,
        seedSourceKind: 'transcript-range',
        seedBlob: {
          sourceConversationId,
          kind: 'transcript-range',
          contentPreview: `Historical fork through turn ${turnId}`,
          seedBytes: boundaryMessages.reduce(
            (sum, message) => sum + Buffer.byteLength(message.content, 'utf8'),
            0
          )
        }
      })
      for (const message of boundaryMessages) {
        saveMessage({
          id: randomUUID(),
          conversationId: child.id,
          role: message.role,
          content: message.content,
          model: message.model,
          toolCallId: message.toolCallId,
          toolCalls: message.toolCalls,
          reasoning: message.reasoning,
          documents: message.documents,
          stage: message.stage,
          proofStatus: message.proofStatus
        })
      }
      const copiedAttachmentCount =
        input.includeRagAttachments === false
          ? 0
          : (deps.copyAttachments ?? copyAttachments)(sourceConversationId, child.id)
      updateTitle(child.id, input.title?.trim() || `${source.title} (fork at turn)`)
      const result: ForkTaskAtTurnResult = {
        conversationId: child.id,
        sourceConversationId,
        sourceTurnId: turnId,
        copiedMessageCount: boundaryMessages.length,
        copiedAttachmentCount,
        worktreePath: worktree?.path ?? null,
        branch: worktree?.branch ?? null
      }
      deps.record?.({
        type: 'conversation.forked',
        actorKind: 'model',
        conversationId: child.id,
        entityKind: 'conversation',
        entityId: child.id,
        payload: {
          sourceConversationId,
          sourceTurnId: turnId,
          copiedMessageCount: boundaryMessages.length,
          copiedAttachmentCount,
          historical: true
        }
      })
      return result
    })
  } catch (error) {
    if (worktree && deps.worktreeManager) {
      try {
        const cleanup = await deps.worktreeManager.finalize(worktree)
        if (cleanup.keep || cleanup.warning) {
          throw new Error(`Retained fork resource ${worktree.path} (${worktree.branch}): ${cleanup.warning ?? 'worktree has changes'}`, { cause: error })
        }
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `Fork failed: ${String(error)}; worktree cleanup at ${worktree.path} (${worktree.branch}): ${String(cleanupError)}`, { cause: cleanupError })
      }
    }
    throw error
  }
  notifyTaskChange({ conversationId: sourceConversationId, entityId: result.conversationId, kind: 'fork' })
  return result
}
