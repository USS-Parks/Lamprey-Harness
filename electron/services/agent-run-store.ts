import type Database from 'better-sqlite3'
import { getDb } from './database'

// Persistence layer for the agent_runs table — one row per tracked
// forkAgent call. Inserts on start, updates on finish, supports filtered
// listing. Mirrors the in-memory-fallback pattern of plan-goal-persistence.ts:
// when getDb() throws (test env, native-binding mismatch, or boot-time DB
// failure), every read/write transparently falls through to a Map. The DB
// schema lives in `database.ts#initSchema`; the in-memory shape mirrors it.
//
// The in-memory state is intentionally process-scoped — restarting the app
// clears it. That's the correct behavior: if the DB couldn't be opened at
// boot, "completed" runs from a previous session aren't trustworthy anyway.

export type AgentRunStatus = 'running' | 'done' | 'error' | 'aborted'

export interface AgentRunRow {
  id: string
  parentConvId: string | null
  parentRunId: string | null
  agentType: string
  label: string
  status: AgentRunStatus
  startedAt: number
  finishedAt: number | null
  resultText: string | null
  error: string | null
  worktreePath: string | null
  background: boolean
  // AO-4 receipt fields — optional so pre-AO-4 rows and the memory fallback
  // remain valid without them.
  tokensEst?: number
  toolCalls?: number
}

export interface AgentRunInsert {
  id: string
  parentConvId?: string | null
  parentRunId?: string | null
  agentType: string
  label: string
  startedAt: number
  background?: boolean
  worktreePath?: string | null
  /** AO-5 — link the run to its orchestration identity (v19 column). NULL when
   *  orchestration is off, so the existing paths are byte-compatible. */
  identityId?: string | null
}

export interface AgentRunFinish {
  id: string
  status: Exclude<AgentRunStatus, 'running'>
  finishedAt: number
  resultText?: string | null
  error?: string | null
  worktreePath?: string | null
  // AO-4 receipt fields — estimated tokens + tool-call count for this run.
  tokensEst?: number
  toolCalls?: number
}

export interface AgentRunListFilter {
  status?: AgentRunStatus | AgentRunStatus[]
  parentConvId?: string | null
  parentRunId?: string | null
  background?: boolean
  limit?: number
}

export interface AgentRunUpdate {
  label?: string
}

interface AgentRunRawRow {
  id: string
  parent_conv_id: string | null
  parent_run_id: string | null
  agent_type: string
  label: string
  status: AgentRunStatus
  started_at: number
  finished_at: number | null
  result_text: string | null
  error: string | null
  worktree_path: string | null
  background: number
  tokens_est?: number | null
  tool_calls?: number | null
}

