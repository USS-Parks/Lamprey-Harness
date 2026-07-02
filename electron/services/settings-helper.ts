import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

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
    const value = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    cache = { mtimeMs, value }
    return { ...value }
  } catch {
    return {}
  }
}

export function patchSettings(patch: Record<string, unknown>): void {
  const current = readSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8')
  cache = null
}
