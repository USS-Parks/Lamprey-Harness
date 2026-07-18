import { beforeEach, describe, expect, it } from 'vitest'
import { TURN_CONTROL_SCHEMA_SQL } from './turn-control-schema'
import {
  INSERT_FOLLOW_UP_SQL,
  INSERT_TURN_SQL,
  RECOVER_ACCEPTED_STEERS_SQL,
  RECOVER_RUNNING_TURNS_SQL
} from './turn-control-store'

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
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (id TEXT PRIMARY KEY);
    INSERT INTO conversations (id) VALUES ('conversation-1');
    ${TURN_CONTROL_SCHEMA_SQL}
  `)
})

describe('turn-control DB integration (node:sqlite — no native-addon skip)', () => {
  it('node:sqlite is available in this runtime', () => {
    expect(hasNodeSqlite).toBe(true)
  })

  it.skipIf(!hasNodeSqlite)('creates the production tables and indexes', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name")
      .all()
      .map((row) => row.name)
    expect(names).toContain('conversation_turns')
    expect(names).toContain('turn_followups')
    expect(names).toContain('idx_conversation_turns_one_running')
    expect(names).toContain('idx_turn_followups_client_dedupe')
    expect(names).toContain('idx_turn_followups_queue_position')
  })

  it.skipIf(!hasNodeSqlite)('runs the exact turn and follow-up insert query shapes', () => {
    db.prepare(INSERT_TURN_SQL).run(
      'turn-1',
      'conversation-1',
      'regular',
      'correlation-1',
      null,
      10,
      10,
      10
    )
    db.prepare(INSERT_FOLLOW_UP_SQL).run(
      'follow-up-1',
      'conversation-1',
      'turn-1',
      'turn-1',
      'client-1',
      'steer',
      'accepted',
      JSON.stringify({ version: 1, items: [{ type: 'text', text: 'steer' }] }),
      null,
      'user',
      'conversation-1',
      null,
      null,
      20,
      20
    )
    const row = db.prepare('SELECT * FROM turn_followups WHERE id = ?').get('follow-up-1')!
    expect(row.expected_turn_id).toBe('turn-1')
    expect(row.input_version).toBe(1)
    expect(row.status).toBe('accepted')
  })

  it.skipIf(!hasNodeSqlite)('enforces one running turn per conversation', () => {
    const insert = db.prepare(INSERT_TURN_SQL)
    insert.run('turn-1', 'conversation-1', 'regular', null, null, 1, 1, 1)
    expect(() => insert.run('turn-2', 'conversation-1', 'regular', null, null, 2, 2, 2)).toThrow()
  })

  it.skipIf(!hasNodeSqlite)('enforces turn, delivery, and input-version checks', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO conversation_turns
            (id, conversation_id, kind, status, started_at, created_at, updated_at)
           VALUES ('bad-turn','conversation-1','ordinary','running',1,1,1)`
        )
        .run()
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO turn_followups
            (id, conversation_id, delivery_mode, status, input_version, input_json,
             position, actor, created_at, updated_at)
           VALUES ('bad-follow','conversation-1','later','queued',1,'{}',0,'user',1,1)`
        )
        .run()
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO turn_followups
            (id, conversation_id, delivery_mode, status, input_version, input_json,
             position, actor, created_at, updated_at)
           VALUES ('bad-version','conversation-1','queue','queued',2,'{}',0,'user',1,1)`
        )
        .run()
    ).toThrow()
  })

  it.skipIf(!hasNodeSqlite)('deduplicates client IDs and locks queued positions', () => {
    const insert = db.prepare(INSERT_FOLLOW_UP_SQL)
    const input = JSON.stringify({ version: 1, items: [{ type: 'text', text: 'next' }] })
    insert.run(
      'q1',
      'conversation-1',
      null,
      null,
      'client-1',
      'queue',
      'queued',
      input,
      0,
      'user',
      null,
      null,
      null,
      1,
      1
    )
    expect(() =>
      insert.run(
        'q2',
        'conversation-1',
        null,
        null,
        'client-1',
        'queue',
        'queued',
        input,
        1,
        'user',
        null,
        null,
        null,
        2,
        2
      )
    ).toThrow()
    expect(() =>
      insert.run(
        'q3',
        'conversation-1',
        null,
        null,
        'client-3',
        'queue',
        'queued',
        input,
        0,
        'user',
        null,
        null,
        null,
        3,
        3
      )
    ).toThrow()
  })

  it.skipIf(!hasNodeSqlite)(
    'recovers running turns and accepted steers but preserves Queue',
    () => {
      db.prepare(INSERT_TURN_SQL).run('turn-1', 'conversation-1', 'regular', null, null, 1, 1, 1)
      const input = JSON.stringify({ version: 1, items: [{ type: 'text', text: 'x' }] })
      const insert = db.prepare(INSERT_FOLLOW_UP_SQL)
      insert.run(
        's1',
        'conversation-1',
        'turn-1',
        'turn-1',
        null,
        'steer',
        'accepted',
        input,
        null,
        'user',
        null,
        null,
        null,
        2,
        2
      )
      insert.run(
        'q1',
        'conversation-1',
        null,
        null,
        null,
        'queue',
        'queued',
        input,
        0,
        'user',
        null,
        null,
        null,
        3,
        3
      )
      expect(db.prepare(RECOVER_RUNNING_TURNS_SQL).run(10, 'restart', 10).changes).toBe(1)
      expect(db.prepare(RECOVER_ACCEPTED_STEERS_SQL).run('restart', 10, 10).changes).toBe(1)
      const rows = db
        .prepare('SELECT id, status FROM turn_followups ORDER BY id')
        .all()
        .map((row) => [row.id, row.status])
      expect(rows).toEqual([
        ['q1', 'queued'],
        ['s1', 'recovered']
      ])
    }
  )

  it.skipIf(!hasNodeSqlite)('cascades both ledgers when a conversation is deleted', () => {
    db.prepare(INSERT_TURN_SQL).run('turn-1', 'conversation-1', 'regular', null, null, 1, 1, 1)
    db.prepare(INSERT_FOLLOW_UP_SQL).run(
      's1',
      'conversation-1',
      'turn-1',
      'turn-1',
      null,
      'steer',
      'accepted',
      JSON.stringify({ version: 1, items: [{ type: 'text', text: 'x' }] }),
      null,
      'user',
      null,
      null,
      null,
      2,
      2
    )
    db.prepare('DELETE FROM conversations WHERE id = ?').run('conversation-1')
    expect(db.prepare('SELECT COUNT(*) AS count FROM conversation_turns').get()!.count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM turn_followups').get()!.count).toBe(0)
  })
})
