import { recordEvent, type EventActorKind, type RecordEventInput } from './event-log'
import type { FollowUpRecord } from './turn-control-store'
import type { FollowUpRejection, TurnInputItem } from './turn-control-types'

export type FollowUpAuditDisposition =
  | 'accepted'
  | 'queued'
  | 'edited'
  | 'reordered'
  | 'delivered'
  | 'rejected'
  | 'deleted'
  | 'recovered'

export const TURN_CONTROL_EVENT_ITEM_CAP = 64

const EVENT_TYPE_BY_DISPOSITION = {
  accepted: 'turn.followup.accepted',
  queued: 'turn.followup.queued',
  edited: 'turn.followup.edited',
  reordered: 'turn.followup.reordered',
  delivered: 'turn.followup.delivered',
  rejected: 'turn.followup.rejected',
  deleted: 'turn.followup.deleted',
  recovered: 'turn.followup.recovered'
} as const

function actorKind(actor: FollowUpRecord['actor'] | undefined): EventActorKind {
  if (actor === 'model') return 'model'
  if (actor === 'system') return 'system'
  return 'user'
}

function inputShape(input: readonly TurnInputItem[]): {
  inputItemCount: number
  inputTypes: TurnInputItem['type'][]
} {
  return {
    inputItemCount: input.length,
    inputTypes: input.slice(0, TURN_CONTROL_EVENT_ITEM_CAP).map((item) => item.type)
  }
}

export function buildFollowUpAuditEvent(
  record: FollowUpRecord,
  disposition: FollowUpAuditDisposition,
  options: { correlationId?: string; previousStatus?: string; action?: string } = {}
): RecordEventInput {
  return {
    type: EVENT_TYPE_BY_DISPOSITION[disposition],
    severity: disposition === 'rejected' || disposition === 'recovered' ? 'warning' : 'info',
    conversationId: record.conversationId,
    correlationId: options.correlationId,
    actorKind: actorKind(record.actor),
    entityKind: 'turn-followup',
    entityId: record.id,
    payload: {
      followUpId: record.id,
      turnId: record.turnId,
      expectedTurnId: record.expectedTurnId,
      clientUserMessageId: record.clientUserMessageId,
      deliveryMode: record.deliveryMode,
      disposition,
      recordStatus: record.status,
      previousStatus: options.previousStatus,
      action: options.action,
      actor: record.actor,
      sourceConversationId: record.sourceConversationId,
      sourceTaskId: record.sourceTaskId,
      targetAgentRunId: record.targetAgentRunId,
      position: record.position,
      rejectionReason: record.rejectionReason,
      hasRecoveryReason: Boolean(record.recoveryReason),
      ...inputShape(record.input)
    },
    redaction: 'metadata'
  }
}

function boundedId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : undefined
}

function recordShape(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

export function buildSubmissionRejectedEvent(
  raw: unknown,
  requestedMode: 'steer' | 'queue',
  rejection: FollowUpRejection
): RecordEventInput {
  const request = recordShape(raw)
  const input = Array.isArray(request.input) ? request.input : []
  const inputTypes = input
    .slice(0, TURN_CONTROL_EVENT_ITEM_CAP)
    .map((item) => recordShape(item).type)
    .filter(
      (type): type is TurnInputItem['type'] =>
        type === 'text' || type === 'image' || type === 'localImage'
    )
  const actor = request.actor === 'model' || request.actor === 'system' ? request.actor : 'user'
  const clientUserMessageId = boundedId(request.clientUserMessageId)
  const expectedTurnId = boundedId(request.expectedTurnId)
  return {
    type: 'turn.followup.rejected',
    severity: 'warning',
    conversationId: boundedId(request.conversationId),
    actorKind: actorKind(actor),
    entityKind: 'turn-followup-attempt',
    entityId: clientUserMessageId ?? expectedTurnId,
    payload: {
      clientUserMessageId,
      expectedTurnId,
      targetAgentRunId: boundedId(request.targetAgentRunId),
      deliveryMode: requestedMode,
      disposition: 'rejected',
      rejectionReason: rejection.reason,
      field: rejection.field,
      inputItemCount: input.length,
      inputTypes,
      inputTypesTruncated: input.length > TURN_CONTROL_EVENT_ITEM_CAP
    },
    redaction: 'metadata'
  }
}

export function buildQueueReorderedEvent(
  conversationId: string,
  records: readonly FollowUpRecord[]
): RecordEventInput {
  return {
    type: 'turn.followup.reordered',
    conversationId,
    actorKind: 'user',
    entityKind: 'turn-followup-queue',
    entityId: conversationId,
    payload: {
      disposition: 'reordered',
      followUpIds: records.slice(0, TURN_CONTROL_EVENT_ITEM_CAP).map((record) => record.id),
      count: records.length,
      idsTruncated: records.length > TURN_CONTROL_EVENT_ITEM_CAP
    },
    redaction: 'metadata'
  }
}

export function tryRecordTurnControlEvent(
  input: RecordEventInput,
  writer: (event: RecordEventInput) => unknown = recordEvent,
  reportError: (message: string, error: unknown) => void = (message, error) =>
    console.error(message, error)
): void {
  try {
    writer(input)
  } catch (error) {
    reportError('[turn-control-events] event write failed', error)
  }
}

export function recordFollowUpAuditEvent(
  record: FollowUpRecord,
  disposition: FollowUpAuditDisposition,
  options: { correlationId?: string; previousStatus?: string; action?: string } = {}
): void {
  tryRecordTurnControlEvent(buildFollowUpAuditEvent(record, disposition, options))
}
