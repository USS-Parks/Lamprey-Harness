import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { writeJsonAtomic, readJsonGuarded } from './atomic-json'

const settingsPath = () => join(app.getPath('userData'), 'settings.json')

// JM-12 (CC-22) — mtime-keyed cache. settings.json was parsed by five
// independent readers, including once per TOOL ROUND in chat.ts. Callers
// receive a shallow copy so a mutated return value can't poison the cache.
let cache: { mtimeMs: number; value: Record<string, unknown> } | null = null

export function readSettings(): Record<string, unknown> {
  const path = settingsPath()
  try {
    if (!existsSync(path)) return {}
    const mtimeMs = statSync(path).mtimeMs
    if (cache && cache.mtimeMs === mtimeMs) return { ...cache.value }
    // JM-13 (DB-2) — guarded read: a torn settings.json is preserved aside
    // instead of being silently "healed" to {} and then overwritten with a
    // near-empty object by the next writer.
    const value = readJsonGuarded(path).value ?? {}
    cache = { mtimeMs, value }
    return { ...value }
  } catch {
    return {}
  }
}

/** JM-13 (DB-2) — THE settings.json writer. All main-process modules route
 *  through this (or patchSettings): atomic temp+rename, cache invalidation.
 *  Interleaved read-modify-write between processes is still last-write-wins
 *  (documented DB-13 residual); torn files are no longer possible. */
export function writeSettingsFile(value: Record<string, unknown>): void {
  writeJsonAtomic(settingsPath(), value)
  cache = null
}

export function patchSettings(patch: Record<string, unknown>): void {
  const current = readSettings()
  writeSettingsFile({ ...current, ...patch })
}
