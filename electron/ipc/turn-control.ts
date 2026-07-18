import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'
import {
  TurnControlStore,
  type CreateFollowUpResult,
  type FollowUpRecord
} from '../services/turn-control-store'
import { turnRuntimeRegistry, type PendingSteer, type TurnRuntime } from '../services/turn-runtime'
import {
  validateFollowUpSubmission,
  validateTurnInputItems,
  type DeleteFollowUpRequest,
  type FollowUpId,
  type FollowUpRejection,
  type FollowUpSubmission,
  type QueueFollowUpSubmission,
  type ReorderFollowUpsRequest,
  type SendFollowUpNowRequest,
  type SteerFollowUpSubmission,
  type TurnId,
  type UpdateFollowUpRequest
} from '../services/turn-control-types'

export type TurnControlEnvelope<T> =
  { success: true; data: T } | { success: false; error: string; rejection?: FollowUpRejection }

export interface TurnControlStoreLike {
  createFollowUp(input: {
    id: FollowUpId
    submission: FollowUpSubmission
    createdAt: number
  }): CreateFollowUpResult
  findByClientMessageId(conversationId: string, clientUserMessageId: string): FollowUpRecord | null
  getFollowUp(id: string): FollowUpRecord | null
  listFollowUps(conversationId: string): FollowUpRecord[]
  updateFollowUpInput(
    id: string,
    input: FollowUpSubmission['input'],
    updatedAt: number
  ): FollowUpRecord
  reorderQueuedFollowUps(
    conversationId: string,
    orderedIds: readonly string[],
    updatedAt: number
  ): FollowUpRecord[]
  transitionFollowUp: TurnControlStore['transitionFollowUp']
}

export interface TurnRuntimeRegistryLike {
  lookupExpected: typeof turnRuntimeRegistry.lookupExpected
  lookupActive(conversationId: string): TurnRuntime | null
}

export interface TurnControlDependencies {
  store: TurnControlStoreLike
  runtimes: TurnRuntimeRegistryLike
  now: () => number
  newId: () => FollowUpId
}

const MAX_ID_LENGTH = 256

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStrictId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value
  )
}

function failed<T = never>(rejection: FollowUpRejection): TurnControlEnvelope<T> {
  return { success: false, error: rejection.message, rejection }
}

function invalid(message: string, field?: string): TurnControlEnvelope<never> {
  return failed({ reason: 'invalidInput', message, ...(field ? { field } : {}) })
}

function fromError<T>(err: unknown, fallback: string): TurnControlEnvelope<T> {
  return { success: false, error: err instanceof Error ? err.message : fallback }
}

function sameInput(left: FollowUpSubmission['input'], right: FollowUpSubmission['input']): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function requestMatchesRecord(submission: FollowUpSubmission, record: FollowUpRecord): boolean {
  return (
    submission.deliveryMode === record.deliveryMode &&
    (submission.expectedTurnId ?? null) === record.expectedTurnId &&
    submission.actor === record.actor &&
    (submission.sourceConversationId ?? null) === record.sourceConversationId &&
    (submission.sourceTaskId ?? null) === record.sourceTaskId &&
    (submission.targetAgentRunId ?? null) === record.targetAgentRunId &&
    sameInput(submission.input, record.input)
  )
}

function validateManagementRequest(
  raw: unknown,
  keys: readonly string[]
): TurnControlEnvelope<Record<string, unknown>> {
  if (!isRecord(raw)) return invalid('request must be an object')
  const allowed = new Set(keys)
  const unsupported = Object.keys(raw).find((key) => !allowed.has(key))
  if (unsupported) return invalid(`unsupported request field: ${unsupported}`, unsupported)
  if (!isStrictId(raw.conversationId)) {
    return invalid('conversationId must be a non-empty bounded ID', 'conversationId')
  }
  if ('followUpId' in raw && !isStrictId(raw.followUpId)) {
    return invalid('followUpId must be a non-empty bounded ID', 'followUpId')
  }
  return { success: true, data: raw }
}

function ownsFollowUp(
  record: FollowUpRecord | null,
  conversationId: string
): TurnControlEnvelope<FollowUpRecord> {
  if (!record || record.conversationId !== conversationId) {
    return failed({
      reason: 'staleFollowUp',
      message: 'The follow-up no longer exists in this conversation.'
    })
  }
  return { success: true, data: record }
}

function toPendingSteer(record: FollowUpRecord, receivedAt: number): PendingSteer {
  return {
    followUpId: record.id,
    input: record.input,
    clientUserMessageId: record.clientUserMessageId,
    targetAgentRunId: record.targetAgentRunId,
    receivedAt
  }
}

