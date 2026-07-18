/** Renderer mirror of the canonical contracts in electron/services/turn-control-types.ts. */

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
