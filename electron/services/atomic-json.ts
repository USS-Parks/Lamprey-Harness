// JM-13 (July 2026 Maintenance, DB-1/DB-2) — crash-safe JSON persistence.
//
// keys.json and settings.json were written with a bare writeFileSync and read
// with a parse-error-→-{} fallback. The combination is a data destroyer: a
// crash mid-write leaves torn JSON, the next reader "heals" it to {}, and the
// next writer persists the empty object — every provider key / every setting
// gone with no signal. Two rules fix it:
//
//   1. Writes go to a temp file then rename over the target (atomic on the
//      same volume; on Windows libuv maps rename to MoveFileExW with
//      MOVEFILE_REPLACE_EXISTING).
//   2. A corrupt file is PRESERVED aside (`<path>.corrupt-<ts>`) before the
//      reader falls back, so no later write can destroy recoverable data.

import { writeFileSync, renameSync, existsSync, readFileSync, chmodSync } from 'fs'
import { randomUUID } from 'crypto'

export function writeJsonAtomic(
  path: string,
  value: unknown,
  opts: { mode?: number } = {}
): void {
  const tmp = `${path}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`
  writeFileSync(tmp, JSON.stringify(value, null, 2), {
    encoding: 'utf-8',
    ...(opts.mode !== undefined && { mode: opts.mode })
  })
  renameSync(tmp, path)
  if (opts.mode !== undefined) {
    try {
      chmodSync(path, opts.mode)
    } catch {
      // Windows can reject chmod on ACL-controlled paths; advisory there.
    }
  }
}

export interface GuardedJsonRead {
  value: Record<string, unknown> | null
  corrupt: boolean
  preservedAs?: string
}

export function readJsonGuarded(path: string): GuardedJsonRead {
  if (!existsSync(path)) return { value: null, corrupt: false }
  let rawText: string
  try {
    rawText = readFileSync(path, 'utf-8')
  } catch {
    return { value: null, corrupt: false }
  }
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>
    return { value: parsed, corrupt: false }
  } catch {
    const preservedAs = `${path}.corrupt-${Date.now()}`
    try {
      renameSync(path, preservedAs)
      console.error(
        `[atomic-json] ${path} was corrupt JSON; preserved as ${preservedAs} — falling back to defaults`
      )
      return { value: null, corrupt: true, preservedAs }
    } catch {
      console.error(`[atomic-json] ${path} is corrupt JSON and could not be preserved aside`)
      return { value: null, corrupt: true }
    }
  }
}