export function createTurnControlActions(deps: TurnControlDependencies) {
  function submit(
    raw: unknown,
    expectedMode: 'steer' | 'queue'
  ): TurnControlEnvelope<{ followUp: FollowUpRecord; duplicate: boolean }> {
    const validated = validateFollowUpSubmission(raw)
    if (!validated.ok) return failed(validated.rejection)
    const submission = validated.value
    if (submission.deliveryMode !== expectedMode) {
      return invalid(`turn:${expectedMode} requires deliveryMode ${expectedMode}`, 'deliveryMode')
    }

    if (submission.clientUserMessageId) {
      const existing = deps.store.findByClientMessageId(
        submission.conversationId,
        submission.clientUserMessageId
      )
      if (existing) {
        if (!requestMatchesRecord(submission, existing)) {
          return failed({
            reason: 'duplicateClientMessage',
            message: 'clientUserMessageId is already bound to a different follow-up.'
          })
        }
        return { success: true, data: { followUp: existing, duplicate: true } }
      }
    }

    let runtime: TurnRuntime | null = null
    if (expectedMode === 'steer') {
      const guarded = deps.runtimes.lookupExpected(
        submission.conversationId,
        submission.expectedTurnId!
      )
      if (!guarded.ok) return failed(guarded.rejection)
      runtime = deps.runtimes.lookupActive(submission.conversationId)
      if (!runtime || runtime.turnId !== guarded.turn.turnId) {
        return failed({
          reason: 'turnNotRunning',
          message: 'The active turn settled before Steering could be accepted.',
          expectedTurnId: submission.expectedTurnId
        })
      }
    }

    try {
      const created = deps.store.createFollowUp({
        id: deps.newId(),
        submission,
        createdAt: deps.now()
      })
      if (created.duplicate) {
        if (!requestMatchesRecord(submission, created.record)) {
          return failed({
            reason: 'duplicateClientMessage',
            message: 'clientUserMessageId was concurrently bound to a different follow-up.'
          })
        }
        return { success: true, data: { followUp: created.record, duplicate: true } }
      }
      if (runtime) {
        try {
          runtime.enqueueSteer(toPendingSteer(created.record, deps.now()))
        } catch (err) {
          deps.store.transitionFollowUp(created.record.id, 'rejected', deps.now(), {
            rejectionReason: 'turnNotRunning',
            rejectionMessage:
              err instanceof Error ? err.message : 'The active turn settled before delivery.'
          })
          return failed({
            reason: 'turnNotRunning',
            message: 'The active turn settled before Steering could be retained.',
            expectedTurnId: submission.expectedTurnId
          })
        }
      }
      return {
        success: true,
        data: { followUp: created.record, duplicate: false }
      }
    } catch (err) {
      return fromError(err, `turn:${expectedMode} failed`)
    }
  }

  return {
    steer: (raw: unknown) =>
      submit(raw, 'steer') as TurnControlEnvelope<{
        followUp: FollowUpRecord
        duplicate: boolean
      }>,

    queue: (raw: unknown) =>
      submit(raw, 'queue') as TurnControlEnvelope<{
        followUp: FollowUpRecord
        duplicate: boolean
      }>,

    listFollowUps(conversationId: unknown): TurnControlEnvelope<FollowUpRecord[]> {
      if (!isStrictId(conversationId)) {
        return invalid('conversationId must be a non-empty bounded ID', 'conversationId')
      }
      try {
        return { success: true, data: deps.store.listFollowUps(conversationId) }
      } catch (err) {
        return fromError(err, 'turn:listFollowups failed')
      }
    },

    updateFollowUp(raw: unknown): TurnControlEnvelope<FollowUpRecord> {
      const request = validateManagementRequest(raw, ['conversationId', 'followUpId', 'input'])
      if (!request.success) return request
      const input = validateTurnInputItems(request.data.input)
      if (!input.ok) return failed(input.rejection)
      const existing = ownsFollowUp(
        deps.store.getFollowUp(request.data.followUpId as string),
        request.data.conversationId as string
      )
      if (!existing.success) return existing
      try {
        return {
          success: true,
          data: deps.store.updateFollowUpInput(existing.data.id, input.value, deps.now())
        }
      } catch (err) {
        return failed({
          reason: 'staleFollowUp',
          message: err instanceof Error ? err.message : 'Follow-up is no longer editable.'
        })
      }
    },

    reorderFollowUps(raw: unknown): TurnControlEnvelope<FollowUpRecord[]> {
      const request = validateManagementRequest(raw, ['conversationId', 'orderedIds'])
      if (!request.success) return request
      if (
        !Array.isArray(request.data.orderedIds) ||
        request.data.orderedIds.some((id) => !isStrictId(id)) ||
        new Set(request.data.orderedIds).size !== request.data.orderedIds.length
      ) {
        return failed({
          reason: 'positionConflict',
          message: 'orderedIds must contain unique bounded follow-up IDs.',
          field: 'orderedIds'
        })
      }
      try {
        return {
          success: true,
          data: deps.store.reorderQueuedFollowUps(
            request.data.conversationId as string,
            request.data.orderedIds as string[],
            deps.now()
          )
        }
      } catch (err) {
        return failed({
          reason: 'positionConflict',
          message: err instanceof Error ? err.message : 'Queue order changed before the update.'
        })
      }
    },

    sendFollowUpNow(raw: unknown): TurnControlEnvelope<FollowUpRecord> {
      const request = validateManagementRequest(raw, [
        'conversationId',
        'followUpId',
        'expectedTurnId'
      ])
      if (!request.success) return request
      if (!isStrictId(request.data.expectedTurnId)) {
        return invalid('send-now requires expectedTurnId', 'expectedTurnId')
      }
      const existing = ownsFollowUp(
        deps.store.getFollowUp(request.data.followUpId as string),
        request.data.conversationId as string
      )
      if (!existing.success) return existing
      if (existing.data.deliveryMode !== 'queue' || existing.data.status !== 'queued') {
        return failed({
          reason: 'staleFollowUp',
          message: 'Only a currently queued follow-up can be sent now.'
        })
      }
      const guarded = deps.runtimes.lookupExpected(
        request.data.conversationId as string,
        request.data.expectedTurnId
      )
      if (!guarded.ok) return failed(guarded.rejection)
      const runtime = deps.runtimes.lookupActive(request.data.conversationId as string)
      if (!runtime || runtime.turnId !== guarded.turn.turnId) {
        return failed({
          reason: 'turnNotRunning',
          message: 'The active turn settled before the queued item could be sent.',
          expectedTurnId: request.data.expectedTurnId
        })
      }
      let accepted: FollowUpRecord
      try {
        accepted = deps.store.transitionFollowUp(existing.data.id, 'accepted', deps.now(), {
          turnId: runtime.turnId,
          expectedTurnId: runtime.turnId
        })
      } catch (err) {
        return fromError(err, 'turn:sendFollowupNow failed')
      }
      try {
        runtime.enqueueSteer(toPendingSteer(accepted, deps.now()))
        return { success: true, data: accepted }
      } catch (err) {
        deps.store.transitionFollowUp(accepted.id, 'rejected', deps.now(), {
          rejectionReason: 'turnNotRunning',
          rejectionMessage:
            err instanceof Error ? err.message : 'The active turn settled before delivery.'
        })
        return failed({
          reason: 'turnNotRunning',
          message: 'The active turn settled before the queued item could be retained.',
          expectedTurnId: request.data.expectedTurnId
        })
      }
    },

    deleteFollowUp(raw: unknown): TurnControlEnvelope<FollowUpRecord> {
      const request = validateManagementRequest(raw, ['conversationId', 'followUpId'])
      if (!request.success) return request
      const existing = ownsFollowUp(
        deps.store.getFollowUp(request.data.followUpId as string),
        request.data.conversationId as string
      )
      if (!existing.success) return existing
      try {
        return {
          success: true,
          data: deps.store.transitionFollowUp(existing.data.id, 'deleted', deps.now())
        }
      } catch (err) {
        return failed({
          reason: 'staleFollowUp',
          message: err instanceof Error ? err.message : 'Follow-up can no longer be deleted.'
        })
      }
    }
  }
}

