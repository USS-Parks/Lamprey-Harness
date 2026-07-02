import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from './database'
import { saveMessage, getConversation } from './conversation-store'
import { boundedJsonPreview, recordEvent } from './event-log'
import { readLoopConfig } from './loop-config'

// JM-5 (LP-4) — cap on pending wake-ups per conversation. schedule_wakeup is
// model-callable with no approval; without a cap a single turn could stack an
// unbounded queue of future self-invocations.
export const MAX_PENDING_WAKEUPS_PER_CONVERSATION = 10

export type LoopWakeupStatus = 'pending' | 'fired' | 'cancelled' | 'error'

export interface LoopWakeup {
  id: string
  conversationId: string
  fireAt: number
  prompt: string
  reason: string | null
  status: LoopWakeupStatus
  createdAt: number
  firedAt: number | null
  error: string | null
}

export interface ScheduleWakeupInput {
  conversationId: string
  delaySeconds: number
  prompt: string
  reason?: string | null
}

const WAKEUP_PREFIX = '[scheduled wake-up]'
let timer: NodeJS.Timeout | null = null

// LP-1 (Loop Phase) — injected headless turn runner. `chat.ts` wires this at
// handler-registration time via setLoopTurnRunner. Injection (rather than a
// direct import) avoids a service→ipc cycle: loop-runner is a service, while
// runHeadlessTurn lives in ipc/chat.ts. When unset (unit tests, or before
// wiring) a fired wake-up still persists its user message — it just won't
// auto-run a turn, which is the pre-LP-1 behaviour.
export type LoopTurnRunner = (input: {
  conversationId: string
  model: string
  promptBody?: string
  /** JM-4 (LP-3) — abort signal from the caller's watchdog/stop control.
   *  runHeadlessTurn accepts it; dropping it here was what disconnected the
   *  per-iteration stall watchdog in production. */
  signal?: AbortSignal
}) => Promise<unknown>

let turnRunner: LoopTurnRunner | null = null

export function setLoopTurnRunner(fn: LoopTurnRunner | null): void {
  turnRunner = fn
}

export function getLoopTurnRunner(): LoopTurnRunner | null {
  return turnRunner
}

// JM-3 (LP-8) — wake-up turns run through a single sequential drainer instead
// of fire-and-forget-per-wakeup. After a Windows sleep every missed wake-up is
// due at once (SELECT … LIMIT 50); firing them in parallel meant up to 50
// concurrent LLM calls, several possibly into the same conversation.
const pendingWakeupTurns: Array<() => Promise<void>> = []
let drainingWakeupTurns = false
let wakeupDrainPromise: Promise<void> | null = null

/** JM-7 (LP-24) — the in-flight wake-up drain, for the quit path. */
export function getInFlightWakeupWork(): Promise<void> | null {
  return drainingWakeupTurns ? wakeupDrainPromise : null
}

function enqueueWakeupTurn(fn: () => Promise<void>): void {
  pendingWakeupTurns.push(fn)
  if (drainingWakeupTurns) return
  drainingWakeupTurns = true
  wakeupDrainPromise = (async () => {
    while (pendingWakeupTurns.length > 0) {
      const next = pendingWakeupTurns.shift()!
      try {
        await next()
      } catch (err) {
        console.error('[loops] wake-up turn failed:', err)
      }
    }
    drainingWakeupTurns = false
  })()
}

function rowToWakeup(row: any): LoopWakeup {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    fireAt: row.fire_at,
    prompt: row.prompt,
    reason: row.reason ?? null,
    status: row.status,
    createdAt: row.created_at,
    firedAt: row.fired_at ?? null,
    error: row.error ?? null
  }
}

