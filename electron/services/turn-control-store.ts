import type Database from 'better-sqlite3'
import { getDb } from './database'
import {
  isTerminalFollowUpStatus,
  isTerminalTurnStatus,
  validateFollowUpSubmission,
  validateTurnInputItems,
  type ClientUserMessageId,
  type FollowUpActor,
  type FollowUpDeliveryMode,
  type FollowUpId,
  type FollowUpRejectionReason,
  type FollowUpStatus,
  type FollowUpSubmission,
  type TurnId,
  type TurnInputItem,
  type TurnKind,
  type TurnStatus
} from './turn-control-types'

export const TURN_INPUT_VERSION = 1 as const

export const INSERT_TURN_SQL = `
  INSERT INTO conversation_turns
    (id, conversation_id, kind, status, correlation_id, active_agent_run_id,
     started_at, completed_at, recovery_reason, created_at, updated_at)
  VALUES (?, ?, ?, 'running', ?, ?, ?, NULL, NULL, ?, ?)
`

export const INSERT_FOLLOW_UP_SQL = `
  INSERT INTO turn_followups
    (id, conversation_id, turn_id, expected_turn_id, client_user_message_id,
     delivery_mode, status, input_version, input_json, position, actor,
     source_conversation_id, source_task_id, target_agent_run_id,
     created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
`

export const RECOVER_RUNNING_TURNS_SQL = `
  UPDATE conversation_turns
     SET status = 'recovered', completed_at = ?, recovery_reason = ?, updated_at = ?
   WHERE status = 'running'
`

export const RECOVER_ACCEPTED_STEERS_SQL = `
  UPDATE turn_followups
     SET status = 'recovered', recovery_reason = ?, finalized_at = ?, updated_at = ?
   WHERE status = 'accepted'
`

export interface ConversationTurnRecord {
  id: TurnId
  conversationId: string
  kind: TurnKind
  status: TurnStatus
  correlationId: string | null
  activeAgentRunId: string | null
  startedAt: number
  completedAt: number | null
  recoveryReason: string | null
  createdAt: number
  updatedAt: number
}

export interface CreateTurnInput {
  id: TurnId
  conversationId: string
  kind: TurnKind
  correlationId?: string | null
  activeAgentRunId?: string | null
  startedAt: number
}

export interface FollowUpRecord {
  id: FollowUpId
  conversationId: string
  turnId: TurnId | null
  expectedTurnId: TurnId | null
  clientUserMessageId: ClientUserMessageId | null
  deliveryMode: FollowUpDeliveryMode
  status: FollowUpStatus
  inputVersion: typeof TURN_INPUT_VERSION
  input: TurnInputItem[]
  position: number | null
  actor: FollowUpActor
  sourceConversationId: string | null
  sourceTaskId: string | null
  targetAgentRunId: string | null
  rejectionReason: FollowUpRejectionReason | null
  rejectionMessage: string | null
  recoveryReason: string | null
  createdAt: number
  updatedAt: number
  deliveredAt: number | null
  finalizedAt: number | null
}

export interface CreateFollowUpInput {
  id: FollowUpId
  submission: FollowUpSubmission
  createdAt: number
}

export interface CreateFollowUpResult {
  record: FollowUpRecord
  duplicate: boolean
}

export interface FollowUpTransitionDetails {
  turnId?: TurnId
  rejectionReason?: FollowUpRejectionReason
  rejectionMessage?: string
  recoveryReason?: string
}

interface TurnDbRow {
  id: string
  conversation_id: string
  kind: TurnKind
  status: TurnStatus
  correlation_id: string | null
  active_agent_run_id: string | null
  started_at: number
  completed_at: number | null
  recovery_reason: string | null
  created_at: number
  updated_at: number
}

