import { randomUUID } from 'crypto'
import { createTurnControlActions, type TurnControlEnvelope } from '../ipc/turn-control'
import { interruptTurn } from './turn-interrupt'
import { TurnControlStore, type FollowUpRecord } from './turn-control-store'
import { recordEvent } from './event-log'
import { turnRuntimeRegistry } from './turn-runtime'
import type { FollowUpId, InterruptTurnResult, TurnId } from './turn-control-types'

export type TaskDeliveryMode = 'queue' | 'steer'

export interface TaskDeliveryInput {
  targetConversationId: string
  body: string
  mode?: TaskDeliveryMode
  expectedTurnId?: string | null
  targetAgentRunId?: string | null
  sourceConversationId?: string | null
  sourceTaskId?: string | null
  clientUserMessageId?: string | null
}

export interface TaskDeliveryActions {
  queue(raw: unknown): TurnControlEnvelope<{ followUp: FollowUpRecord; duplicate: boolean }>
  steer(raw: unknown): TurnControlEnvelope<{ followUp: FollowUpRecord; duplicate: boolean }>
}

export interface TaskDeliveryDependencies {
  actions: TaskDeliveryActions
  interrupt: (raw: unknown) => TurnControlEnvelope<InterruptTurnResult>
  newClientId?: () => string
}

export interface TaskDeliveryReceipt {
  id: string
  targetConversationId: string
  mode: TaskDeliveryMode
  status: FollowUpRecord['status']
  duplicate: boolean
  createdAt: number
}

function clean(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new Error(`${field} exceeds ${max} characters`)
  return trimmed
}

export function createTaskDeliveryService(deps: TaskDeliveryDependencies) {
  return {
    send(input: TaskDeliveryInput): TaskDeliveryReceipt {
      const targetConversationId = clean(input.targetConversationId, 'targetConversationId', 256)
      const body = clean(input.body, 'body', 1_000_000)
      const mode = input.mode ?? 'queue'
      if (mode !== 'queue' && mode !== 'steer') throw new Error('mode must be queue or steer')
      if (mode === 'steer' && !input.expectedTurnId)
        throw new Error('Steer requires expectedTurnId')
      if (mode === 'queue' && input.expectedTurnId)
        throw new Error('Queue cannot target an active turn')
      const submission = {
        conversationId: targetConversationId,
        deliveryMode: mode,
        input: [{ type: 'text', text: body }],
        ...(mode === 'steer' ? { expectedTurnId: input.expectedTurnId as TurnId } : {}),
        clientUserMessageId: (input.clientUserMessageId ??
          deps.newClientId?.() ??
          randomUUID()) as never,
        actor: 'model' as const,
        ...(input.sourceConversationId ? { sourceConversationId: input.sourceConversationId } : {}),
        ...(input.sourceTaskId ? { sourceTaskId: input.sourceTaskId } : {}),
        ...(input.targetAgentRunId ? { targetAgentRunId: input.targetAgentRunId } : {})
      }
      const result =
        mode === 'steer' ? deps.actions.steer(submission) : deps.actions.queue(submission)
      if (!result.success) throw new Error(result.error)
      return {
        id: result.data.followUp.id,
        targetConversationId,
        mode,
        status: result.data.followUp.status,
        duplicate: result.data.duplicate,
        createdAt: result.data.followUp.createdAt
      }
    },

    interrupt(targetConversationId: string, expectedTurnId: string): InterruptTurnResult {
      const result = deps.interrupt({
        conversationId: clean(targetConversationId, 'targetConversationId', 256),
        expectedTurnId: clean(expectedTurnId, 'expectedTurnId', 256)
      })
      if (!result.success) throw new Error(result.error)
      return result.data
    }
  }
}

let productionActions: TaskDeliveryActions | null = null

function actions(): TaskDeliveryActions {
  productionActions ??= createTurnControlActions({
    store: new TurnControlStore(),
    runtimes: turnRuntimeRegistry,
    now: Date.now,
    newId: () => randomUUID() as FollowUpId,
    record: recordEvent,
    reportError: (message, error) => console.error(message, error)
  })
  return productionActions
}

export const taskDelivery = createTaskDeliveryService({
  get actions() {
    return actions()
  },
  interrupt: interruptTurn
})
