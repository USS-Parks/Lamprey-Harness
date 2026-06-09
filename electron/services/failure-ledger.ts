import { createHash, randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import { recordEvent } from './event-log'

export type FailureLedgerKind =
  | 'proof_failed'
  | 'command_failed'
  | 'gate_waived'
  | 'review_invalid'
  | 'stale_green_attempt'
  | 'user_reported'

export interface FailureLedgerRecord {
  id: string
  fingerprint: string
  kind: FailureLedgerKind
  receiptId?: string
  contractId?: string
  eventId?: string
  conversationId?: string
  correlationId?: string
  command?: string
  diffHash?: string
  message: string
  count: number
  replaySeed: ReplaySeed
  firstSeenAt: number
  lastSeenAt: number
  createdAt: number
  updatedAt: number
}

export interface ReplaySeed {
  command?: string
  diffHash?: string
  expectedFailureParser?: string
  suggestedTestFile?: string
}

export interface RecordFailureInput {
  id?: string
  kind: FailureLedgerKind
  receiptId?: string
  contractId?: string
  eventId?: string
  conversationId?: string
  correlationId?: string
  command?: string
  diffHash?: string
  message: string
  /** If omitted, derived from kind + command + contractId + diffHash. */
  fingerprint?: string
  /** If omitted, derived from the failure fields. */
  replaySeed?: ReplaySeed
}

export interface FailureLedgerFilter {
  kind?: FailureLedgerKind | FailureLedgerKind[]
  contractId?: string
  conversationId?: string
  correlationId?: string
  receiptId?: string
  fingerprint?: string
  sinceMs?: number
  untilMs?: number
  limit?: number
  order?: 'asc' | 'desc'
}

interface FailureLedgerRow {
  id: string
  fingerprint: string
  kind: string
  receipt_id: string | null
  contract_id: string | null
  event_id: string | null
  conversation_id: string | null
  correlation_id: string | null
  command: string | null
  diff_hash: string | null
  message: string
  count: number
  replay_seed_json: string
  first_seen_at: number
  last_seen_at: number
  created_at: number
  updated_at: number
}

const MAX_LIST_LIMIT = 500

function now(): number {
  return Date.now()
}

function deriveFingerprint(kind: string, command?: string, contractId?: string, diffHash?: string): string {
  const raw = `${kind}|${command ?? ''}|${contractId ?? ''}|${diffHash ?? ''}`
  return createHash('sha256').update(raw).digest('hex')
}

function deriveReplaySeed(input: RecordFailureInput): ReplaySeed {
  const seed: ReplaySeed = {}
  if (input.command) {
    seed.command = input.command
    seed.expectedFailureParser = input.kind
  }
  if (input.diffHash) seed.diffHash = input.diffHash
  return seed
}

function parseReplaySeed(json: string): ReplaySeed {
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ReplaySeed
    }
  } catch { /* fall through */ }
  return {}
}

