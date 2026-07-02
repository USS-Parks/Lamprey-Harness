// JM-18 (July 2026 Maintenance, DB-9) — startup retention sweep.
//
// Five audit-class tables had NO pruning path anywhere: `events` (~288 rows
// per day from persistence checkpoints alone), `tool_calls` (one row per
// tool invocation forever), `snip_command_log` (one row per shell command),
// fired `loop_wakeups`, and `loop_runs`. A daily-use install accumulated
// hundreds of thousands of rows; DB size, nightly-backup size, and
// integrity-check time all degraded with no ceiling.
//
// The sweep mirrors the spill-GC / backup-prune patterns: deferred startup
// call, best-effort per table (older DBs may lack some tables), bounded by a
// configurable window. `auditRetentionDays: 0` disables it entirely — the
// app-wide "0 disables" convention.

import { getDb } from './database'
import { readSettings } from './settings-helper'

export const DEFAULT_RETENTION_DAYS = 90

export interface SweepResult {
  table: string
  deleted: number
}

/** Pure: resolve the retention window from raw settings. */
export function resolveRetentionDays(raw: Record<string, unknown> | null): number {
  const v = raw?.auditRetentionDays
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  return DEFAULT_RETENTION_DAYS
}

export function runRetentionSweep(now = Date.now()): SweepResult[] {
  let days: number
  try {
    days = resolveRetentionDays(readSettings())
  } catch {
    days = DEFAULT_RETENTION_DAYS
  }
  if (days <= 0) return []
  const cutoff = now - days * 24 * 60 * 60 * 1000
  const db = getDb()
  const results: SweepResult[] = []
  const sweep = (table: string, sql: string): void => {
    try {
      results.push({ table, deleted: db.prepare(sql).run(cutoff).changes })
    } catch (err) {
      // Table absent on older DBs, or locked — skip; next boot retries.
      console.warn(`[retention] ${table} sweep skipped:`, (err as Error).message)
    }
  }
  sweep('events', 'DELETE FROM events WHERE created_at < ?')
  sweep('tool_calls', 'DELETE FROM tool_calls WHERE started_at < ?')
  sweep('snip_command_log', 'DELETE FROM snip_command_log WHERE ts < ?')
  sweep('snip_events', 'DELETE FROM snip_events WHERE ts < ?')
  sweep(
    'loop_wakeups',
    "DELETE FROM loop_wakeups WHERE status != 'pending' AND fire_at < ?"
  )
  sweep('loop_runs', 'DELETE FROM loop_runs WHERE finished_at IS NOT NULL AND finished_at < ?')
  return results
}
