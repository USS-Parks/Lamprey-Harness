import { randomUUID } from 'crypto'
import { getDb } from './database'

export type HookEvent =
  | 'sessionStart'
  | 'promptSubmit'
  | 'preToolUse'
  | 'postToolUse'
  | 'agentStop'

export interface HookRow {
  id: string
  event: HookEvent
  label: string
  command: string
  enabled: 0 | 1
  created_at: number
}

export interface Hook {
  id: string
  event: HookEvent
  label: string
  command: string
  enabled: boolean
  createdAt: number
}

function fromRow(r: HookRow): Hook {
  return {
    id: r.id,
    event: r.event,
    label: r.label,
    command: r.command,
    enabled: !!r.enabled,
    createdAt: r.created_at
  }
}

export function listHooks(): Hook[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM hooks ORDER BY event, created_at').all() as HookRow[]
  return rows.map(fromRow)
}

export function listHooksForEvent(event: HookEvent): Hook[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM hooks WHERE event = ? AND enabled = 1 ORDER BY created_at')
    .all(event) as HookRow[]
  return rows.map(fromRow)
}

export function createHook(input: {
  event: HookEvent
  label: string
  command: string
}): Hook {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    'INSERT INTO hooks (id, event, label, command, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(id, input.event, input.label, input.command, now)
  return {
    id,
    event: input.event,
    label: input.label,
    command: input.command,
    enabled: true,
    createdAt: now
  }
}

export function updateHook(
  id: string,
  patch: Partial<{ event: HookEvent; label: string; command: string; enabled: boolean }>
): void {
  const db = getDb()
  const cur = db.prepare('SELECT * FROM hooks WHERE id = ?').get(id) as HookRow | undefined
  if (!cur) return
  const next: HookRow = {
    ...cur,
    ...(patch.event !== undefined ? { event: patch.event } : {}),
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.command !== undefined ? { command: patch.command } : {}),
    ...(patch.enabled !== undefined ? { enabled: (patch.enabled ? 1 : 0) as 0 | 1 } : {})
  }
  db.prepare(
    'UPDATE hooks SET event = ?, label = ?, command = ?, enabled = ? WHERE id = ?'
  ).run(next.event, next.label, next.command, next.enabled, id)
}

export function deleteHook(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM hooks WHERE id = ?').run(id)
}