function rowToRecord(row: FailureLedgerRow): FailureLedgerRecord {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    kind: row.kind as FailureLedgerKind,
    receiptId: row.receipt_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    eventId: row.event_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    command: row.command ?? undefined,
    diffHash: row.diff_hash ?? undefined,
    message: row.message,
    count: row.count,
    replaySeed: parseReplaySeed(row.replay_seed_json),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function getStoreDb(db?: Database): Database {
  return db ?? getDb()
}

/**
 * Record a failure in the ledger. If a row with the same fingerprint already
 * exists, the count is incremented and last_seen_at is updated (upsert).
 * Otherwise a new row is inserted.
 *
 * Emits `failure_ledger.recorded` when a new fingerprint is first seen, and
 * `failure_ledger.repeated` when an existing fingerprint's count increments.
 */
export function recordFailure(input: RecordFailureInput, db?: Database): FailureLedgerRecord {
  const d = getStoreDb(db)
  const fingerprint = input.fingerprint ?? deriveFingerprint(
    input.kind, input.command, input.contractId, input.diffHash
  )
  const replaySeed = input.replaySeed ?? deriveReplaySeed(input)
  const ts = now()

  const existing = d.prepare(
    'SELECT * FROM failure_ledger WHERE fingerprint = ?'
  ).get(fingerprint) as FailureLedgerRow | undefined

  if (existing) {
    const newCount = existing.count + 1
    d.prepare(`
      UPDATE failure_ledger
        SET count = ?, last_seen_at = ?, updated_at = ?,
            message = CASE WHEN ? != '' THEN ? ELSE message END
        WHERE fingerprint = ?
    `).run(newCount, ts, ts, input.message, input.message, fingerprint)

    const updated = d.prepare(
      'SELECT * FROM failure_ledger WHERE fingerprint = ?'
    ).get(fingerprint) as FailureLedgerRow

    const rec = rowToRecord(updated)
    try {
      recordEvent({
        type: 'failure_ledger.repeated',
        actorKind: 'system',
        payload: {
          ledgerId: rec.id,
          fingerprint: rec.fingerprint,
          kind: rec.kind,
          count: rec.count,
          conversationId: rec.conversationId,
          correlationId: rec.correlationId
        }
      })
    } catch { /* best-effort */ }
    return rec
  }

  const id = input.id ?? randomUUID()
  d.prepare(`
    INSERT INTO failure_ledger (
      id, fingerprint, kind, receipt_id, contract_id, event_id,
      conversation_id, correlation_id, command, diff_hash, message,
      count, replay_seed_json, first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    id, fingerprint, input.kind, input.receiptId ?? null, input.contractId ?? null,
    input.eventId ?? null, input.conversationId ?? null, input.correlationId ?? null,
    input.command ?? null, input.diffHash ?? null, input.message,
    1, JSON.stringify(replaySeed), ts, ts, ts, ts
  )

  const row = d.prepare('SELECT * FROM failure_ledger WHERE id = ?').get(id) as FailureLedgerRow
  const rec = rowToRecord(row)

  try {
    recordEvent({
      type: 'failure_ledger.recorded',
      actorKind: 'system',
      payload: {
        ledgerId: rec.id,
        fingerprint: rec.fingerprint,
        kind: rec.kind,
        conversationId: rec.conversationId,
        correlationId: rec.correlationId
      }
    })
  } catch { /* best-effort */ }

  return rec
}

/**
 * Convert a proof gate or receipt failure event into a ledger entry.
 * Callers in proof-receipts.ts and proof-gate.ts can invoke this after
 * recording their primary events.
 */
export function handleProofEvent(event: {
  type: string
  receiptId?: string
  contractId?: string
  conversationId?: string
  correlationId?: string
  command?: string
  diffHash?: string
  message?: string
}, db?: Database): void {
  const d = getStoreDb(db)

  switch (event.type) {
    case 'proof.receipt.failed': {
      recordFailure({
        kind: 'proof_failed',
        receiptId: event.receiptId,
        contractId: event.contractId,
        conversationId: event.conversationId,
        correlationId: event.correlationId,
        command: event.command,
        diffHash: event.diffHash,
        message: event.message ?? `Proof receipt ${event.receiptId ?? 'unknown'} failed`
      }, d)
      break
    }
    case 'proof.gate.failed': {
      recordFailure({
        kind: 'proof_failed',
        contractId: event.contractId,
        conversationId: event.conversationId,
        correlationId: event.correlationId,
        message: event.message ?? 'Proof gate failed: untrusted completion'
      }, d)
      break
    }
    case 'proof.gate.waived': {
      recordFailure({
        kind: 'gate_waived',
        contractId: event.contractId,
        conversationId: event.conversationId,
        correlationId: event.correlationId,
        message: event.message ?? 'Proof gate waived by user'
      }, d)
      break
    }
    default:
      break
  }
}

export function listFailures(filter?: FailureLedgerFilter, db?: Database): FailureLedgerRecord[] {
  const d = getStoreDb(db)
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter?.kind) {
    if (Array.isArray(filter.kind)) {
      conditions.push(`kind IN (${filter.kind.map(() => '?').join(',')})`)
      params.push(...filter.kind)
    } else {
      conditions.push('kind = ?')
      params.push(filter.kind)
    }
  }
  if (filter?.contractId) { conditions.push('contract_id = ?'); params.push(filter.contractId) }
  if (filter?.conversationId) { conditions.push('conversation_id = ?'); params.push(filter.conversationId) }
  if (filter?.correlationId) { conditions.push('correlation_id = ?'); params.push(filter.correlationId) }
  if (filter?.receiptId) { conditions.push('receipt_id = ?'); params.push(filter.receiptId) }
  if (filter?.fingerprint) { conditions.push('fingerprint = ?'); params.push(filter.fingerprint) }
  if (filter?.sinceMs) { conditions.push('last_seen_at >= ?'); params.push(filter.sinceMs) }
  if (filter?.untilMs) { conditions.push('last_seen_at <= ?'); params.push(filter.untilMs) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const order = filter?.order === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(filter?.limit ?? MAX_LIST_LIMIT, MAX_LIST_LIMIT)

  const rows = d.prepare(
    `SELECT * FROM failure_ledger ${where} ORDER BY last_seen_at ${order} LIMIT ?`
  ).all(...params, limit) as FailureLedgerRow[]

  return rows.map(rowToRecord)
}

export function getFailure(id: string, db?: Database): FailureLedgerRecord | null {
  const d = getStoreDb(db)
  const row = d.prepare('SELECT * FROM failure_ledger WHERE id = ?').get(id) as FailureLedgerRow | undefined
  return row ? rowToRecord(row) : null
}

export function getFailureByFingerprint(fp: string, db?: Database): FailureLedgerRecord | null {
  const d = getStoreDb(db)
  const row = d.prepare('SELECT * FROM failure_ledger WHERE fingerprint = ?').get(fp) as FailureLedgerRow | undefined
  return row ? rowToRecord(row) : null
}

/**
 * Generate a replay seed from a failure ledger record — the minimal information
 * needed to reproduce the failure: command, diff hash, failure parser kind,
 * and a suggested test file derived from the command or contract context.
 */
export function generateReplaySeed(record: FailureLedgerRecord): ReplaySeed {
  const seed: ReplaySeed = { ...record.replaySeed }

  if (!seed.command && record.command) {
    seed.command = record.command
  }
  if (!seed.expectedFailureParser) {
    seed.expectedFailureParser = record.kind
  }
  if (!seed.diffHash && record.diffHash) {
    seed.diffHash = record.diffHash
  }
  return seed
}
