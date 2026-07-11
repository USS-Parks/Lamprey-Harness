import type Database from 'better-sqlite3'
import { getDb } from './database'

// Agentic Orchestration Phase AO-2 — persistence for the agent_identities
// ledger. One row per forked agent's identity: what it requested, what the user
// granted, its budget ceilings, and its running spend. Mirrors the
// getDb()-with-Map-fallback pattern of agent-run-store.ts so tests and
// native-binding-mismatch boots degrade gracefully (JM-14 backoff retry).
//
// The DDL lives in agent-identity-schema.ts (migration v19) so the node:sqlite
// integration test runs the exact production statements.

export type IdentityStatus = 'pending' | 'active' | 'revoked'
export type IdentityScopeKind = 'conversation' | 'loop' | 'workflow' | 'outcome'

export interface AgentIdentityRow {
  id: string
  label: string
  agentType: string
  scopeKind: IdentityScopeKind
  scopeId: string | null
  requestedTools: string[]
  grantedTools: string[]
  status: IdentityStatus
  tokensCeiling: number
  wallMsCeiling: number
  tokensSpent: number
  wallMsSpent: number
  createdAt: number
  revokedAt: number | null
}

export interface AgentIdentityInsert {
  id: string
  label: string
  agentType: string
  scopeKind: IdentityScopeKind
  scopeId?: string | null
  requestedTools: string[]
  /** Optional up-front grant (e.g. an auto-granted read-only floor). When
   *  supplied the identity is created 'active'; otherwise 'pending'. */
  grantedTools?: string[]
  tokensCeiling?: number
  wallMsCeiling?: number
  createdAt: number
}

interface DbRow {
  id: string
  label: string
  agent_type: string
  scope_kind: IdentityScopeKind
  scope_id: string | null
  requested_tools: string
  granted_tools: string
  status: IdentityStatus
  tokens_ceiling: number
  wall_ms_ceiling: number
  tokens_spent: number
  wall_ms_spent: number
  created_at: number
  revoked_at: number | null
}