interface FollowUpDbRow {
  id: string
  conversation_id: string
  turn_id: string | null
  expected_turn_id: string | null
  client_user_message_id: string | null
  delivery_mode: FollowUpDeliveryMode
  status: FollowUpStatus
  input_version: number
  input_json: string
  position: number | null
  actor: FollowUpActor
  source_conversation_id: string | null
  source_task_id: string | null
  target_agent_run_id: string | null
  rejection_reason: FollowUpRejectionReason | null
  rejection_message: string | null
  recovery_reason: string | null
  created_at: number
  updated_at: number
  delivered_at: number | null
  finalized_at: number | null
}

const FOLLOW_UP_TRANSITIONS: Record<FollowUpStatus, readonly FollowUpStatus[]> = {
  accepted: ['delivered', 'rejected', 'cancelled', 'recovered'],
  queued: ['accepted', 'delivered', 'rejected', 'cancelled', 'recovered', 'deleted'],
  delivered: [],
  rejected: ['deleted'],
  cancelled: [],
  recovered: ['accepted', 'queued', 'deleted'],
  deleted: []
}

function turnFromDb(row: TurnDbRow): ConversationTurnRecord {
  return {
    id: row.id as TurnId,
    conversationId: row.conversation_id,
    kind: row.kind,
    status: row.status,
    correlationId: row.correlation_id,
    activeAgentRunId: row.active_agent_run_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    recoveryReason: row.recovery_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function serializeTurnInput(items: TurnInputItem[]): string {
  const validated = validateTurnInputItems(items)
  if (!validated.ok) throw new Error(validated.rejection.message)
  return JSON.stringify({ version: TURN_INPUT_VERSION, items: validated.value })
}

export function parseTurnInput(serialized: string): TurnInputItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new Error('turn-control-store: input_json is not valid JSON')
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== TURN_INPUT_VERSION
  ) {
    throw new Error('turn-control-store: unsupported input_json version')
  }
  const validated = validateTurnInputItems((parsed as { items?: unknown }).items)
  if (!validated.ok) throw new Error(`turn-control-store: ${validated.rejection.message}`)
  return validated.value
}

function followUpFromDb(row: FollowUpDbRow): FollowUpRecord {
  if (row.input_version !== TURN_INPUT_VERSION) {
    throw new Error(`turn-control-store: unsupported input_version ${row.input_version}`)
  }
  return {
    id: row.id as FollowUpId,
    conversationId: row.conversation_id,
    turnId: row.turn_id as TurnId | null,
    expectedTurnId: row.expected_turn_id as TurnId | null,
    clientUserMessageId: row.client_user_message_id as ClientUserMessageId | null,
    deliveryMode: row.delivery_mode,
    status: row.status,
    inputVersion: TURN_INPUT_VERSION,
    input: parseTurnInput(row.input_json),
    position: row.position,
    actor: row.actor,
    sourceConversationId: row.source_conversation_id,
    sourceTaskId: row.source_task_id,
    targetAgentRunId: row.target_agent_run_id,
    rejectionReason: row.rejection_reason,
    rejectionMessage: row.rejection_message,
    recoveryReason: row.recovery_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deliveredAt: row.delivered_at,
    finalizedAt: row.finalized_at
  }
}

export function assertFollowUpTransition(from: FollowUpStatus, to: FollowUpStatus): void {
  if (!FOLLOW_UP_TRANSITIONS[from].includes(to)) {
    throw new Error(`turn-control-store: invalid follow-up transition ${from} -> ${to}`)
  }
}

export class TurnControlStore {
  readonly #db: Database.Database

  constructor(database: Database.Database = getDb()) {
    this.#db = database
  }

  createTurn(input: CreateTurnInput): ConversationTurnRecord {
    this.#db
      .prepare(INSERT_TURN_SQL)
      .run(
        input.id,
        input.conversationId,
        input.kind,
        input.correlationId ?? null,
        input.activeAgentRunId ?? null,
        input.startedAt,
        input.startedAt,
        input.startedAt
      )
    return this.getTurn(input.id)!
  }

  getTurn(id: string): ConversationTurnRecord | null {
    const row = this.#db.prepare('SELECT * FROM conversation_turns WHERE id = ?').get(id) as
      TurnDbRow | undefined
    return row ? turnFromDb(row) : null
  }

