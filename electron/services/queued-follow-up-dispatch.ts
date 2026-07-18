import { randomUUID } from 'crypto'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import * as convStore from './conversation-store'
import { getDb } from './database'
import { emitChatEvent } from './chat-events'
import { emitTurnStarted } from './turn-lifecycle-events'
import {
  prepareSteerInput,
  type PreparedSteerInput,
  type SafeTurnInputMetadata
} from './steer-transcript'
import { recordFollowUpAuditEvent } from './turn-control-events'
import { TurnControlStore, type FollowUpRecord } from './turn-control-store'
import { turnRuntimeRegistry, type SettledTurnStatus, type TurnRuntime } from './turn-runtime'

export interface InjectedUserMessage {
  messageId: string
  apiMessage: ChatCompletionMessageParam
}

export interface QueuedFollowUpRunInput {
  conversationId: string
  model: string
  activeSkillIds: string[]
  promptBody: string
  runtime: TurnRuntime
  injectedUserMessage: InjectedUserMessage
}

export interface QueuedFollowUpCommitResult {
  message: { id: string } & Record<string, unknown>
  followUp: FollowUpRecord
}

export interface QueuedFollowUpDispatchDependencies {
  store: Pick<TurnControlStore, 'listQueuedFollowUps' | 'transitionFollowUp'>
  registerTurn(conversationId: string): TurnRuntime
  emitTurnStarted(runtime: TurnRuntime): void
  prepareInput(input: FollowUpRecord['input']): Promise<PreparedSteerInput>
  commitDelivery(input: {
    followUp: FollowUpRecord
    runtime: TurnRuntime
    model: string
    prepared: PreparedSteerInput
  }): QueuedFollowUpCommitResult
  emitUserMessage(input: {
    followUp: FollowUpRecord
    runtime: TurnRuntime
    message: unknown
    inputMetadata: SafeTurnInputMetadata[]
  }): void
  recordDisposition(
    followUp: FollowUpRecord,
    disposition: 'accepted' | 'delivered' | 'rejected',
    correlationId: string
  ): void
  settleTurn(runtime: TurnRuntime, status: SettledTurnStatus): void
  runTurn(input: QueuedFollowUpRunInput): Promise<unknown>
  now(): number
  reportError(message: string, error: unknown): void
}

export interface QueuedFollowUpDispatchInput {
  conversationId: string
  model: string
  activeSkillIds?: string[]
}

export type QueuedFollowUpDispatchResult =
  | { status: 'empty' }
  | { status: 'dispatched'; followUpId: string; turnId: string }
  | { status: 'rejected'; followUpId: string; turnId: string }
  | { status: 'failed'; followUpId: string; turnId: string }

const PREPARATION_REJECTION_MESSAGE =
  'Queued follow-up input could not be prepared. Reattach any unavailable input and retry.'

let productionStore: TurnControlStore | null = null

function getProductionStore(): TurnControlStore {
  productionStore ??= new TurnControlStore()
  return productionStore
}

export function createQueuedFollowUpDispatchDependencies(input: {
  runTurn(runInput: QueuedFollowUpRunInput): Promise<unknown>
  settleTurn(runtime: TurnRuntime, status: SettledTurnStatus): void
}): QueuedFollowUpDispatchDependencies {
  const store = getProductionStore()
  return {
    store,
    registerTurn: (conversationId) =>
      turnRuntimeRegistry.register({
        conversationId,
        correlationId: randomUUID(),
        kind: 'regular'
      }),
    emitTurnStarted,
    prepareInput: prepareSteerInput,
    commitDelivery: ({ followUp, runtime, model, prepared }) => {
      const deliveredAt = Date.now()
      let message!: ReturnType<typeof convStore.saveMessage>
      let delivered!: FollowUpRecord
      const commit = getDb().transaction(() => {
        message = convStore.saveMessage({
          id: randomUUID(),
          conversationId: runtime.conversationId,
          role: 'user',
          content: prepared.displayContent,
          model
        })
        delivered = store.transitionFollowUp(followUp.id, 'delivered', deliveredAt, {
          turnId: runtime.turnId
        })
      })
      commit()
      return { message, followUp: delivered }
    },
    emitUserMessage: ({ followUp, runtime, message, inputMetadata }) => {
      emitChatEvent('chat:user-message', {
        conversationId: runtime.conversationId,
        turnId: runtime.turnId,
        followUpId: followUp.id,
        clientUserMessageId: followUp.clientUserMessageId,
        targetAgentRunId: followUp.targetAgentRunId,
        message,
        inputMetadata
      })
    },
    recordDisposition: (followUp, disposition, correlationId) =>
      recordFollowUpAuditEvent(followUp, disposition, { correlationId }),
    settleTurn: input.settleTurn,
    runTurn: input.runTurn,
    now: Date.now,
    reportError: (message, error) => console.error(message, error)
  }
}

