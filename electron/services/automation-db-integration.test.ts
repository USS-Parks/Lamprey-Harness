import { beforeEach, describe, expect, it } from 'vitest'
import { applyAutomationTriggerSchema } from './automation-schema'

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
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(`
    CREATE TABLE automations (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      cron TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_run_at INTEGER,
      last_result TEXT
    );
  `)
})

describe('GA-2 automation migration (node:sqlite — never skips silently)', () => {
  it('node:sqlite is available in this runtime', () => {
    expect(hasNodeSqlite).toBe(true)
  })

  it.skipIf(!hasNodeSqlite)('preserves and backfills legacy cron rows idempotently', () => {
    db.prepare(
      `INSERT INTO automations (id,label,cron,prompt,enabled,created_at)
       VALUES ('legacy','Daily','0 9 * * *','Check',1,100)`
    ).run()
    applyAutomationTriggerSchema(db)
    applyAutomationTriggerSchema(db)

    const row = db.prepare('SELECT * FROM automations WHERE id = ?').get('legacy')!
    expect(row.cron).toBe('0 9 * * *')
    expect(row.trigger_kind).toBe('schedule')
    expect(JSON.parse(String(row.trigger_config_json))).toMatchObject({
      kind: 'schedule', cron: '0 9 * * *', maxAttempts: 3, retryDelaySeconds: 60
    })
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='automation_runs'").get())
      .toBeDefined()
  })

  it.skipIf(!hasNodeSqlite)('deduplicates a trigger attempt across restart', () => {
    db.prepare(
      `INSERT INTO automations (id,label,cron,prompt,enabled,created_at)
       VALUES ('a1','A','* * * * *','Run',1,100)`
    ).run()
    applyAutomationTriggerSchema(db)
    const insert = db.prepare(
      `INSERT OR IGNORE INTO automation_runs
       (id,automation_id,trigger_key,trigger_kind,scheduled_at,started_at,attempt,status)
       VALUES (?,?,?,?,?,?,?,'running')`
    )
    expect(insert.run('r1', 'a1', 'schedule:1000', 'schedule', 1000, 1000, 1).changes).toBe(1)
    expect(insert.run('r2', 'a1', 'schedule:1000', 'schedule', 1000, 1100, 1).changes).toBe(0)

    db.prepare(
      "UPDATE automation_runs SET status='interrupted', finished_at=?, error=? WHERE status='running'"
    ).run(1200, 'app restarted during run')
    expect(insert.run('r3', 'a1', 'schedule:1000', 'schedule', 1000, 1200, 2).changes).toBe(1)
    const runs = db.prepare(
      'SELECT status, attempt FROM automation_runs WHERE automation_id=? ORDER BY attempt'
    ).all('a1')
    expect(runs).toEqual([
      { status: 'interrupted', attempt: 1 },
      { status: 'running', attempt: 2 }
    ])
  })

  it.skipIf(!hasNodeSqlite)('cascades run history when an automation is deleted', () => {
    db.prepare(
      `INSERT INTO automations (id,label,cron,prompt,enabled,created_at)
       VALUES ('a1','A','* * * * *','Run',1,100)`
    ).run()
    applyAutomationTriggerSchema(db)
    db.prepare(
      `INSERT INTO automation_runs
       (id,automation_id,trigger_key,trigger_kind,started_at,attempt,status)
       VALUES ('r1','a1','manual:1','manual',100,1,'completed')`
    ).run()
    db.prepare('DELETE FROM automations WHERE id=?').run('a1')
    expect(db.prepare('SELECT COUNT(*) AS n FROM automation_runs').get()!.n).toBe(0)
  })
})
