import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const fault = vi.hoisted(() => ({ directory: '', rename: '', copy: false, reopen: false, moves: [] as string[] }))
vi.mock('electron', () => ({ app: { getPath: () => fault.directory }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>()
  return { ...actual, renameSync: (...args: Parameters<typeof actual.renameSync>) => {
    const from = String(args[0]); const to = String(args[1])
    fault.moves.push(from)
    if ((fault.rename === 'live' && to.includes('.corrupt-')) ||
        (fault.rename === 'sidecar' && from.endsWith('-wal')) ||
        (fault.rename === 'install' && from.includes('.restore-') && to.endsWith('lamprey.db'))) {
      fault.rename = ''
      throw new Error('fixture move failure')
    }
    actual.renameSync(...args)
  } }
})
vi.mock('./database', async (original) => {
  const actual = await original<typeof import('./database')>()
  return { ...actual,
    getDb: () => {
      if (fault.reopen) { fault.reopen = false; throw new Error('fixture reopen failure') }
      return actual.getDb()
    },
    openReadonlyHandleAt: (file: string) => {
      const handle = actual.openReadonlyHandleAt(file)
      if (fault.copy) {
        fault.copy = false
        handle.backup = async () => { throw new Error('fixture copy failure') }
      }
      return handle
    }
  }
})
import { __setUserDataForTests, closeDb, getDb } from './database'
import { restoreFromBackup } from './backup-runner'
const HAS_NATIVE_SQLITE = (() => {
  try { const db = new Database(':memory:'); db.close(); return true } catch { return false }
})()
describe.skipIf(!HAS_NATIVE_SQLITE)('recoverable restore with native SQLite', () => {
  let directory: string, live: string, backup: string, original: Buffer
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(),'lamprey-restore-test-'))
    fault.directory = directory
    __setUserDataForTests(directory)
    live = join(directory,'lamprey.db')
    mkdirSync(join(directory,'backups'))
    backup = join(directory,'backups','lamprey-2026-09-05.db')
    for (const [file, value] of [[live, 'live'], [backup, 'backup']]) {
      const db = new Database(file)
      db.exec('CREATE TABLE preserved (value TEXT)')
      db.prepare('INSERT INTO preserved VALUES (?)').run(value)
      db.close()
    }
    original = readFileSync(live)
    fault.moves = []
  })
  afterEach(() => {
    fault.copy = false; fault.reopen = false; fault.rename = ''
    __setUserDataForTests(null)
  })
  it('rejects invalid SQLite without closing or moving the live database', async () => {
    const handle = getDb()
    writeFileSync(backup,'invalid database')
    const bytes = readFileSync(live)
    await expect(restoreFromBackup(live,backup)).rejects.toThrow()
    expect(getDb()).toBe(handle)
    expect(readFileSync(live)).toEqual(bytes)
    expect(fault.moves).toEqual([])
  })
  it('rejects correctly named files outside the authorized backup directory', async () => {
    const outside = join(directory,'lamprey-2026-09-04.db')
    writeFileSync(outside,readFileSync(backup))
    await expect(restoreFromBackup(live,outside)).rejects.toThrow('outside')
    expect(readFileSync(live)).toEqual(original)
    expect(fault.moves).toEqual([])
  })
  it('preserves the live database when staging fails', async () => {
    fault.copy = true
    await expect(restoreFromBackup(live,backup)).rejects.toThrow('copy failure')
    expect(readFileSync(live)).toEqual(original)
    expect(fault.moves).toEqual([])
  })
  it.each(['live','sidecar','install'])('rolls back a %s move failure', async (phase) => {
    closeDb()
    writeFileSync(live+'-wal','fixture sidecar')
    writeFileSync(live+'-shm','fixture shared memory')
    fault.rename = phase
    await expect(restoreFromBackup(live,backup)).rejects.toThrow('move failure')
    expect(readFileSync(live)).toEqual(original)
    expect(readFileSync(live+'-wal','utf8')).toBe('fixture sidecar')
    expect(readFileSync(live+'-shm','utf8')).toBe('fixture shared memory')
  })
  it('restores the original file when the installed database cannot reopen', async () => {
    fault.reopen = true
    await expect(restoreFromBackup(live,backup)).rejects.toThrow('reopen failure')
    expect(readFileSync(live)).toEqual(original)
    expect(getDb().prepare('SELECT value FROM preserved').get()).toEqual({ value: 'live' })
  })
  it('opens a valid replacement and retains the original file', async () => {
    const result = await restoreFromBackup(live,backup)
    expect(readFileSync(result.movedTo)).toEqual(original)
    expect(getDb().pragma('integrity_check',{ simple: true })).toBe('ok')
    expect(getDb().prepare('SELECT value FROM preserved').get()).toEqual({ value: 'backup' })
  })
  it('rejects overlapping restores for the same database', async () => {
    const first = restoreFromBackup(live,backup)
    await expect(restoreFromBackup(live,backup)).rejects.toThrow('already running')
    await first
    expect(getDb().prepare('SELECT value FROM preserved').get()).toEqual({ value: 'backup' })
  })
})