function emit(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function formatWakeupMessage(wakeup: LoopWakeup): string {
  const reason = wakeup.reason?.trim()
  return `${WAKEUP_PREFIX}${reason ? ` ${reason}` : ''}\n\n${wakeup.prompt}`
}

export function isWakeupMessage(content: string): boolean {
  return content.startsWith(WAKEUP_PREFIX)
}

export function scheduleWakeup(input: ScheduleWakeupInput): LoopWakeup {
  // JM-5 (LP-4) — the master toggle gates wake-up creation. Before this,
  // schedule_wakeup (model-callable, no approval, in the default tool surface)
  // ran with loopsEnabled:false and each fired wake-up ran a real turn — a
  // self-perpetuating loop with no ceiling on a default install.
  if (!readLoopConfig().enabled) {
    throw new Error('Loops are disabled. Enable them in Settings → Loops to schedule wake-ups.')
  }
  if (!input.conversationId || typeof input.conversationId !== 'string') {
    throw new Error('conversationId required')
  }
  if (!getConversation(input.conversationId)) {
    throw new Error('conversation not found')
  }
  const pending = getDb()
    .prepare("SELECT COUNT(*) AS n FROM loop_wakeups WHERE conversation_id = ? AND status = 'pending'")
    .get(input.conversationId) as { n: number }
  if (pending.n >= MAX_PENDING_WAKEUPS_PER_CONVERSATION) {
    throw new Error(
      `This conversation already has ${pending.n} pending wake-ups (max ${MAX_PENDING_WAKEUPS_PER_CONVERSATION}). Cancel one first.`
    )
  }
  if (!Number.isFinite(input.delaySeconds) || input.delaySeconds < 0) {
    throw new Error('delaySeconds must be a non-negative number')
  }
  if (!input.prompt || typeof input.prompt !== 'string') {
    throw new Error('prompt required')
  }
  const now = Date.now()
  const row = {
    id: randomUUID(),
    conversation_id: input.conversationId,
    fire_at: now + Math.round(input.delaySeconds * 1000),
    prompt: input.prompt,
    reason: input.reason?.trim() || null,
    status: 'pending',
    created_at: now,
    fired_at: null,
    error: null
  }
  getDb()
    .prepare(
      `INSERT INTO loop_wakeups
       (id, conversation_id, fire_at, prompt, reason, status, created_at, fired_at, error)
       VALUES (@id, @conversation_id, @fire_at, @prompt, @reason, @status, @created_at, @fired_at, @error)`
    )
    .run(row)
  const wakeup = rowToWakeup(row)
  emit('loop:wakeup:scheduled', wakeup)
  recordLoopEvent('loop.wakeup.scheduled', wakeup)
  return wakeup
}

export function cancelWakeup(id: string): boolean {
  const now = Date.now()
  const result = getDb()
    .prepare(
      "UPDATE loop_wakeups SET status = 'cancelled', fired_at = ? WHERE id = ? AND status = 'pending'"
    )
    .run(now, id)
  const changed = result.changes > 0
  if (changed) emit('loop:wakeup:cancelled', { id, cancelledAt: now })
  return changed
}

export function listWakeups(filter?: {
  conversationId?: string
  status?: LoopWakeupStatus | LoopWakeupStatus[]
  limit?: number
}): LoopWakeup[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter?.conversationId) {
    where.push('conversation_id = ?')
    params.push(filter.conversationId)
  }
  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
    where.push(`status IN (${statuses.map(() => '?').join(',')})`)
    params.push(...statuses)
  }
  const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500)
  const sql =
    'SELECT * FROM loop_wakeups' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY fire_at ASC LIMIT ?'
  return getDb()
    .prepare(sql)
    .all(...params, limit)
    .map(rowToWakeup)
}

export function fireDueWakeups(now = Date.now()): LoopWakeup[] {
  // JM-5 (LP-4) — nothing fires while the master toggle is off. Pending
  // wake-ups stay pending and fire when (if) the user re-enables loops.
  if (!readLoopConfig().enabled) return []
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT * FROM loop_wakeups WHERE status = 'pending' AND fire_at <= ? ORDER BY fire_at ASC LIMIT 50"
    )
    .all(now) as any[]
  const fired: LoopWakeup[] = []
  for (const raw of rows) {
    const wakeup = rowToWakeup(raw)
    try {
      const msg = saveMessage({
        id: randomUUID(),
        conversationId: wakeup.conversationId,
        role: 'user',
        content: formatWakeupMessage(wakeup)
      })
      db.prepare(
        "UPDATE loop_wakeups SET status = 'fired', fired_at = ?, error = NULL WHERE id = ?"
      ).run(now, wakeup.id)
      const done = { ...wakeup, status: 'fired' as const, firedAt: now }
      fired.push(done)
      emit('loop:wakeup:fired', { wakeup: done, message: msg })
      recordLoopEvent('loop.wakeup.fired', done)
      // LP-1 — actually RUN the turn. Before this, a fired wake-up only
      // injected the user message and the renderer reloaded it; nothing
      // answered (G1). Now the injected prompt drives a real headless turn.
      // Fire-and-forget: a long turn must not block the 30s wake-up tick.
      if (turnRunner) {
        const conv = getConversation(wakeup.conversationId)
        const model = conv?.model ?? 'deepseek-v4-pro'
        const runner = turnRunner
        enqueueWakeupTurn(async () => {
          await runner({
            conversationId: wakeup.conversationId,
            model,
            promptBody: wakeup.prompt
          })
        })
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      db.prepare(
        "UPDATE loop_wakeups SET status = 'error', fired_at = ?, error = ? WHERE id = ?"
      ).run(now, error, wakeup.id)
      emit('loop:wakeup:error', { id: wakeup.id, error })
    }
  }
  return fired
}

export function startLoopWakeups(): void {
  if (timer) return
  const tick = (): void => {
    try {
      fireDueWakeups()
    } catch (err) {
      console.error('[loops] wake-up tick failed:', err)
    }
  }
  tick()
  timer = setInterval(tick, 30_000)
}

export function stopLoopWakeups(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

function recordLoopEvent(type: 'loop.wakeup.scheduled' | 'loop.wakeup.fired', wakeup: LoopWakeup): void {
  try {
    recordEvent({
      type,
      actorKind: type === 'loop.wakeup.scheduled' ? 'model' : 'system',
      severity: 'info',
      conversationId: wakeup.conversationId,
      entityKind: 'loop_wakeup',
      entityId: wakeup.id,
      payload: {
        id: wakeup.id,
        fireAt: wakeup.fireAt,
        reason: wakeup.reason,
        status: wakeup.status,
        promptPreview: boundedJsonPreview(wakeup.prompt)
      }
    })
  } catch (err) {
    console.error('[loops] event write failed:', err)
  }
}
