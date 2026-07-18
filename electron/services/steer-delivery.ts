import { randomUUID } from 'crypto'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import * as convStore from './conversation-store'
import { getDb } from './database'
import { emitChatEvent } from './chat-events'
import {
  deliverSteersAtBoundary,
  recoverUndeliveredSteers,
  type SteerBoundaryResult
} from './steer-transcript'
import { TurnControlStore } from './turn-control-store'
import type { TurnRuntime } from './turn-runtime'

export type { SteerBoundaryResult } from './steer-transcript'

let deliveryStore: TurnControlStore | null = null

function getDeliveryStore(): TurnControlStore {
  deliveryStore ??= new TurnControlStore()
  return deliveryStore
}

/**
 * Persist and append accepted Steering for one exact transcript target. Root
 * delivery uses null; a steerable child uses its stable agent run id.
 */
export async function consumeSteersAtBoundary(
  runtime: TurnRuntime,
  messages: ChatCompletionMessageParam[],
  model: string,
  targetAgentRunId: string | null = null
): Promise<SteerBoundaryResult> {
  const store = getDeliveryStore()
  return deliverSteersAtBoundary(
    runtime,
    messages,
    {
      commit: (input) => {
        const deliveredAt = Date.now()
        let message!: ReturnType<typeof convStore.saveMessage>
        let followUp!: ReturnType<TurnControlStore['transitionFollowUp']>
        const commit = getDb().transaction(() => {
          message = convStore.saveMessage({
            id: randomUUID(),
            conversationId: runtime.conversationId,
            role: 'user',
            content: input.displayContent,
            model
          })
          followUp = store.transitionFollowUp(input.steer.followUpId, 'delivered', deliveredAt, {
            turnId: runtime.turnId
          })
        })
        commit()
        return { message, followUp }
      },
      reject: (steer, reason) => {
        store.transitionFollowUp(steer.followUpId, 'rejected', Date.now(), {
          rejectionReason: 'invalidInput',
          rejectionMessage: reason
        })
      },
      emit: (input) => {
        emitChatEvent('chat:user-message', {
          conversationId: runtime.conversationId,
          turnId: runtime.turnId,
          followUpId: input.steer.followUpId,
          clientUserMessageId: input.steer.clientUserMessageId,
          targetAgentRunId: input.steer.targetAgentRunId,
          message: input.message,
          inputMetadata: input.inputMetadata
        })
      }
    },
    targetAgentRunId
  )
}

export function recoverPendingRuntimeSteers(runtime: TurnRuntime, reason: string): number {
  const store = getDeliveryStore()
  return recoverUndeliveredSteers(
    runtime,
    (steer, recoveryReason) => {
      store.transitionFollowUp(steer.followUpId, 'recovered', Date.now(), {
        recoveryReason
      })
    },
    reason
  )
}

export function recoverTargetSteers(
  runtime: TurnRuntime,
  targetAgentRunId: string,
  reason: string
): number {
  const pending = runtime.drainSteers(targetAgentRunId)
  if (pending.length === 0) return 0
  const store = getDeliveryStore()
  let recovered = 0
  for (let index = 0; index < pending.length; index += 1) {
    try {
      store.transitionFollowUp(pending[index].followUpId, 'recovered', Date.now(), {
        recoveryReason: reason
      })
      recovered += 1
    } catch (err) {
      runtime.restoreSteers(pending.slice(index))
      throw err
    }
  }
  return recovered
}
