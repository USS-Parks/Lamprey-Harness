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

  it.skipIf(!hasNodeSqlite)('AO-4 agent_runs receipt columns round-trip', () => {
    // Mirror the v20 columns onto a minimal agent_runs so the receipt SQL shape
    // is exercised (the full agent_runs DDL lives in schema-init, not shared).
    db.exec(`
      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY, agent_type TEXT NOT NULL, label TEXT NOT NULL,
        status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
        identity_id TEXT, tokens_est INTEGER NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0
      );
    `)
    db.prepare(
      `INSERT INTO agent_runs (id, agent_type, label, status, started_at) VALUES ('r1','general','x','running',100)`
    ).run()
    db.prepare(
      `UPDATE agent_runs SET status='done', finished_at=1600, tokens_est=COALESCE(?,tokens_est), tool_calls=COALESCE(?,tool_calls) WHERE id='r1'`
    ).run(4200, 3)
    const row = db
      .prepare(
        'SELECT status, started_at, finished_at, tokens_est, tool_calls FROM agent_runs WHERE id=?'
      )
      .get('r1')!
    expect(row.tokens_est).toBe(4200)
    expect(row.tool_calls).toBe(3)
    expect((row.finished_at as number) - (row.started_at as number)).toBe(1500)
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
