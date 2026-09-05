import { app } from 'electron'
import { join, basename, dirname, resolve } from 'path'
import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  realpathSync
} from 'fs'
import { getDb, checkpoint, openReadonlyHandleAt, closeDb, isPersistenceReadOnlyMode, setPersistenceReadOnlyMode } from './database'
import { recordEvent } from './event-log'

// JM-18 (DB-11) — consecutive-failure tracking + injectable warning sink
// (main.ts wires reportToRenderer so the renderer toasts it).
let consecutiveBackupFailures = 0
let backupWarningEmitter: ((message: string) => void) | null = null

export function setBackupWarningEmitter(fn: ((message: string) => void) | null): void {
  backupWarningEmitter = fn
}

// Persistence Phase / PS5 — daily SQLite backups + rolling retention +
// restore.
//
// better-sqlite3 exposes db.backup(destPath, opts) which is a wrapper
// around SQLite's online backup API. Page-by-page copy with explicit
// step size means we can run it while the DB is in use without blocking
// writes for the full duration. We use a 100-page step (~400 KB at the
// default 4KB page size) with no yield between steps — the call is
// synchronous from JS's point of view, but each step releases the
// shared lock so streaming writes proceed in between.
//
// Backups live at `userData/backups/lamprey-YYYY-MM-DD.db` (one per
// day; same-day calls overwrite). Restore validates a staged copy before
// switching the live handle and retains the original files for recovery.

export interface BackupInfo {
  path: string
  /** Display label, e.g. 'lamprey-2026-06-06.db'. */
  name: string
  /** When the file was last modified (= backup time). */
  mtime: number
  /** File size in bytes. */
  bytes: number
  /** Reason recorded at create time (free-form). */
  reason?: string
}

const BACKUP_FILE_PATTERN = /^lamprey-(\d{4}-\d{2}-\d{2})\.db$/

const DEFAULT_RETENTION_DAYS = 14
const BACKUP_STEP_PAGES = 100

function ymdUtc(date: Date): string {
  // YYYY-MM-DD in UTC so a user crossing midnight in their local
  // timezone doesn't accidentally double-backup or skip a day.
  return date.toISOString().slice(0, 10)
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * PS5 — create a backup of `dbPath` under `backupDir`. Returns metadata
 * about the created file. Same-day calls overwrite (the filename is
 * the YYYY-MM-DD stamp). Reason is recorded for the audit trail (PS22).
 *
 * Strategy:
 *   1. Checkpoint the live DB first so the backup is taken from the
 *      main DB file rather than the WAL — guarantees the backup is a
 *      consistent snapshot at the moment of the checkpoint.
 *   2. Use better-sqlite3's `db.backup(destPath, { progress })` for the
 *      online copy. The callback receives `{ totalPages, remainingPages }`
 *      after each step; we don't surface progress to the renderer yet
 *      (PS10 could) but log it.
 */
export async function createBackup(
  dbPath: string,
  backupDir: string,
  reason: string = 'periodic'
): Promise<BackupInfo> {
  ensureDir(backupDir)
  const now = new Date()
  const filename = `lamprey-${ymdUtc(now)}.db`
  const destPath = join(backupDir, filename)
  // Pre-flight: checkpoint so the WAL has been folded into the main DB
  // file. If the cached DB handle isn't open (test paths), skip — the
  // backup is still valid, just possibly missing the last few writes.
  try {
    checkpoint()
  } catch (err) {
    console.warn('[backup-runner] pre-backup checkpoint failed (continuing):', err)
  }
  // Open the source for backup. We deliberately open a NEW handle here
  // rather than using the cached `getDb()` — better-sqlite3's backup
  // API doesn't require shared handles, and opening fresh avoids any
  // interaction with the cached connection's transaction state.
  // JM-18 (DB-11): encryption-aware — a bare open threw on SQLCipher DBs,
  // silently producing ZERO backups while the user believed they had 14 days.
  const source = openReadonlyHandleAt(dbPath)
  try {
    // better-sqlite3 12.x ships `db.backup(destination, opts)` which
    // returns a Promise resolving once the page-by-page copy completes.
    // 100 pages per step (~400KB at the default 4KB page size); each
    // step yields the shared lock so streaming writes proceed in
    // between. Total wall time for a typical multi-MB DB is in the
    // hundreds of ms.
    await source.backup(destPath, {
      progress: () => BACKUP_STEP_PAGES
    })
  } finally {
    try {
      source.close()
    } catch {
      /* already closed */
    }
  }
  const stat = statSync(destPath)
  const info: BackupInfo = {
    path: destPath,
    name: filename,
    mtime: stat.mtimeMs,
    bytes: stat.size,
    reason
  }
  // PS22 — emit. Backup events let the Activity Timeline show "last
  // backup" pulses + flag missing nightly runs.
  try {
    recordEvent({
      type: 'persistence.backup',
      actorKind: 'system',
      severity: 'info',
      payload: {
        path: destPath,
        bytes: stat.size,
        reason
      }
    })
  } catch {
    /* non-fatal */
  }
  return info
}

/**
 * PS5 — list known backups in `backupDir`, newest first. Files that
 * don't match the naming pattern are skipped (so a user dropping
 * unrelated files in the directory doesn't break the list).
 */
export function listBackups(backupDir: string): BackupInfo[] {
  if (!existsSync(backupDir)) return []
  const entries = readdirSync(backupDir, { withFileTypes: true })
  const infos: BackupInfo[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!BACKUP_FILE_PATTERN.test(entry.name)) continue
    const fullPath = join(backupDir, entry.name)
    try {
      const stat = statSync(fullPath)
      infos.push({
        path: fullPath,
        name: entry.name,
        mtime: stat.mtimeMs,
        bytes: stat.size
      })
    } catch {
      /* unreadable file; skip */
    }
  }
  infos.sort((a, b) => b.mtime - a.mtime)
  return infos
}