  getActiveTurn(conversationId: string): ConversationTurnRecord | null {
    const row = this.#db
      .prepare(
        "SELECT * FROM conversation_turns WHERE conversation_id = ? AND status = 'running' LIMIT 1"
      )
      .get(conversationId) as TurnDbRow | undefined
    return row ? turnFromDb(row) : null
  }

  listTurns(conversationId: string): ConversationTurnRecord[] {
    return (
      this.#db
        .prepare(
          'SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY started_at ASC'
        )
        .all(conversationId) as TurnDbRow[]
    ).map(turnFromDb)
  }

  settleTurn(
    id: string,
    status: Exclude<TurnStatus, 'running'>,
    completedAt: number,
    recoveryReason?: string
  ): boolean {
    if (!isTerminalTurnStatus(status)) throw new Error('turn-control-store: turn must settle')
    const result = this.#db
      .prepare(
        `UPDATE conversation_turns
            SET status = ?, completed_at = ?, recovery_reason = ?, updated_at = ?
          WHERE id = ? AND status = 'running'`
      )
      .run(status, completedAt, recoveryReason ?? null, completedAt, id)
    return result.changes === 1
  }

  createFollowUp(input: CreateFollowUpInput): CreateFollowUpResult {
    const validated = validateFollowUpSubmission(input.submission)
    if (!validated.ok) throw new Error(validated.rejection.message)
    const submission = validated.value

    if (submission.clientUserMessageId) {
      const existing = this.findByClientMessageId(
        submission.conversationId,
        submission.clientUserMessageId
      )
      if (existing) return { record: existing, duplicate: true }
    }

    const position =
      submission.deliveryMode === 'queue'
        ? this.#nextQueuePosition(submission.conversationId)
        : null
    const status: FollowUpStatus = submission.deliveryMode === 'steer' ? 'accepted' : 'queued'
    const turnId = submission.deliveryMode === 'steer' ? (submission.expectedTurnId ?? null) : null

    this.#db
      .prepare(INSERT_FOLLOW_UP_SQL)
      .run(
        input.id,
        submission.conversationId,
        turnId,
        submission.expectedTurnId ?? null,
        submission.clientUserMessageId ?? null,
        submission.deliveryMode,
        status,
        serializeTurnInput(submission.input),
        position,
        submission.actor,
        submission.sourceConversationId ?? null,
        submission.sourceTaskId ?? null,
        submission.targetAgentRunId ?? null,
        input.createdAt,
        input.createdAt
      )
    return { record: this.getFollowUp(input.id)!, duplicate: false }
  }

  getFollowUp(id: string): FollowUpRecord | null {
    const row = this.#db.prepare('SELECT * FROM turn_followups WHERE id = ?').get(id) as
      FollowUpDbRow | undefined
    return row ? followUpFromDb(row) : null
  }

  findByClientMessageId(
    conversationId: string,
    clientUserMessageId: string
  ): FollowUpRecord | null {
    const row = this.#db
      .prepare(
        'SELECT * FROM turn_followups WHERE conversation_id = ? AND client_user_message_id = ?'
      )
      .get(conversationId, clientUserMessageId) as FollowUpDbRow | undefined
    return row ? followUpFromDb(row) : null
  }

  listFollowUps(conversationId: string): FollowUpRecord[] {
    return (
      this.#db
        .prepare('SELECT * FROM turn_followups WHERE conversation_id = ? ORDER BY created_at ASC')
        .all(conversationId) as FollowUpDbRow[]
    ).map(followUpFromDb)
  }

  listQueuedFollowUps(conversationId: string): FollowUpRecord[] {
    return (
      this.#db
        .prepare(
          "SELECT * FROM turn_followups WHERE conversation_id = ? AND status = 'queued' ORDER BY position ASC"
        )
        .all(conversationId) as FollowUpDbRow[]
    ).map(followUpFromDb)
  }

