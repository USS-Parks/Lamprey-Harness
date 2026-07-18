/**
 * Canonical main-process contracts for Steering and Queue.
 *
 * Keep the exported literal arrays in sync with src/lib/turn-control-types.ts.
 * The focused parity test locks that IPC-facing vocabulary across processes.
 */

type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type TurnId = Brand<string, 'TurnId'>
export type FollowUpId = Brand<string, 'FollowUpId'>
export type ClientUserMessageId = Brand<string, 'ClientUserMessageId'>

export const TURN_KINDS = ['regular', 'review', 'manualCompaction', 'terminal'] as const
export type TurnKind = (typeof TURN_KINDS)[number]

export const TURN_STATUSES = [
  'running',
  'completed',
  'interrupted',
  'cancelled',
  'failed',
  'recovered'
] as const
export type TurnStatus = (typeof TURN_STATUSES)[number]

export const FOLLOW_UP_DELIVERY_MODES = ['steer', 'queue'] as const
export type FollowUpDeliveryMode = (typeof FOLLOW_UP_DELIVERY_MODES)[number]

export const FOLLOW_UP_STATUSES = [
  'accepted',
  'queued',
  'delivered',
  'rejected',
  'cancelled',
  'recovered',
  'deleted'
] as const
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]

export const FOLLOW_UP_REJECTION_REASONS = [
  'noActiveTurn',
  'turnMismatch',
  'nonSteerableTurn',
  'turnNotRunning',
  'unsupportedInput',
  'invalidInput',
  'settingsOverride',
  'duplicateClientMessage',
  'targetNotFound',
  'targetNotSteerable',
  'staleFollowUp',
  'positionConflict'
] as const
export type FollowUpRejectionReason = (typeof FOLLOW_UP_REJECTION_REASONS)[number]

export const FOLLOW_UP_ACTORS = ['user', 'model', 'system'] as const
export type FollowUpActor = (typeof FOLLOW_UP_ACTORS)[number]

export interface TextTurnInputItem {
  type: 'text'
  text: string
}

export interface ImageTurnInputItem {
  type: 'image'
  imageUrl: string
  mimeType?: string
  name?: string
  sizeBytes?: number
  width?: number
  height?: number
}

export interface LocalImageTurnInputItem {
  type: 'localImage'
  path: string
  mimeType?: string
  name?: string
  sizeBytes?: number
  width?: number
  height?: number
}

export type TurnInputItem = TextTurnInputItem | ImageTurnInputItem | LocalImageTurnInputItem

export interface ActiveTurnIdentity {
  conversationId: string
  turnId: TurnId
  kind: TurnKind
  status: TurnStatus
}

export interface FollowUpSubmission {
  conversationId: string
  deliveryMode: FollowUpDeliveryMode
  input: TurnInputItem[]
  expectedTurnId?: TurnId
  clientUserMessageId?: ClientUserMessageId
  actor: FollowUpActor
  sourceConversationId?: string
  sourceTaskId?: string
  targetAgentRunId?: string
}

export interface FollowUpRejection {
  reason: FollowUpRejectionReason
  message: string
  expectedTurnId?: string
  activeTurnId?: string
  field?: string
}

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; rejection: FollowUpRejection }

export type ExpectedTurnGuardResult =
  { ok: true; turn: ActiveTurnIdentity } | { ok: false; rejection: FollowUpRejection }

const MAX_ID_LENGTH = 256
const MAX_INPUT_ITEMS = 32
const MAX_TEXT_LENGTH = 1_000_000
const MAX_METADATA_TEXT_LENGTH = 4096

const FOLLOW_UP_KEYS = new Set([
  'conversationId',
  'deliveryMode',
  'input',
  'expectedTurnId',
  'clientUserMessageId',
  'actor',
  'sourceConversationId',
  'sourceTaskId',
  'targetAgentRunId'
])

const SETTINGS_OVERRIDE_KEYS = new Set([
  'model',
  'workspace',
  'workspacePath',
  'approvalMode',
  'sandbox',
  'sandboxMode',
  'skillIds',
  'activeSkillIds',
  'turnKind'
])

function rejection(
  reason: FollowUpRejectionReason,
  message: string,
  extra: Omit<FollowUpRejection, 'reason' | 'message'> = {}
): ValidationResult<never> {
  return { ok: false, rejection: { reason, message, ...extra } }
}

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

function optionalMetadataText(value: unknown): value is string | undefined {
  return (
    value === undefined || (typeof value === 'string' && value.length <= MAX_METADATA_TEXT_LENGTH)
  )
}

function optionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isSafeInteger(value) && Number(value) >= 0)
}