/**
 * PS5 — prune backups older than `retentionDays`. Returns the list of
 * files actually deleted. Idempotent: a second call with no eligible
 * deletions is a no-op.
 */
export function pruneOldBackups(
  backupDir: string,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): string[] {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const deleted: string[] = []
  for (const info of listBackups(backupDir)) {
    if (info.mtime < cutoff) {
      try {
        unlinkSync(info.path)
        deleted.push(info.path)
      } catch (err) {
        console.warn(`[backup-runner] failed to prune ${info.path}:`, err)
      }
    }
  }
  return deleted
}

/** Validates and stages the backup before closing the live DB, then switches
 * synchronously. The original files remain available for recovery; failures
 * during switching roll them back before returning an error. */
export interface RestoreInfo {
  movedTo: string
  restoredFrom: string
  restoredAt: number
}

export async function restoreFromBackup(
  dbPath: string,
  backupPath: string
): Promise<RestoreInfo> {
  if (!existsSync(backupPath)) {
    throw new Error(`restoreFromBackup: backup file not found: ${backupPath}`)
  }
  const name = basename(backupPath)
  if (!BACKUP_FILE_PATTERN.test(name)) {
    throw new Error(
      `restoreFromBackup: not a recognized backup filename: ${name}`
    )
  }
  const allowedDirectory = realpathSync(join(dirname(dbPath), 'backups'))
  if (dirname(realpathSync(backupPath)) !== allowedDirectory) {
    throw new Error('restoreFromBackup: backup is outside the application backup directory')
  }
  const key = resolve(dbPath)
  if (activeRestores.has(key)) throw new Error('A database restore is already running')
  activeRestores.add(key)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const corruptPath = `${dbPath}.corrupt-${ts}-${randomUUID().slice(0, 8)}`
  const staged = `${dbPath}.restore-${randomUUID()}`
  const oldReadOnly = isPersistenceReadOnlyMode()
  try {
    const source = openReadonlyHandleAt(backupPath)
    try {
      if (source.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed')
      await source.backup(staged, { progress: () => BACKUP_STEP_PAGES })
    } finally { source.close() }
    const stagedDb = openReadonlyHandleAt(staged)
    try {
      if (stagedDb.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Staged backup integrity check failed')
    } finally { stagedDb.close() }

    // All asynchronous work finished before closing the live handle. Keep the
    // original database and every sidecar until the replacement opens successfully.
    closeDb({ checkpoint: false })
    const moved: Array<[string, string]> = []
    let installed = false
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        const original = `${dbPath}${suffix}`
        if (!existsSync(original)) continue
        const preserved = `${corruptPath}${suffix}`
        renameSync(original, preserved)
        moved.push([original, preserved])
      }
      renameSync(staged, dbPath)
      installed = true
      setPersistenceReadOnlyMode(false)
      getDb()
    } catch (error) {
      const recoveryErrors: unknown[] = []
      try {
        closeDb({ checkpoint: false })
        if (installed) {
          for (const suffix of ['', '-wal', '-shm']) {
            if (existsSync(`${dbPath}${suffix}`)) renameSync(`${dbPath}${suffix}`, `${staged}.failed${suffix}`)
          }
        }
        for (const [original, preserved] of moved.reverse()) renameSync(preserved, original)
        setPersistenceReadOnlyMode(oldReadOnly)
      } catch (recoveryError) { recoveryErrors.push(recoveryError) }
      throw new AggregateError([error, ...recoveryErrors],
        `Database restore failed. Original files retained at ${recoveryErrors.length ? corruptPath : dbPath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error })
    }
  } finally {
    activeRestores.delete(key)
    try {
      if (existsSync(staged)) unlinkSync(staged)
    } catch (error) { console.warn('[backup-runner] staged restore file retained:', staged, error) }
  }
  const result: RestoreInfo = {
    movedTo: corruptPath,
    restoredFrom: backupPath,
    restoredAt: Date.now()
  }
  // PS22 — recovery is a high-signal event; severity 'warning' so the
  // timeline surfaces it (a restore implies the previous DB was suspect).
  try {
    recordEvent({
      type: 'persistence.recovery',
      actorKind: 'user',
      severity: 'warning',
      payload: {
        fromPath: backupPath,
        toPath: dbPath,
        movedTo: corruptPath
      }
    })
  } catch {
    /* non-fatal */
  }
  return result
}

const activeRestores = new Set<string>()

// Periodic runner — schedules `createBackup` once per day at startup
// and on a 24h interval. Idempotent: same-day backup overwrites; second
// startup call rebinds the timer.
let backupTimer: NodeJS.Timeout | null = null
let initialBackupTimer: NodeJS.Timeout | null = null

export function startBackupRunner(opts?: {
  intervalMs?: number
  retentionDays?: number
}): () => void {
  if (backupTimer) {
    const live = backupTimer
    const initial = initialBackupTimer
    return () => {
      if (initialBackupTimer === initial && initialBackupTimer) {
        clearTimeout(initialBackupTimer)
        initialBackupTimer = null
      }
      if (backupTimer === live) {
        clearInterval(live)
        backupTimer = null
      }
    }
  }
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000
  const retentionDays = opts?.retentionDays ?? DEFAULT_RETENTION_DAYS
  const dbPath = join(app.getPath('userData'), 'lamprey.db')
  const backupDir = join(app.getPath('userData'), 'backups')
  const tick = (): void => {
    createBackup(dbPath, backupDir, 'periodic')
      .then(() => {
        consecutiveBackupFailures = 0
        pruneOldBackups(backupDir, retentionDays)
      })
      .catch((err) => {
        console.warn('[backup-runner] periodic backup failed:', err)
        // JM-18 (DB-11) — a silently-failing backup is worse than none: the
        // user believes they're covered. After 3 consecutive failures,
        // surface it in the renderer.
        consecutiveBackupFailures++
        if (consecutiveBackupFailures >= 3 && backupWarningEmitter) {
          backupWarningEmitter(
            `Database backups have failed ${consecutiveBackupFailures} times in a row: ${
              (err as Error)?.message ?? 'unknown error'
            }. Your data is NOT being backed up.`
          )
        }
      })
  }
  // Fire the first tick after a 30s delay so startup isn't slowed and
  // the first backup happens once the app is settled.
  initialBackupTimer = setTimeout(() => {
    initialBackupTimer = null
    tick()
  }, 30_000)
  initialBackupTimer.unref?.()
  backupTimer = setInterval(tick, intervalMs)
  backupTimer.unref?.()
  return () => {
    if (initialBackupTimer) {
      clearTimeout(initialBackupTimer)
      initialBackupTimer = null
    }
    if (backupTimer) {
      clearInterval(backupTimer)
      backupTimer = null
    }
  }
}