/**
 * Claim and execute one queued follow-up. Claiming is intentionally synchronous
 * through runtime registration and the queued -> accepted transition: the first
 * await happens only after the active-turn identity prevents a competing send.
 * Subsequent items are dispatched by the completed turn's canonical finally seam.
 */
export async function dispatchNextQueuedFollowUp(
  input: QueuedFollowUpDispatchInput,
  deps: QueuedFollowUpDispatchDependencies
): Promise<QueuedFollowUpDispatchResult> {
  const followUp = deps.store.listQueuedFollowUps(input.conversationId)[0]
  if (!followUp) return { status: 'empty' }

  const runtime = deps.registerTurn(input.conversationId)
  deps.emitTurnStarted(runtime)

  let accepted: FollowUpRecord | null = null
  let prepared: PreparedSteerInput
  try {
    accepted = deps.store.transitionFollowUp(followUp.id, 'accepted', deps.now(), {
      turnId: runtime.turnId
    })
    deps.recordDisposition(accepted, 'accepted', runtime.correlationId)
    prepared = await deps.prepareInput(accepted.input)
  } catch (error) {
    if (accepted) {
      try {
        const rejected = deps.store.transitionFollowUp(accepted.id, 'rejected', deps.now(), {
          turnId: runtime.turnId,
          rejectionReason: 'invalidInput',
          rejectionMessage: PREPARATION_REJECTION_MESSAGE
        })
        deps.recordDisposition(rejected, 'rejected', runtime.correlationId)
      } catch (rejectionError) {
        deps.reportError('[queue] failed to persist queued follow-up rejection', rejectionError)
      }
    }
    deps.settleTurn(runtime, 'failed')
    deps.reportError('[queue] queued follow-up dispatch failed', error)
    return {
      status: accepted ? 'rejected' : 'failed',
      followUpId: followUp.id,
      turnId: runtime.turnId
    }
  }

  let committed: QueuedFollowUpCommitResult
  try {
    committed = deps.commitDelivery({
      followUp: accepted,
      runtime,
      model: input.model,
      prepared
    })
  } catch (error) {
    try {
      const rejected = deps.store.transitionFollowUp(accepted.id, 'rejected', deps.now(), {
        turnId: runtime.turnId,
        rejectionReason: 'invalidInput',
        rejectionMessage: PREPARATION_REJECTION_MESSAGE
      })
      deps.recordDisposition(rejected, 'rejected', runtime.correlationId)
    } catch (rejectionError) {
      deps.reportError('[queue] failed to persist queued follow-up rejection', rejectionError)
    }
    deps.settleTurn(runtime, 'failed')
    deps.reportError('[queue] queued follow-up commit failed', error)
    return { status: 'rejected', followUpId: followUp.id, turnId: runtime.turnId }
  }

  deps.recordDisposition(committed.followUp, 'delivered', runtime.correlationId)
  try {
    deps.emitUserMessage({
      followUp: committed.followUp,
      runtime,
      message: committed.message,
      inputMetadata: prepared.inputMetadata
    })
  } catch (error) {
    // Delivery is durable. A renderer reload must not strand the accepted
    // runtime or relabel the row; hydration will recover the persisted bubble.
    deps.reportError('[queue] queued follow-up renderer notification failed', error)
  }

  await deps.runTurn({
    conversationId: input.conversationId,
    model: input.model,
    activeSkillIds: input.activeSkillIds ?? [],
    promptBody: prepared.displayContent,
    runtime,
    injectedUserMessage: {
      messageId: committed.message.id,
      apiMessage: prepared.apiMessage
    }
  })
  return { status: 'dispatched', followUpId: followUp.id, turnId: runtime.turnId }
}
