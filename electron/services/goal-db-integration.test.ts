import { beforeEach, describe, expect, it } from 'vitest'
import { applyOperationalGoalSchema } from './goal-schema'

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
  db.exec(`
    CREATE TABLE goals (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT NOT NULL CHECK(status IN ('open','in_progress','done','abandoned')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
})

describe('GA-3 goal migration (node:sqlite — never skips silently)', () => {
  it('node:sqlite is available in this runtime', () => {
    expect(hasNodeSqlite).toBe(true)
  })

  it.skipIf(!hasNodeSqlite)('backfills legacy active, completed, and aborted goals', () => {
    const insert = db.prepare(
      'INSERT INTO goals (id,conversation_id,title,status,created_at,updated_at) VALUES (?,?,?,?,?,?)'
    )
    insert.run('active', 'c1', 'A', 'in_progress', 10, 20)
    insert.run('done', 'c1', 'D', 'done', 10, 30)
    insert.run('aborted', 'c1', 'X', 'abandoned', 10, 40)
    applyOperationalGoalSchema(db)
    applyOperationalGoalSchema(db)
    const rows = db.prepare(
      'SELECT id,lifecycle_status,active_since,completed_at,aborted_at FROM goals ORDER BY id'
    ).all()
    expect(rows).toEqual([
      { id: 'aborted', lifecycle_status: 'aborted', active_since: null, completed_at: null, aborted_at: 40 },
      { id: 'active', lifecycle_status: 'active', active_since: 20, completed_at: null, aborted_at: null },
      { id: 'done', lifecycle_status: 'completed', active_since: null, completed_at: 30, aborted_at: null }
    ])
  })

  it.skipIf(!hasNodeSqlite)('persists budget, blocker, completion, and actor provenance', () => {
    applyOperationalGoalSchema(db)
    db.prepare(
      `INSERT INTO goals (
        id,conversation_id,title,status,lifecycle_status,last_actor,
        token_budget,token_used,time_budget_ms,elapsed_ms,blocker,completion,
        created_at,updated_at
      ) VALUES ('g','c','Goal','open','blocked','system',1000,1000,60000,5000,
        'token-budget-exhausted',NULL,1,2)`
    ).run()
    const row = db.prepare('SELECT * FROM goals WHERE id=?').get('g')!
    expect(row).toMatchObject({
      lifecycle_status: 'blocked',
      last_actor: 'system',
      token_budget: 1000,
      token_used: 1000,
      blocker: 'token-budget-exhausted'
    })
  })
})
