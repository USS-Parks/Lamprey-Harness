import { beforeEach, describe, expect, it } from 'vitest'
import { applyGoalAutomationBridgeSchema } from './goal-automation-bridge-schema'

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
    CREATE TABLE goals (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL);
    CREATE TABLE automations (id TEXT PRIMARY KEY);
  `)
})

describe('GA-4 bridge migration (node:sqlite — never skips silently)', () => {
  it('node:sqlite is available in this runtime', () => expect(hasNodeSqlite).toBe(true))

  it.skipIf(!hasNodeSqlite)('persists one loop owner and automation wake bindings idempotently', () => {
    applyGoalAutomationBridgeSchema(db)
    applyGoalAutomationBridgeSchema(db)
    db.prepare(
      `INSERT INTO goals (id,conversation_id,loop_id,loop_max_iterations) VALUES (?,?,?,?)`
    ).run('g1', 'c1', 'l1', 10)
    expect(() => db.prepare(
      `INSERT INTO goals (id,conversation_id,loop_id) VALUES (?,?,?)`
    ).run('g2', 'c1', 'l1')).toThrow()
    db.prepare(
      `INSERT INTO automations (id,goal_id,goal_conversation_id,loop_token_budget) VALUES (?,?,?,?)`
    ).run('a1', 'g1', 'c1', 2000)
    expect(db.prepare('SELECT goal_id,goal_conversation_id,loop_token_budget FROM automations').get())
      .toEqual({ goal_id: 'g1', goal_conversation_id: 'c1', loop_token_budget: 2000 })
  })
})
