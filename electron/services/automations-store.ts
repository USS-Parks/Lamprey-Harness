import { randomUUID } from 'crypto'
import { getDb } from './database'
import {
  initialNextRunAt,
  legacyCronTrigger,
  parseAutomationTrigger,
  parseStoredAutomationTrigger,
  serializeAutomationTrigger,
  type AutomationTrigger,
  type AutomationTriggerKind
} from './automation-trigger'

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
  trigger_kind: AutomationTriggerKind
  trigger_config_json: string
  next_run_at: number | null
  last_trigger_key: string | null
  retry_attempt: number
  retry_at: number | null
  disabled_reason: string | null
  goal_id: string | null
  goal_conversation_id: string | null
  loop_max_iterations: number | null
  loop_max_wallclock_ms: number | null
  loop_token_budget: number | null
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
  trigger: AutomationTrigger
  nextRunAt: number | null
  lastTriggerKey: string | null
  retryAttempt: number
  retryAt: number | null
  disabledReason: string | null
  goalId: string | null
  goalConversationId: string | null
  loopMaxIterations: number | null
  loopMaxWallclockMs: number | null
  loopTokenBudget: number | null
}

export interface AutomationRun {
  id: string
  automationId: string
  triggerKey: string
  triggerKind: AutomationTriggerKind | 'manual'
  scheduledAt: number | null
  startedAt: number
  finishedAt: number | null
  attempt: number
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  result: string | null
  error: string | null
}

interface AutomationRunRow {
  id: string
  automation_id: string
  trigger_key: string
  trigger_kind: AutomationTriggerKind | 'manual'
  scheduled_at: number | null
  started_at: number
  finished_at: number | null
  attempt: number
  status: AutomationRun['status']
  result: string | null
  error: string | null
}

function cronForTrigger(trigger: AutomationTrigger, fallback = ''): string {
  return trigger.kind === 'schedule' && trigger.cron ? trigger.cron : fallback
}

function fromRow(row: AutomationRow): Automation {
  const trigger = parseStoredAutomationTrigger(row.trigger_config_json, row.cron)
  return {
    id: row.id,
    label: row.label,
    cron: row.cron,
    prompt: row.prompt,
    model: row.model,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    lastRunAt: row.last_run_at,
    lastResult: row.last_result,
    trigger,
    nextRunAt: row.next_run_at,
    lastTriggerKey: row.last_trigger_key,
    retryAttempt: row.retry_attempt,
    retryAt: row.retry_at,
    disabledReason: row.disabled_reason,
    goalId: row.goal_id ?? null,
    goalConversationId: row.goal_conversation_id ?? null,
    loopMaxIterations: row.loop_max_iterations ?? null,
    loopMaxWallclockMs: row.loop_max_wallclock_ms ?? null,
    loopTokenBudget: row.loop_token_budget ?? null
  }
}

function runFromRow(row: AutomationRunRow): AutomationRun {
  return {
    id: row.id,
    automationId: row.automation_id,
    triggerKey: row.trigger_key,
    triggerKind: row.trigger_kind,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    attempt: row.attempt,
    status: row.status,
    result: row.result,
    error: row.error
  }
}

export function listAutomations(): Automation[] {
  return (getDb().prepare('SELECT * FROM automations ORDER BY created_at DESC').all() as AutomationRow[])
    .map(fromRow)
}

export function getAutomation(id: string): Automation | null {
  const row = getDb().prepare('SELECT * FROM automations WHERE id = ?').get(id) as
    | AutomationRow
    | undefined
  return row ? fromRow(row) : null
}