function validateImageMetadata(
  item: Record<string, unknown>,
  field: string
): ValidationResult<true> {
  if (!optionalMetadataText(item.mimeType)) {
    return rejection('invalidInput', `${field}.mimeType must be a bounded string`, {
      field: `${field}.mimeType`
    })
  }
  if (typeof item.mimeType === 'string' && !item.mimeType.startsWith('image/')) {
    return rejection('unsupportedInput', `${field}.mimeType must be an image MIME type`, {
      field: `${field}.mimeType`
    })
  }
  if (!optionalMetadataText(item.name)) {
    return rejection('invalidInput', `${field}.name must be a bounded string`, {
      field: `${field}.name`
    })
  }
  for (const key of ['sizeBytes', 'width', 'height'] as const) {
    if (!optionalNonNegativeInteger(item[key])) {
      return rejection('invalidInput', `${field}.${key} must be a non-negative integer`, {
        field: `${field}.${key}`
      })
    }
  }
  return { ok: true, value: true }
}

export function validateTurnInputItems(value: unknown): ValidationResult<TurnInputItem[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_INPUT_ITEMS) {
    return rejection('invalidInput', `input must contain 1-${MAX_INPUT_ITEMS} ordered items`, {
      field: 'input'
    })
  }

  const items: TurnInputItem[] = []
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index]
    const field = `input[${index}]`
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      return rejection('invalidInput', `${field} must be a typed input object`, { field })
    }

    if (raw.type === 'text') {
      const allowed = new Set(['type', 'text'])
      if (Object.keys(raw).some((key) => !allowed.has(key))) {
        return rejection('invalidInput', `${field} contains unsupported fields`, { field })
      }
      if (
        typeof raw.text !== 'string' ||
        raw.text.length === 0 ||
        raw.text.length > MAX_TEXT_LENGTH
      ) {
        return rejection('invalidInput', `${field}.text must be non-empty and bounded`, {
          field: `${field}.text`
        })
      }
      items.push({ type: 'text', text: raw.text })
      continue
    }

    if (raw.type === 'image') {
      const allowed = new Set([
        'type',
        'imageUrl',
        'mimeType',
        'name',
        'sizeBytes',
        'width',
        'height'
      ])
      if (Object.keys(raw).some((key) => !allowed.has(key))) {
        return rejection('invalidInput', `${field} contains unsupported fields`, { field })
      }
      if (
        typeof raw.imageUrl !== 'string' ||
        raw.imageUrl.length === 0 ||
        raw.imageUrl.length > MAX_TEXT_LENGTH
      ) {
        return rejection('invalidInput', `${field}.imageUrl must be non-empty and bounded`, {
          field: `${field}.imageUrl`
        })
      }
      const metadata = validateImageMetadata(raw, field)
      if (!metadata.ok) return metadata
      items.push({
        type: 'image',
        imageUrl: raw.imageUrl,
        ...(raw.mimeType !== undefined ? { mimeType: raw.mimeType as string } : {}),
        ...(raw.name !== undefined ? { name: raw.name as string } : {}),
        ...(raw.sizeBytes !== undefined ? { sizeBytes: raw.sizeBytes as number } : {}),
        ...(raw.width !== undefined ? { width: raw.width as number } : {}),
        ...(raw.height !== undefined ? { height: raw.height as number } : {})
      })
      continue
    }

    if (raw.type === 'localImage') {
      const allowed = new Set(['type', 'path', 'mimeType', 'name', 'sizeBytes', 'width', 'height'])
      if (Object.keys(raw).some((key) => !allowed.has(key))) {
        return rejection('invalidInput', `${field} contains unsupported fields`, { field })
      }
      if (
        typeof raw.path !== 'string' ||
        raw.path.length === 0 ||
        raw.path.length > MAX_METADATA_TEXT_LENGTH ||
        raw.path.trim() !== raw.path
      ) {
        return rejection('invalidInput', `${field}.path must be non-empty and bounded`, {
          field: `${field}.path`
        })
      }
      const metadata = validateImageMetadata(raw, field)
      if (!metadata.ok) return metadata
      items.push({
        type: 'localImage',
        path: raw.path,
        ...(raw.mimeType !== undefined ? { mimeType: raw.mimeType as string } : {}),
        ...(raw.name !== undefined ? { name: raw.name as string } : {}),
        ...(raw.sizeBytes !== undefined ? { sizeBytes: raw.sizeBytes as number } : {}),
        ...(raw.width !== undefined ? { width: raw.width as number } : {}),
        ...(raw.height !== undefined ? { height: raw.height as number } : {})
      })
      continue
    }

    return rejection('unsupportedInput', `${field}.type is not supported`, {
      field: `${field}.type`
    })
  }

  return { ok: true, value: items }
}

