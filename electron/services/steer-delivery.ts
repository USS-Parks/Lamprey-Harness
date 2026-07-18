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
import { recordFollowUpAuditEvent } from './turn-control-events'
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
        recordFollowUpAuditEvent(followUp, 'delivered', {
          correlationId: runtime.correlationId
        })
        return { message, followUp }
      },
      reject: (steer, reason) => {
        const rejected = store.transitionFollowUp(steer.followUpId, 'rejected', Date.now(), {
          rejectionReason: 'invalidInput',
          rejectionMessage: reason
        })
        recordFollowUpAuditEvent(rejected, 'rejected', {
          correlationId: runtime.correlationId
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
      const recovered = store.transitionFollowUp(steer.followUpId, 'recovered', Date.now(), {
        recoveryReason
      })
      recordFollowUpAuditEvent(recovered, 'recovered', {
        correlationId: runtime.correlationId
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
      const recoveredRecord = store.transitionFollowUp(
        pending[index].followUpId,
        'recovered',
        Date.now(),
        {
          recoveryReason: reason
        }
      )
      recordFollowUpAuditEvent(recoveredRecord, 'recovered', {
        correlationId: runtime.correlationId
      })
      recovered += 1
    } catch (err) {
      runtime.restoreSteers(pending.slice(index))
      throw err
    }
  }
  return recovered
}
