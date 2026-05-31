import { randomUUID } from 'crypto'
import { getDb } from './database'

export interface AutomationRow {
  id: string
  label: string
  cron: string
  prompt: string
  model: string | null
  enabled: 0 | 1
  created_at: number
  last_run_at: number | null
  last_result: string | null
}

export interface Automation {
  id: string
  label: string
  cron: string
  prompt: string
  model: string | null
  enabled: boolean
  createdAt: number
  lastRunAt: number | null
  lastResult: string | null
}

function fromRow(r: AutomationRow): Automation {
  return {
    id: r.id,
    label: r.label,
    cron: r.cron,
    prompt: r.prompt,
    model: r.model,
    enabled: !!r.enabled,
    createdAt: r.created_at,
    lastRunAt: r.last_run_at,
    lastResult: r.last_result
  }
}

export function listAutomations(): Automation[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM automations ORDER BY created_at DESC')
    .all() as AutomationRow[]
  return rows.map(fromRow)
}

export function getAutomation(id: string): Automation | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as
    | AutomationRow
    | undefined
  return row ? fromRow(row) : null
}

export function createAutomation(input: {
  label: string
  cron: string
  prompt: string
  model?: string | null
}): Automation {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    'INSERT INTO automations (id, label, cron, prompt, model, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  ).run(id, input.label, input.cron, input.prompt, input.model ?? null, now)
  return {
    id,
    label: input.label,
    cron: input.cron,
    prompt: input.prompt,
    model: input.model ?? null,
    enabled: true,
    createdAt: now,
    lastRunAt: null,
    lastResult: null
  }
}

export function updateAutomation(
  id: string,
  patch: Partial<{
    label: string
    cron: string
    prompt: string
    model: string | null
    enabled: boolean
  }>
): void {
  const db = getDb()
  const cur = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as
    | AutomationRow
    | undefined
  if (!cur) return
  const next: AutomationRow = {
    ...cur,
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
    ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
    ...(patch.model !== undefined ? { model: patch.model } : {}),
    ...(patch.enabled !== undefined ? { enabled: (patch.enabled ? 1 : 0) as 0 | 1 } : {})
  }
  db.prepare(
    'UPDATE automations SET label = ?, cron = ?, prompt = ?, model = ?, enabled = ? WHERE id = ?'
  ).run(next.label, next.cron, next.prompt, next.model, next.enabled, id)
}

export function recordRun(id: string, result: string): void {
  const db = getDb()
  db.prepare('UPDATE automations SET last_run_at = ?, last_result = ? WHERE id = ?').run(
    Date.now(),
    result,
    id
  )
}

export function deleteAutomation(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM automations WHERE id = ?').run(id)
}