function parseTools(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rowFromDb(r: DbRow): AgentIdentityRow {
  return {
    id: r.id,
    label: r.label,
    agentType: r.agent_type,
    scopeKind: r.scope_kind,
    scopeId: r.scope_id,
    requestedTools: parseTools(r.requested_tools),
    grantedTools: parseTools(r.granted_tools),
    status: r.status,
    tokensCeiling: r.tokens_ceiling,
    wallMsCeiling: r.wall_ms_ceiling,
    tokensSpent: r.tokens_spent,
    wallMsSpent: r.wall_ms_spent,
    createdAt: r.created_at,
    revokedAt: r.revoked_at
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback (mirrors agent-run-store.ts)
// ---------------------------------------------------------------------------

let memoryFallbackForced = false
const memory = new Map<string, AgentIdentityRow>()
const MEMORY_CAP = 500

function capMemory(): void {
  while (memory.size > MEMORY_CAP) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memory.delete(oldest)
  }
}

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

/** Test seam — force the Map fallback + clear it between cases. */
export function __forceMemoryFallbackForTests(on: boolean): void {
  memoryFallbackForced = on
  memory.clear()
  dbRetryAfter = 0
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createIdentity(args: AgentIdentityInsert): AgentIdentityRow {
  const granted = args.grantedTools
  const status: IdentityStatus = granted !== undefined ? 'active' : 'pending'
  const row: AgentIdentityRow = {
    id: args.id,
    label: args.label,
    agentType: args.agentType,
    scopeKind: args.scopeKind,
    scopeId: args.scopeId ?? null,
    requestedTools: [...args.requestedTools],
    grantedTools: granted ? [...granted] : [],
    status,
    tokensCeiling: args.tokensCeiling ?? 0,
    wallMsCeiling: args.wallMsCeiling ?? 0,
    tokensSpent: 0,
    wallMsSpent: 0,
    createdAt: args.createdAt,
    revokedAt: null
  }
  const db = useDb()
  if (db) {
    db.prepare(
      `INSERT INTO agent_identities
         (id, label, agent_type, scope_kind, scope_id, requested_tools, granted_tools,
          status, tokens_ceiling, wall_ms_ceiling, tokens_spent, wall_ms_spent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
    ).run(
      row.id,
      row.label,
      row.agentType,
      row.scopeKind,
      row.scopeId,
      JSON.stringify(row.requestedTools),
      JSON.stringify(row.grantedTools),
      row.status,
      row.tokensCeiling,
      row.wallMsCeiling,
      row.createdAt
    )
    return row
  }
  capMemory()
  memory.set(row.id, row)
  return row
}

/** Persist the user's per-tool approve/refuse decision and activate. Granted
 *  tools are the intersection-ready allowlist AO-3 resolves at dispatch. */
export function grantIdentity(id: string, grantedTools: string[]): void {
  const db = useDb()
  if (db) {
    db.prepare(`UPDATE agent_identities SET granted_tools = ?, status = 'active' WHERE id = ?`).run(
      JSON.stringify(grantedTools),
      id
    )
    return
  }
  const existing = memory.get(id)
  if (existing) memory.set(id, { ...existing, grantedTools: [...grantedTools], status: 'active' })
}

export function revokeIdentity(id: string, revokedAt: number): void {
  const db = useDb()
  if (db) {
    db.prepare(`UPDATE agent_identities SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(
      revokedAt,
      id
    )
    return
  }
  const existing = memory.get(id)
  if (existing) memory.set(id, { ...existing, status: 'revoked', revokedAt })
}

/** Add to the running spend counters. Called from budget receipts (AO-4). */
export function accumulateSpend(id: string, tokens: number, wallMs: number): void {
  const db = useDb()
  if (db) {
    db.prepare(
      `UPDATE agent_identities
          SET tokens_spent = tokens_spent + ?, wall_ms_spent = wall_ms_spent + ?
        WHERE id = ?`
    ).run(Math.max(0, Math.round(tokens)), Math.max(0, Math.round(wallMs)), id)
    return
  }
  const existing = memory.get(id)
  if (existing) {
    memory.set(id, {
      ...existing,
      tokensSpent: existing.tokensSpent + Math.max(0, Math.round(tokens)),
      wallMsSpent: existing.wallMsSpent + Math.max(0, Math.round(wallMs))
    })
  }
}

export function getIdentity(id: string): AgentIdentityRow | null {
  const db = useDb()
  if (db) {
    const r = db.prepare('SELECT * FROM agent_identities WHERE id = ?').get(id) as DbRow | undefined
    return r ? rowFromDb(r) : null
  }
  return memory.get(id) ?? null
}

export function listIdentitiesByScope(
  scopeKind: IdentityScopeKind,
  scopeId: string | null
): AgentIdentityRow[] {
  const db = useDb()
  if (db) {
    const rows = db
      .prepare(
        `SELECT * FROM agent_identities
          WHERE scope_kind = ? AND (scope_id = ? OR (? IS NULL AND scope_id IS NULL))
          ORDER BY created_at DESC`
      )
      .all(scopeKind, scopeId, scopeId) as DbRow[]
    return rows.map(rowFromDb)
  }
  return [...memory.values()]
    .filter((r) => r.scopeKind === scopeKind && r.scopeId === scopeId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Retention sweep hook — delete terminal (revoked) identities created before
 *  the cutoff. Active/pending rows are never swept (they may still be spending). */
export function deleteTerminalIdentitiesBefore(cutoff: number): number {
  const db = useDb()
  if (db) {
    const info = db
      .prepare(`DELETE FROM agent_identities WHERE status = 'revoked' AND created_at < ?`)
      .run(cutoff)
    return info.changes
  }
  let n = 0
  for (const [id, r] of memory) {
    if (r.status === 'revoked' && r.createdAt < cutoff) {
      memory.delete(id)
      n++
    }
  }
  return n
}
