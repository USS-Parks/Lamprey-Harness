import { describe, expect, it } from 'vitest'
import { TASK_LIFECYCLE_SCHEMA_SQL } from './task-lifecycle-schema'

let DatabaseSync: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseSync = require('node:sqlite').DatabaseSync
} catch {
  DatabaseSync = null
}

describe('TC-5 task lifecycle schema under node:sqlite', () => {
  it('has node:sqlite available in this runtime', () => {
    expect(DatabaseSync).not.toBeNull()
  })

  it('runs the exact production DDL and round-trips close/restore', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        archived INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      ${TASK_LIFECYCLE_SCHEMA_SQL}
    `)
    db.prepare('INSERT INTO conversations (id, archived, updated_at) VALUES (?, 0, ?)').run('c1', 1)
    db.prepare('UPDATE conversations SET closed_at=?, archived=1, updated_at=? WHERE id=?').run(
      2,
      2,
      'c1'
    )
    expect(
      db.prepare('SELECT closed_at, archived FROM conversations WHERE id=?').get('c1')
    ).toEqual({ closed_at: 2, archived: 1 })
    db.prepare('UPDATE conversations SET closed_at=NULL, archived=0, updated_at=? WHERE id=?').run(
      3,
      'c1'
    )
    expect(
      db.prepare('SELECT closed_at, archived FROM conversations WHERE id=?').get('c1')
    ).toEqual({ closed_at: null, archived: 0 })
    db.close()
  })
})
