import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { mkdtempSync, rmSync, statSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// `./database` imports `electron`'s `app` at module load. We never call
// `getDb()` here — every test passes a tmpdir-backed DB explicitly into
// `checkpoint(db)` — but the mock keeps the import resolution happy under
// vitest's node env. Pattern mirrors stage-metrics-store.test.ts.
vi.mock('electron', () => ({
  app: {
    getPath: () => {
      throw new Error('electron app not available in test environment')
    }
  }
}))

import {
  checkpoint,
  startPeriodicCheckpoint,
  getLastCheckpointResult
} from './database'

// Persistence Phase / PS2 — WAL checkpoint behavior tests.
//
// The TRUNCATE checkpoint is the on-disk hygiene contract: after the call,
// the *.db-wal file should be zero-length (or absent) and the main DB file
// should carry all the pages. We exercise this against a file-backed DB
// because `:memory:` has no WAL file to inspect.

const HAS_NATIVE_SQLITE: boolean = (() => {
  try {
    const probe = new BetterSqlite3(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!HAS_NATIVE_SQLITE)('database checkpoint (PS2)', () => {
  let tmpDir: string
  let dbPath: string
  let db: Database

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lamprey-ps2-'))
    dbPath = join(tmpDir, 'ps2.db')
    db = new BetterSqlite3(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)')
  })

  afterEach(() => {
    try {
      db.close()
    } catch {
      /* already closed */
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns ok:true and reports pages moved when WAL has content', () => {
    const insert = db.prepare('INSERT INTO t (value) VALUES (?)')
    for (let i = 0; i < 200; i++) insert.run(`row-${i}`)

    // The WAL file should exist and be non-empty after the inserts.
    const walPath = `${dbPath}-wal`
    expect(existsSync(walPath)).toBe(true)
    const walSizeBefore = statSync(walPath).size
    expect(walSizeBefore).toBeGreaterThan(0)

    const result = checkpoint(db)
    expect(result.ok).toBe(true)
    expect(result.pagesInWal).toBeGreaterThan(0)
    expect(result.pagesCheckpointed).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)

    // After TRUNCATE the WAL file should be zero-length (it still exists
    // because WAL mode keeps the file around).
    const walSizeAfter = statSync(walPath).size
    expect(walSizeAfter).toBe(0)
  })

  it('returns ok:false / zeroed result when called with no DB available', () => {
    const result = checkpoint(undefined)
    expect(result.ok).toBe(false)
    expect(result.pagesInWal).toBe(0)
    expect(result.pagesCheckpointed).toBe(0)
  })

  it('is a no-op (ok:true, pages 0) on a freshly-opened DB with empty WAL', () => {
    // Brand-new DB, no inserts. WAL is empty.
    const result = checkpoint(db)
    // PASSIVE-equivalent on an empty WAL still reports ok with 0 pages.
    expect(result.ok).toBe(true)
    expect(result.pagesCheckpointed).toBe(0)
  })
})

describe.skipIf(!HAS_NATIVE_SQLITE)('startPeriodicCheckpoint (PS2)', () => {
  // We test the timer scheduling contract without actually waiting 5
  // minutes — the unit under test is the lifecycle (idempotent start +
  // working stop), not the timer's accuracy.

  it('rejects non-positive intervals', () => {
    expect(() => startPeriodicCheckpoint(0)).toThrowError(/invalid intervalMs/)
    expect(() => startPeriodicCheckpoint(-1)).toThrowError(/invalid intervalMs/)
    expect(() => startPeriodicCheckpoint(Number.NaN)).toThrowError(/invalid intervalMs/)
  })

  it('returns a stop function that cancels the timer', () => {
    const stop = startPeriodicCheckpoint(100_000)
    expect(typeof stop).toBe('function')
    stop()
    // After stop, the result accessor still works (returns whatever the
    // last tick saw, or null if no tick fired).
    expect(getLastCheckpointResult()).toBeNull()
  })

  it('is idempotent — second start returns a working stop for the live timer', () => {
    const stop1 = startPeriodicCheckpoint(100_000)
    const stop2 = startPeriodicCheckpoint(100_000)
    // Both stops should be callable without throwing.
    stop2()
    stop1()
  })
})