export function createAutomation(input: {
  label: string
  cron?: string
  prompt: string
  model?: string | null
  trigger?: AutomationTrigger
  goalId?: string | null
  goalConversationId?: string | null
  loopMaxIterations?: number | null
  loopMaxWallclockMs?: number | null
  loopTokenBudget?: number | null
  now?: number
}): Automation {
  const db = getDb()
  const id = randomUUID()
  const now = input.now ?? Date.now()
  const trigger = input.trigger
    ? parseAutomationTrigger(input.trigger)
    : legacyCronTrigger(input.cron ?? '')
  const cron = cronForTrigger(trigger, input.cron ?? '')
  const nextRunAt = initialNextRunAt(trigger, now)
  db.prepare(
    `INSERT INTO automations (
       id, label, cron, prompt, model, enabled, created_at,
       trigger_kind, trigger_config_json, next_run_at,
       goal_id, goal_conversation_id, loop_max_iterations, loop_max_wallclock_ms, loop_token_budget
     ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.label,
    cron,
    input.prompt,
    input.model ?? null,
    now,
    trigger.kind,
    serializeAutomationTrigger(trigger),
    nextRunAt,
    input.goalId ?? null,
    input.goalConversationId ?? null,
    input.loopMaxIterations ?? null,
    input.loopMaxWallclockMs ?? null,
    input.loopTokenBudget ?? null
  )
  return getAutomation(id)!
}

export function updateAutomation(
  id: string,
  patch: Partial<{
    label: string
    cron: string
    prompt: string
    model: string | null
    enabled: boolean
    trigger: AutomationTrigger
    goalId: string | null
    goalConversationId: string | null
    loopMaxIterations: number | null
    loopMaxWallclockMs: number | null
    loopTokenBudget: number | null
    now: number
  }>
): Automation | null {
  const db = getDb()
  const current = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as
    | AutomationRow
    | undefined
  if (!current) return null

  const now = patch.now ?? Date.now()
  const currentTrigger = parseStoredAutomationTrigger(current.trigger_config_json, current.cron)
  const nextTrigger = patch.trigger
    ? parseAutomationTrigger(patch.trigger)
    : patch.cron !== undefined
      ? legacyCronTrigger(patch.cron)
      : currentTrigger
  const triggerChanged = patch.trigger !== undefined || patch.cron !== undefined
  const enabled = patch.enabled === undefined ? !!current.enabled : patch.enabled
  const nextRunAt = triggerChanged
    ? initialNextRunAt(nextTrigger, now)
    : current.next_run_at

  db.prepare(
    `UPDATE automations
        SET label = ?, cron = ?, prompt = ?, model = ?, enabled = ?,
            trigger_kind = ?, trigger_config_json = ?, next_run_at = ?,
            retry_attempt = ?, retry_at = ?, disabled_reason = ?,
            goal_id = ?, goal_conversation_id = ?, loop_max_iterations = ?,
            loop_max_wallclock_ms = ?, loop_token_budget = ?
      WHERE id = ?`
  ).run(
    patch.label ?? current.label,
    cronForTrigger(nextTrigger, patch.cron ?? current.cron),
    patch.prompt ?? current.prompt,
    patch.model !== undefined ? patch.model : current.model,
    enabled ? 1 : 0,
    nextTrigger.kind,
    serializeAutomationTrigger(nextTrigger),
    nextRunAt,
    triggerChanged ? 0 : current.retry_attempt,
    triggerChanged ? null : current.retry_at,
    enabled ? null : current.disabled_reason ?? 'disabled',
    patch.goalId !== undefined ? patch.goalId : current.goal_id,
    patch.goalConversationId !== undefined ? patch.goalConversationId : current.goal_conversation_id,
    patch.loopMaxIterations !== undefined ? patch.loopMaxIterations : current.loop_max_iterations,
    patch.loopMaxWallclockMs !== undefined ? patch.loopMaxWallclockMs : current.loop_max_wallclock_ms,
    patch.loopTokenBudget !== undefined ? patch.loopTokenBudget : current.loop_token_budget,
    id
  )
  return getAutomation(id)
}

export function recordRun(id: string, result: string): void {
  getDb().prepare('UPDATE automations SET last_run_at = ?, last_result = ? WHERE id = ?')
    .run(Date.now(), result, id)
}

export function deleteAutomation(id: string): void {
  getDb().prepare('DELETE FROM automations WHERE id = ?').run(id)
}

export function beginAutomationRun(input: {
  automationId: string
  triggerKey: string
  triggerKind: AutomationTriggerKind | 'manual'
  scheduledAt: number | null
  attempt: number
  startedAt: number
}): string | null {
  const id = randomUUID()
  const result = getDb().prepare(
    `INSERT OR IGNORE INTO automation_runs (
       id, automation_id, trigger_key, trigger_kind, scheduled_at, started_at, attempt, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running')`
  ).run(
    id,
    input.automationId,
    input.triggerKey,
    input.triggerKind,
    input.scheduledAt,
    input.startedAt,
    input.attempt
  )
  return result.changes === 1 ? id : null
}

export function settleAutomationRun(input: {
  runId: string
  automationId: string
  triggerKey: string
  status: 'completed' | 'failed'
  finishedAt: number
  result?: string | null
  error?: string | null
  nextRunAt: number | null
  retryAttempt: number
  retryAt: number | null
  enabled: boolean
  disabledReason?: string | null
}): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare(
      `UPDATE automation_runs
          SET status = ?, finished_at = ?, result = ?, error = ?
        WHERE id = ? AND status = 'running'`
    ).run(input.status, input.finishedAt, input.result ?? null, input.error ?? null, input.runId)
    db.prepare(
      `UPDATE automations
          SET last_run_at = ?, last_result = ?, last_trigger_key = ?, next_run_at = ?,
              retry_attempt = ?, retry_at = ?, enabled = ?, disabled_reason = ?
        WHERE id = ?`
    ).run(
      input.finishedAt,
      input.status === 'completed' ? input.result ?? '' : `[error] ${input.error ?? 'unknown'}`,
      input.triggerKey,
      input.nextRunAt,
      input.retryAttempt,
      input.retryAt,
      input.enabled ? 1 : 0,
      input.disabledReason ?? null,
      input.automationId
    )
  })()
}