export function registerTurnControlHandlers(
  dependencies: TurnControlDependencies = {
    store: new TurnControlStore(),
    runtimes: turnRuntimeRegistry,
    now: Date.now,
    newId: () => randomUUID() as FollowUpId
  }
): void {
  const actions = createTurnControlActions(dependencies)
  ipcMain.handle('turn:steer', async (_event, raw: SteerFollowUpSubmission) => actions.steer(raw))
  ipcMain.handle('turn:queue', async (_event, raw: QueueFollowUpSubmission) => actions.queue(raw))
  ipcMain.handle('turn:listFollowups', async (_event, conversationId: unknown) =>
    actions.listFollowUps(conversationId)
  )
  ipcMain.handle('turn:updateFollowup', async (_event, raw: UpdateFollowUpRequest) =>
    actions.updateFollowUp(raw)
  )
  ipcMain.handle('turn:reorderFollowups', async (_event, raw: ReorderFollowUpsRequest) =>
    actions.reorderFollowUps(raw)
  )
  ipcMain.handle('turn:sendFollowupNow', async (_event, raw: SendFollowUpNowRequest) =>
    actions.sendFollowUpNow(raw)
  )
  ipcMain.handle('turn:deleteFollowup', async (_event, raw: DeleteFollowUpRequest) =>
    actions.deleteFollowUp(raw)
  )
}