  updateFollowUpInput(id: string, input: TurnInputItem[], updatedAt: number): FollowUpRecord {
    const existing = this.getFollowUp(id)
    if (!existing) throw new Error(`turn-control-store: follow-up not found: ${id}`)
    if (!['queued', 'rejected', 'recovered'].includes(existing.status)) {
      throw new Error(`turn-control-store: ${existing.status} follow-up is not editable`)
    }
    this.#db
      .prepare('UPDATE turn_followups SET input_json = ?, updated_at = ? WHERE id = ?')
      .run(serializeTurnInput(input), updatedAt, id)
    return this.getFollowUp(id)!
  }

  reorderQueuedFollowUps(
    conversationId: string,
    orderedIds: readonly string[],
    updatedAt: number
  ): FollowUpRecord[] {
    const current = this.listQueuedFollowUps(conversationId)
    const currentIds = current.map((row) => row.id)
    if (
      orderedIds.length !== currentIds.length ||
      new Set(orderedIds).size !== orderedIds.length ||
      [...orderedIds].sort().join('\u0000') !== [...currentIds].sort().join('\u0000')
    ) {
      throw new Error(
        'turn-control-store: reorder must contain every queued follow-up exactly once'
      )
    }

    const tx = this.#db.transaction(() => {
      const offset = current.length * 2 + 1
      this.#db
        .prepare(
          `UPDATE turn_followups
              SET position = position + ?, updated_at = ?
            WHERE conversation_id = ? AND status = 'queued'`
        )
        .run(offset, updatedAt, conversationId)
      const setPosition = this.#db.prepare(
        "UPDATE turn_followups SET position = ?, updated_at = ? WHERE id = ? AND status = 'queued'"
      )
      orderedIds.forEach((id, position) => setPosition.run(position, updatedAt, id))
    })
    tx()
    return this.listQueuedFollowUps(conversationId)
  }

  transitionFollowUp(
    id: string,
    status: FollowUpStatus,
    updatedAt: number,
    details: FollowUpTransitionDetails = {}
  ): FollowUpRecord {
    const existing = this.getFollowUp(id)
    if (!existing) throw new Error(`turn-control-store: follow-up not found: ${id}`)
    assertFollowUpTransition(existing.status, status)
    if (status === 'delivered' && !details.turnId && !existing.turnId) {
      throw new Error('turn-control-store: delivered follow-up requires turnId')
    }
    if (status === 'rejected' && !details.rejectionReason) {
      throw new Error('turn-control-store: rejected follow-up requires rejectionReason')
    }

    const finalizedAt = isTerminalFollowUpStatus(status) ? updatedAt : null
    const deliveredAt = status === 'delivered' ? updatedAt : null
    this.#db
      .prepare(
        `UPDATE turn_followups
            SET status = ?, turn_id = COALESCE(?, turn_id),
                rejection_reason = ?, rejection_message = ?, recovery_reason = ?,
                delivered_at = ?, finalized_at = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(
        status,
        details.turnId ?? null,
        details.rejectionReason ?? null,
        details.rejectionMessage ?? null,
        details.recoveryReason ?? null,
        deliveredAt,
        finalizedAt,
        updatedAt,
        id
      )
    return this.getFollowUp(id)!
  }

  recoverOrphans(recoveredAt: number, reason: string): { turns: number; followUps: number } {
    const tx = this.#db.transaction(() => {
      const turns = this.#db
        .prepare(RECOVER_RUNNING_TURNS_SQL)
        .run(recoveredAt, reason, recoveredAt).changes
      const followUps = this.#db
        .prepare(RECOVER_ACCEPTED_STEERS_SQL)
        .run(reason, recoveredAt, recoveredAt).changes
      return { turns, followUps }
    })
    return tx()
  }

  #nextQueuePosition(conversationId: string): number {
    const row = this.#db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS position
           FROM turn_followups
          WHERE conversation_id = ? AND delivery_mode = 'queue' AND status = 'queued'`
      )
      .get(conversationId) as { position: number }
    return row.position
  }
}