export function listAutomationRuns(automationId: string, limit = 20): AutomationRun[] {
  const bounded = Math.max(1, Math.min(100, Math.floor(limit)))
  return (getDb().prepare(
    `SELECT * FROM automation_runs
      WHERE automation_id = ?
      ORDER BY started_at DESC, attempt DESC
      LIMIT ?`
  ).all(automationId, bounded) as AutomationRunRow[]).map(runFromRow)
}

export function recoverInterruptedAutomationRuns(now = Date.now()): number {
  const db = getDb()
  return db.transaction(() => {
    const rows = db.prepare(
      "SELECT id, automation_id, attempt FROM automation_runs WHERE status = 'running'"
    ).all() as Array<{ id: string; automation_id: string; attempt: number }>
    const settle = db.prepare(
      "UPDATE automation_runs SET status = 'interrupted', finished_at = ?, error = 'app restarted during run' WHERE id = ?"
    )
    const retry = db.prepare(
      'UPDATE automations SET retry_attempt = ?, retry_at = ? WHERE id = ? AND enabled = 1'
    )
    for (const row of rows) {
      settle.run(now, row.id)
      retry.run(row.attempt, now, row.automation_id)
    }
    return rows.length
  })()
}

export function initializeAutomationNextRuns(now = Date.now()): number {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM automations WHERE enabled = 1 AND next_run_at IS NULL AND retry_at IS NULL'
  ).all() as AutomationRow[]
  const update = db.prepare('UPDATE automations SET next_run_at = ? WHERE id = ?')
  let changed = 0
  for (const row of rows) {
    const next = initialNextRunAt(parseStoredAutomationTrigger(row.trigger_config_json, row.cron), now)
    if (next !== null) {
      update.run(next, row.id)
      changed++
    }
  }
  return changed
}
