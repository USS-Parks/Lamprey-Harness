import { describe, it, expect, beforeEach } from 'vitest'
import { AGENT_IDENTITY_SCHEMA_SQL } from './agent-identity-schema'

// AO-2 — REAL DB integration coverage that does NOT skip (the loop-db pattern).
// node:sqlite ships with Node (no native addon) so it loads under vitest's ABI
// where the Electron-built better-sqlite3 cannot. This runs the EXACT migration
// v19 DDL (AGENT_IDENTITY_SCHEMA_SQL) plus the store query shapes, catching
// schema typos, CHECK-constraint regressions, and query bugs at gate time.

type DB = {
  exec(sql: string): void
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number | bigint }
    get(...args: unknown[]): Record<string, unknown> | undefined
    all(...args: unknown[]): Record<string, unknown>[]
  }
}

let DatabaseSync: (new (path: string) => DB) | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseSync = (require('node:sqlite') as { DatabaseSync: new (path: string) => DB }).DatabaseSync
} catch {
  DatabaseSync = null
}
const hasNodeSqlite = !!DatabaseSync
let db: DB

beforeEach(() => {
  if (!hasNodeSqlite) return
  db = new DatabaseSync!(':memory:')
  db.exec(AGENT_IDENTITY_SCHEMA_SQL)
})

describe('agent_identities DB integration (node:sqlite — never skips silently)', () => {
  it('node:sqlite is available in this runtime', () => {
    expect(hasNodeSqlite).toBe(true)
  })

  it.skipIf(!hasNodeSqlite)(
    'creates the agent_identities table + indexes from the production DDL',
    () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name)
      expect(tables).toContain('agent_identities')
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_agent_identities%'"
        )
        .all()
        .map((r) => r.name)
      expect(indexes).toContain('idx_agent_identities_scope')
      expect(indexes).toContain('idx_agent_identities_status')
    }
  )

  it.skipIf(!hasNodeSqlite)('round-trips an identity through the store query shapes', () => {
    db.prepare(
      `INSERT INTO agent_identities
         (id, label, agent_type, scope_kind, scope_id, requested_tools, granted_tools,
          status, tokens_ceiling, wall_ms_ceiling, tokens_spent, wall_ms_spent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
    ).run(
      'id1',
      'Explore',
      'Explore',
      'conversation',
      'c1',
      '["read_file"]',
      '[]',
      'pending',
      0,
      0,
      100
    )

    db.prepare(`UPDATE agent_identities SET granted_tools = ?, status = 'active' WHERE id = ?`).run(
      '["read_file"]',
      'id1'
    )
    db.prepare(
      `UPDATE agent_identities SET tokens_spent = tokens_spent + ?, wall_ms_spent = wall_ms_spent + ? WHERE id = ?`
    ).run(500, 1200, 'id1')

    const row = db.prepare('SELECT * FROM agent_identities WHERE id = ?').get('id1')!
    expect(row.status).toBe('active')
    expect(row.granted_tools).toBe('["read_file"]')
    expect(row.tokens_spent).toBe(500)
    expect(row.wall_ms_spent).toBe(1200)
  })

  it.skipIf(!hasNodeSqlite)('enforces the scope_kind and status CHECK constraints', () => {
    const badScope = (): void => {
      db.prepare(
        `INSERT INTO agent_identities (id, label, agent_type, scope_kind, created_at)
         VALUES ('x', 'l', 't', 'nonsense', 1)`
      ).run()
    }
    expect(badScope).toThrow()
    const badStatus = (): void => {
      db.prepare(
        `INSERT INTO agent_identities (id, label, agent_type, scope_kind, status, created_at)
         VALUES ('y', 'l', 't', 'loop', 'zombie', 1)`
      ).run()
    }
    expect(badStatus).toThrow()
  })

  it.skipIf(!hasNodeSqlite)('scope listing orders newest-first', () => {
    const ins = (id: string, at: number): void => {
      db.prepare(
        `INSERT INTO agent_identities (id, label, agent_type, scope_kind, scope_id, created_at)
         VALUES (?, 'l', 't', 'outcome', 'o1', ?)`
      ).run(id, at)
    }
    ins('a', 10)
    ins('b', 30)
    ins('c', 20)
    const ids = db
      .prepare(
        `SELECT id FROM agent_identities WHERE scope_kind = 'outcome' AND scope_id = 'o1' ORDER BY created_at DESC`
      )
      .all()
      .map((r) => r.id)
    expect(ids).toEqual(['b', 'c', 'a'])
  })
})
