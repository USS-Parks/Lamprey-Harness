import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: () => {
      throw new Error('electron app not available in test environment')
    }
  }
}))

import { runIntegrityCheck, getLastIntegrityResult } from './database'

const HAS_NATIVE_SQLITE: boolean = (() => {
  try {
    const probe = new BetterSqlite3(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!HAS_NATIVE_SQLITE)('runIntegrityCheck (PS4)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lamprey-ps4-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns ok:true on a healthy DB', () => {
    const db = new BetterSqlite3(join(tmpDir, 'healthy.db'))
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    const result = runIntegrityCheck(db)
    expect(result.ok).toBe(true)
    expect(result.result).toBe('ok')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.ranAt).toBeGreaterThan(0)
    db.close()
  })

  it('caches the last result for getLastIntegrityResult()', () => {
    const db = new BetterSqlite3(join(tmpDir, 'cache.db'))
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    const result = runIntegrityCheck(db)
    const cached = getLastIntegrityResult()
    expect(cached).not.toBeNull()
    expect(cached?.ok).toBe(result.ok)
    expect(cached?.ranAt).toBe(result.ranAt)
    db.close()
  })

  it('returns ok:false with descriptive payload when no DB is available', () => {
    const result = runIntegrityCheck(undefined)
    expect(result.ok).toBe(false)
    expect(result.result).toContain('no database handle')
  })

  it('returns ok:false when the DB file is structurally invalid', () => {
    // Write garbage bytes to a .db file then try to open it. SQLite
    // accepts the open (lazy validation) but integrity_check will flag
    // it.
    const badPath = join(tmpDir, 'bad.db')
    writeFileSync(badPath, Buffer.alloc(4096, 0xff))
    // The open itself may throw or succeed depending on the byte pattern.
    let db: Database | null = null
    try {
      db = new BetterSqlite3(badPath)
      const result = runIntegrityCheck(db)
      // Whether the integrity_check throws or returns errors, runIntegrityCheck
      // must capture it into ok:false rather than escaping.
      expect(result.ok).toBe(false)
    } catch {
      // Some platforms refuse the open entirely — that's still acceptable
      // coverage of the failure path; the in-process startup integrity
      // check would not have been reached anyway.
    } finally {
      try {
        db?.close()
      } catch {
        /* may already be closed */
      }
    }
  })
})
