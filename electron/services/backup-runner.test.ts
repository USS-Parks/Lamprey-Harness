import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync, existsSync, statSync, writeFileSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let appPathForTest = '.'

vi.mock('electron', () => ({
  app: {
    getPath: () => appPathForTest
  }
}))

import {
  createBackup,
  listBackups,
  pruneOldBackups,
  restoreFromBackup,
  startBackupRunner
} from './backup-runner'

const HAS_NATIVE_SQLITE: boolean = (() => {
  try {
    const probe = new BetterSqlite3(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!HAS_NATIVE_SQLITE)('backup-runner (PS5)', () => {
  let tmpDir: string
  let dbPath: string
  let backupDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lamprey-ps5-'))
    appPathForTest = tmpDir
    dbPath = join(tmpDir, 'lamprey.db')
    backupDir = join(tmpDir, 'backups')

    // Seed a real DB with some content so the backup has something to copy.
    const db = new BetterSqlite3(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
    const insert = db.prepare('INSERT INTO t (v) VALUES (?)')
    for (let i = 0; i < 50; i++) insert.run(`val-${i}`)
    db.close()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('createBackup creates a valid copy under YYYY-MM-DD filename', async () => {
    const info = await createBackup(dbPath, backupDir, 'test')
    expect(existsSync(info.path)).toBe(true)
    expect(info.name).toMatch(/^lamprey-\d{4}-\d{2}-\d{2}\.db$/)
    expect(info.bytes).toBeGreaterThan(0)
    expect(info.reason).toBe('test')

    // Verify the copy is a valid SQLite DB with the seeded data.
    const copy = new BetterSqlite3(info.path, { readonly: true })
    const row = copy.prepare('SELECT COUNT(*) AS c FROM t').get() as { c: number }
    expect(row.c).toBe(50)
    copy.close()
  })

  it('createBackup is idempotent within the same day (overwrites)', async () => {
    await createBackup(dbPath, backupDir, 'first')
    const second = await createBackup(dbPath, backupDir, 'second')
    expect(second.reason).toBe('second')
    const list = listBackups(backupDir)
    expect(list).toHaveLength(1)
  })

  it('listBackups returns newest-first', () => {
    // Stamp two files manually with distinct mtimes.
    const path1 = join(backupDir, 'lamprey-2026-01-01.db')
    const path2 = join(backupDir, 'lamprey-2026-06-01.db')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(path1, 'fake1')
    writeFileSync(path2, 'fake2')
    // Set mtimes deliberately.
    utimesSync(path1, new Date('2026-01-01'), new Date('2026-01-01'))
    utimesSync(path2, new Date('2026-06-01'), new Date('2026-06-01'))
    const list = listBackups(backupDir)
    expect(list).toHaveLength(2)
    expect(list[0].name).toBe('lamprey-2026-06-01.db')
    expect(list[1].name).toBe('lamprey-2026-01-01.db')
  })

  it('listBackups returns empty array when backupDir does not exist', () => {
    expect(listBackups(join(tmpDir, 'nope'))).toEqual([])
  })

  it('listBackups skips files that do not match the naming pattern', () => {
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'lamprey-2026-06-01.db'), 'ok')
    writeFileSync(join(backupDir, 'random.db'), 'no')
    writeFileSync(join(backupDir, 'lamprey-2026-06-01.db.bak'), 'no')
    const list = listBackups(backupDir)
    expect(list.map((b) => b.name)).toEqual(['lamprey-2026-06-01.db'])
  })

  it('pruneOldBackups deletes files older than retentionDays', () => {
    mkdirSync(backupDir, { recursive: true })
    const old = join(backupDir, 'lamprey-2020-01-01.db')
    const recent = join(backupDir, 'lamprey-2026-06-01.db')
    writeFileSync(old, 'old')
    writeFileSync(recent, 'recent')
    const twentyDaysAgo = Date.now() - 20 * 24 * 60 * 60 * 1000
    utimesSync(old, new Date(twentyDaysAgo - 86400_000), new Date(twentyDaysAgo - 86400_000))
    utimesSync(recent, new Date(), new Date())
    const deleted = pruneOldBackups(backupDir, 14)
    expect(deleted).toContain(old)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(recent)).toBe(true)
  })

  it('restoreFromBackup moves current DB aside + copies backup into place', async () => {
    const backup = await createBackup(dbPath, backupDir, 'baseline')

    // Corrupt the live DB.
    writeFileSync(dbPath, Buffer.alloc(128, 0xff))

    const info = await restoreFromBackup(dbPath, backup.path)
    expect(info.movedTo).toMatch(/\.corrupt-/)
    expect(existsSync(info.movedTo)).toBe(true)
    expect(existsSync(dbPath)).toBe(true)

    // The restored DB should be valid and contain the seeded rows.
    const reopened = new BetterSqlite3(dbPath, { readonly: true })
    const row = reopened.prepare('SELECT COUNT(*) AS c FROM t').get() as { c: number }
    expect(row.c).toBe(50)
    reopened.close()
  })

  it('restoreFromBackup refuses unrecognized backup filenames', async () => {
    const weird = join(tmpDir, 'random.db')
    writeFileSync(weird, 'no')
    await expect(restoreFromBackup(dbPath, weird)).rejects.toThrowError(
      /not a recognized backup filename/
    )
  })

  it('restoreFromBackup refuses missing backup path', async () => {
    await expect(
      restoreFromBackup(dbPath, join(backupDir, 'lamprey-2026-06-01.db'))
    ).rejects.toThrowError(/backup file not found/)
  })
})

describe('backup-runner timer lifecycle', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lamprey-ps5-timer-'))
    appPathForTest = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('stop cancels the delayed first periodic backup tick', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const stop = startBackupRunner({ intervalMs: 60_000 })
      stop()
      await vi.advanceTimersByTimeAsync(30_001)
      expect(warn).not.toHaveBeenCalledWith(
        '[backup-runner] periodic backup failed:',
        expect.anything()
      )
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })
})
