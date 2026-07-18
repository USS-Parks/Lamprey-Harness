import { describe, expect, it } from 'vitest'
import { FORK_TURN_SCHEMA_SQL } from './fork-turn-schema'

let DatabaseSync: any
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseSync = require('node:sqlite').DatabaseSync
} catch {
  DatabaseSync = null
}

describe('TC-4 historical fork schema under node:sqlite', () => {
  it('has node:sqlite available in this runtime', () => {
    expect(DatabaseSync).not.toBeNull()
  })

  it('runs the exact production DDL and preserves the task/turn backlink', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      ${FORK_TURN_SCHEMA_SQL}
    `)
    db.prepare(
      'INSERT INTO conversations (id, created_at, forked_from_turn_id) VALUES (?, ?, ?)'
    ).run('child', 2, 'turn-1')
    expect(
      db.prepare('SELECT forked_from_turn_id FROM conversations WHERE id = ?').get('child')
    ).toEqual({ forked_from_turn_id: 'turn-1' })
    const index = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_conversations_forked_from_turn'"
      )
      .get()
    expect(index).toEqual({ name: 'idx_conversations_forked_from_turn' })
    db.close()
  })
})