export function validateFollowUpSubmission(value: unknown): ValidationResult<FollowUpSubmission> {
  if (!isRecord(value)) {
    return rejection('invalidInput', 'follow-up submission must be an object')
  }

  for (const key of Object.keys(value)) {
    if (SETTINGS_OVERRIDE_KEYS.has(key)) {
      return rejection('settingsOverride', `follow-up submissions cannot override ${key}`, {
        field: key
      })
    }
    if (!FOLLOW_UP_KEYS.has(key)) {
      return rejection('invalidInput', `unsupported follow-up field: ${key}`, { field: key })
    }
  }

  if (!isStrictId(value.conversationId)) {
    return rejection('invalidInput', 'conversationId must be a non-empty bounded ID', {
      field: 'conversationId'
    })
  }
  if (!FOLLOW_UP_DELIVERY_MODES.includes(value.deliveryMode as FollowUpDeliveryMode)) {
    return rejection('invalidInput', 'deliveryMode must be steer or queue', {
      field: 'deliveryMode'
    })
  }

  const input = validateTurnInputItems(value.input)
  if (!input.ok) return input

  if (value.deliveryMode === 'steer' && !isStrictId(value.expectedTurnId)) {
    return rejection('invalidInput', 'Steer requires expectedTurnId', {
      field: 'expectedTurnId'
    })
  }
  if (value.deliveryMode === 'queue' && value.expectedTurnId !== undefined) {
    return rejection('invalidInput', 'Queue cannot target an active turn', {
      field: 'expectedTurnId'
    })
  }
  if (value.clientUserMessageId !== undefined && !isStrictId(value.clientUserMessageId)) {
    return rejection('invalidInput', 'clientUserMessageId must be a non-empty bounded ID', {
      field: 'clientUserMessageId'
    })
  }
  if (value.actor !== undefined && !FOLLOW_UP_ACTORS.includes(value.actor as FollowUpActor)) {
    return rejection('invalidInput', 'actor is not supported', { field: 'actor' })
  }

  for (const key of ['sourceConversationId', 'sourceTaskId', 'targetAgentRunId'] as const) {
    if (value[key] !== undefined && !isStrictId(value[key])) {
      return rejection('invalidInput', `${key} must be a non-empty bounded ID`, { field: key })
    }
  }

  return {
    ok: true,
    value: {
      conversationId: value.conversationId,
      deliveryMode: value.deliveryMode as FollowUpDeliveryMode,
      input: input.value,
      ...(value.expectedTurnId !== undefined
        ? { expectedTurnId: value.expectedTurnId as TurnId }
        : {}),
      ...(value.clientUserMessageId !== undefined
        ? { clientUserMessageId: value.clientUserMessageId as ClientUserMessageId }
        : {}),
      actor: (value.actor as FollowUpActor | undefined) ?? 'user',
      ...(value.sourceConversationId !== undefined
        ? { sourceConversationId: value.sourceConversationId as string }
        : {}),
      ...(value.sourceTaskId !== undefined ? { sourceTaskId: value.sourceTaskId as string } : {}),
      ...(value.targetAgentRunId !== undefined
        ? { targetAgentRunId: value.targetAgentRunId as string }
        : {})
    }
  }
}

export function guardExpectedTurn(
  activeTurn: ActiveTurnIdentity | null | undefined,
  expectedTurnId: string
): ExpectedTurnGuardResult {
  if (!activeTurn) {
    return {
      ok: false,
      rejection: {
        reason: 'noActiveTurn',
        message: 'There is no active turn to steer.',
        expectedTurnId
      }
    }
  }
  if (activeTurn.turnId !== expectedTurnId) {
    return {
      ok: false,
      rejection: {
        reason: 'turnMismatch',
        message: 'The active turn no longer matches the requested turn.',
        expectedTurnId,
        activeTurnId: activeTurn.turnId
      }
    }
  }
  if (activeTurn.kind !== 'regular') {
    return {
      ok: false,
      rejection: {
        reason: 'nonSteerableTurn',
        message: `Turn kind ${activeTurn.kind} cannot be steered.`,
        expectedTurnId,
        activeTurnId: activeTurn.turnId
      }
    }
  }
  if (activeTurn.status !== 'running') {
    return {
      ok: false,
      rejection: {
        reason: 'turnNotRunning',
        message: `Turn status ${activeTurn.status} cannot accept Steering.`,
        expectedTurnId,
        activeTurnId: activeTurn.turnId
      }
    }
  }
  return { ok: true, turn: activeTurn }
}

export function clientMessageDedupeKey(
  conversationId: string,
  clientUserMessageId: string
): string {
  return JSON.stringify([conversationId, clientUserMessageId])
}

export function isTerminalTurnStatus(status: TurnStatus): boolean {
  return status !== 'running'
}

export function isTerminalFollowUpStatus(status: FollowUpStatus): boolean {
  return ['delivered', 'rejected', 'cancelled', 'recovered', 'deleted'].includes(status)
}