function rowToDomain(row: AgentRunRawRow): AgentRunRow {
  return {
    id: row.id,
    parentConvId: row.parent_conv_id,
    parentRunId: row.parent_run_id,
    agentType: row.agent_type,
    label: row.label,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    resultText: row.result_text,
    error: row.error,
    worktreePath: row.worktree_path,
    background: row.background === 1,
    tokensEst: row.tokens_est ?? 0,
    toolCalls: row.tool_calls ?? 0
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

let memoryFallbackForced = false
const memory = new Map<string, AgentRunRow>()
// JM-14 (DB-22) — bound the fallback map; it grew per agent run forever once
// the fallback engaged.
const MEMORY_CAP = 500

function capMemory(): void {
  while (memory.size > MEMORY_CAP) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memory.delete(oldest)
  }
}

// JM-14 (DB-12) — a single early getDb() throw used to latch the fallback
// permanently; now it backs off and retries every 30s, so a transient
// boot-order hiccup doesn't pin the store to RAM for the session.
let dbRetryAfter = 0

function useDb(): Database.Database | null {
  if (memoryFallbackForced) return null
  const now = Date.now()
  if (dbRetryAfter > now) return null
  try {
    return getDb()
  } catch {
    dbRetryAfter = now + 30_000
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function insertRun(args: AgentRunInsert): void {
  const db = useDb()
  if (db) {
    db.prepare(
      `INSERT INTO agent_runs
         (id, parent_conv_id, parent_run_id, agent_type, label, status, started_at, background, worktree_path, identity_id)
       VALUES
         (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)`
    ).run(
      args.id,
      args.parentConvId ?? null,
      args.parentRunId ?? null,
      args.agentType,
      args.label,
      args.startedAt,
      args.background ? 1 : 0,
      args.worktreePath ?? null,
      args.identityId ?? null
    )
    return
  }
  capMemory()
  memory.set(args.id, {
    id: args.id,
    parentConvId: args.parentConvId ?? null,
    parentRunId: args.parentRunId ?? null,
    agentType: args.agentType,
    label: args.label,
    status: 'running',
    startedAt: args.startedAt,
    finishedAt: null,
    resultText: null,
    error: null,
    worktreePath: args.worktreePath ?? null,
    background: !!args.background
  })
}

export function finishRun(args: AgentRunFinish): void {
  const db = useDb()
  if (db) {
    db.prepare(
      `UPDATE agent_runs
          SET status = ?,
              finished_at = ?,
              result_text = COALESCE(?, result_text),
              error = COALESCE(?, error),
              worktree_path = COALESCE(?, worktree_path),
              tokens_est = COALESCE(?, tokens_est),
              tool_calls = COALESCE(?, tool_calls)
        WHERE id = ?`
    ).run(
      args.status,
      args.finishedAt,
      args.resultText ?? null,
      args.error ?? null,
      args.worktreePath ?? null,
      args.tokensEst ?? null,
      args.toolCalls ?? null,
      args.id
    )
    return
  }
  const existing = memory.get(args.id)
  if (!existing) return
  capMemory()
  memory.set(args.id, {
    ...existing,
    status: args.status,
    finishedAt: args.finishedAt,
    resultText: args.resultText ?? existing.resultText,
    error: args.error ?? existing.error,
    worktreePath: args.worktreePath ?? existing.worktreePath,
    tokensEst: args.tokensEst ?? existing.tokensEst,
    toolCalls: args.toolCalls ?? existing.toolCalls
  })
}

/** AO-4 — the per-run spend receipt (agent_runs projection). Null if the run
 *  is unknown. Reads the v20 columns; 0 on pre-AO-4 rows. */
export function getRunReceipt(
  id: string
): { tokensEst: number; toolCalls: number; wallMs: number; status: AgentRunStatus } | null {
  const db = useDb()
  if (db) {
    const row = db
      .prepare(
        'SELECT status, started_at, finished_at, tokens_est, tool_calls FROM agent_runs WHERE id = ?'
      )
      .get(id) as
      | {
          status: AgentRunStatus
          started_at: number
          finished_at: number | null
          tokens_est: number | null
          tool_calls: number | null
        }
      | undefined
    if (!row) return null
    return {
      tokensEst: row.tokens_est ?? 0,
      toolCalls: row.tool_calls ?? 0,
      wallMs: row.finished_at != null ? Math.max(0, row.finished_at - row.started_at) : 0,
      status: row.status
    }
  }
  const r = memory.get(id)
  if (!r) return null
  return {
    tokensEst: r.tokensEst ?? 0,
    toolCalls: r.toolCalls ?? 0,
    wallMs: r.finishedAt != null ? Math.max(0, r.finishedAt - r.startedAt) : 0,
    status: r.status
  }
}

export function updateRun(id: string, patch: AgentRunUpdate): void {
  const db = useDb()
  if (db) {
    if (patch.label !== undefined) {
      db.prepare('UPDATE agent_runs SET label = ? WHERE id = ?').run(patch.label, id)
    }
    return
  }
  const existing = memory.get(id)
  if (!existing) return
  capMemory()
  memory.set(id, {
    ...existing,
    ...(patch.label !== undefined ? { label: patch.label } : {})
  })
}

export function getRun(id: string): AgentRunRow | null {
  const db = useDb()
  if (db) {
    const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as
      AgentRunRawRow | undefined
    return row ? rowToDomain(row) : null
  }
  return memory.get(id) ?? null
}

export function listRuns(filter: AgentRunListFilter = {}): AgentRunRow[] {
  const db = useDb()
  if (db) {
    const where: string[] = []
    const params: unknown[] = []

    if (filter.status !== undefined) {
      if (Array.isArray(filter.status)) {
        if (filter.status.length === 0) return []
        where.push(`status IN (${filter.status.map(() => '?').join(', ')})`)
        params.push(...filter.status)
      } else {
        where.push('status = ?')
        params.push(filter.status)
      }
    }
    if (filter.parentConvId !== undefined) {
      if (filter.parentConvId === null) {
        where.push('parent_conv_id IS NULL')
      } else {
        where.push('parent_conv_id = ?')
        params.push(filter.parentConvId)
      }
    }
    if (filter.parentRunId !== undefined) {
      if (filter.parentRunId === null) {
        where.push('parent_run_id IS NULL')
      } else {
        where.push('parent_run_id = ?')
        params.push(filter.parentRunId)
      }
    }
    if (filter.background !== undefined) {
      where.push('background = ?')
      params.push(filter.background ? 1 : 0)
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limitClause =
      filter.limit !== undefined && filter.limit > 0 ? `LIMIT ${Math.floor(filter.limit)}` : ''
    const sql =
      `SELECT * FROM agent_runs ${whereClause} ORDER BY started_at DESC ${limitClause}`.trim()
    const rows = db.prepare(sql).all(...params) as AgentRunRawRow[]
    return rows.map(rowToDomain)
  }

  // Memory path — same semantics as SQL.
  let rows = [...memory.values()]
  if (filter.status !== undefined) {
    if (Array.isArray(filter.status)) {
      if (filter.status.length === 0) return []
      const allowed = new Set(filter.status)
      rows = rows.filter((r) => allowed.has(r.status))
    } else {
      rows = rows.filter((r) => r.status === filter.status)
    }
  }
  if (filter.parentConvId !== undefined) {
    rows = rows.filter((r) => r.parentConvId === filter.parentConvId)
  }
  if (filter.parentRunId !== undefined) {
    rows = rows.filter((r) => r.parentRunId === filter.parentRunId)
  }
  if (filter.background !== undefined) {
    rows = rows.filter((r) => r.background === filter.background)
  }
  rows.sort((a, b) => b.startedAt - a.startedAt)
  if (filter.limit !== undefined && filter.limit > 0) rows = rows.slice(0, Math.floor(filter.limit))
  return rows
}

/** Read the full result_text for a run. Separate from getRun so the UI can
 *  list runs without paying the per-row blob cost. */
export function getRunOutput(
  id: string
): { resultText: string | null; error: string | null } | null {
  const db = useDb()
  if (db) {
    const row = db.prepare('SELECT result_text, error FROM agent_runs WHERE id = ?').get(id) as
      { result_text: string | null; error: string | null } | undefined
    if (!row) return null
    return { resultText: row.result_text, error: row.error }
  }
  const r = memory.get(id)
  if (!r) return null
  return { resultText: r.resultText, error: r.error }
}

/** AO-3 — running run ids linked to an identity, for revoke/kill propagation.
 *  Reads the v19 `identity_id` column; AO-5 populates it on every fork, so this
 *  returns [] on pre-AO-5 rows (harmless — nothing to abort). */
export function listRunningRunIdsByIdentity(identityId: string): string[] {
  const db = useDb()
  if (db) {
    const rows = db
      .prepare("SELECT id FROM agent_runs WHERE identity_id = ? AND status = 'running'")
      .all(identityId) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }
  // Memory rows don't carry the identity link (added at the DB layer in v19);
  // the DB path is the one that matters for live kill propagation.
  return []
}

/** AO-5 — running child run ids under a parent run, for tree-wide kill. */
export function listRunningChildRunIds(parentRunId: string): string[] {
  const db = useDb()
  if (db) {
    const rows = db
      .prepare("SELECT id FROM agent_runs WHERE parent_run_id = ? AND status = 'running'")
      .all(parentRunId) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }
  return [...memory.values()]
    .filter((r) => r.parentRunId === parentRunId && r.status === 'running')
    .map((r) => r.id)
}

// Test seam for stores that want to wire the runner without touching the
// real DB. Tests pass an in-memory shim implementing the same shape.
export interface AgentRunStoreLike {
  insertRun(args: AgentRunInsert): void
  finishRun(args: AgentRunFinish): void
}

export const realAgentRunStore: AgentRunStoreLike = { insertRun, finishRun }

// ---------------------------------------------------------------------------
// Test seams
// ---------------------------------------------------------------------------

export function __forceMemoryFallback(): void {
  memoryFallbackForced = true
}

export function __resetAgentRunStore(): void {
  memory.clear()
  memoryFallbackForced = false
}
