export type AutomationTriggerKind = 'one_shot' | 'schedule' | 'event' | 'monitor'

interface RetryPolicy {
  maxAttempts: number
  retryDelaySeconds: number
}

export type AutomationTrigger =
  | ({ kind: 'one_shot'; at: number } & RetryPolicy)
  | ({ kind: 'schedule'; cron?: string; everySeconds?: number; startAt?: number } & RetryPolicy)
  | ({ kind: 'event'; eventName: string } & RetryPolicy)
  | ({ kind: 'monitor'; everySeconds: number; startAt?: number } & RetryPolicy)

type FieldSet = Set<number>

interface CronExpr {
  minutes: FieldSet
  hours: FieldSet
  dayOfMonth: FieldSet
  month: FieldSet
  dayOfWeek: FieldSet
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_SECONDS = 60
const MIN_INTERVAL_SECONDS = 30

function finiteInteger(value: unknown, field: string, min: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < min) {
    throw new Error(`automation trigger: "${field}" must be an integer >= ${min}.`)
  }
  return value
}

function optionalTimestamp(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  return finiteInteger(value, field, 0)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`automation trigger: "${field}" is required.`)
  }
  return value.trim()
}

function retryPolicy(input: Record<string, unknown>): RetryPolicy {
  return {
    maxAttempts:
      input.maxAttempts === undefined
        ? DEFAULT_MAX_ATTEMPTS
        : finiteInteger(input.maxAttempts, 'maxAttempts', 1),
    retryDelaySeconds:
      input.retryDelaySeconds === undefined
        ? DEFAULT_RETRY_DELAY_SECONDS
        : finiteInteger(input.retryDelaySeconds, 'retryDelaySeconds', 1)
  }
}

export function parseAutomationTrigger(input: unknown): AutomationTrigger {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('automation trigger must be an object.')
  }
  const value = input as Record<string, unknown>
  const kind = requiredText(value.kind, 'kind') as AutomationTriggerKind
  const retry = retryPolicy(value)

  if (kind === 'one_shot') {
    return { kind, at: finiteInteger(value.at, 'at', 0), ...retry }
  }
  if (kind === 'schedule') {
    const cron = typeof value.cron === 'string' && value.cron.trim() !== '' ? value.cron.trim() : undefined
    const everySeconds = value.everySeconds === undefined
      ? undefined
      : finiteInteger(value.everySeconds, 'everySeconds', MIN_INTERVAL_SECONDS)
    if ((cron ? 1 : 0) + (everySeconds ? 1 : 0) !== 1) {
      throw new Error('automation trigger: schedule requires exactly one of "cron" or "everySeconds".')
    }
    if (cron) parseCron(cron)
    return {
      kind,
      ...(cron ? { cron } : {}),
      ...(everySeconds ? { everySeconds } : {}),
      ...(optionalTimestamp(value.startAt, 'startAt') !== undefined
        ? { startAt: optionalTimestamp(value.startAt, 'startAt') }
        : {}),
      ...retry
    }
  }
  if (kind === 'event') {
    return { kind, eventName: requiredText(value.eventName, 'eventName'), ...retry }
  }
  if (kind === 'monitor') {
    return {
      kind,
      everySeconds: finiteInteger(value.everySeconds, 'everySeconds', MIN_INTERVAL_SECONDS),
      ...(optionalTimestamp(value.startAt, 'startAt') !== undefined
        ? { startAt: optionalTimestamp(value.startAt, 'startAt') }
        : {}),
      ...retry
    }
  }
  throw new Error(`automation trigger: unsupported kind "${kind}".`)
}

export function legacyCronTrigger(cron: string): AutomationTrigger {
  return parseAutomationTrigger({ kind: 'schedule', cron })
}

export function parseStoredAutomationTrigger(
  json: string | null | undefined,
  legacyCron: string
): AutomationTrigger {
  if (json) {
    try {
      return parseAutomationTrigger(JSON.parse(json))
    } catch {
      // Fall through to the shipped cron column. A malformed additive field
      // must not make a previously valid automation unreadable.
    }
  }
  return legacyCronTrigger(legacyCron)
}

export function serializeAutomationTrigger(trigger: AutomationTrigger): string {
  return JSON.stringify(trigger)
}

function parseField(raw: string, min: number, max: number): FieldSet {
  const set = new Set<number>()
  for (const piece of raw.split(',')) {
    if (piece === '*') {
      for (let i = min; i <= max; i++) set.add(i)
      continue
    }
    const stepMatch = piece.match(/^(\*|\d+(-\d+)?)\/(\d+)$/)
    if (stepMatch) {
      const range = stepMatch[1]
      const step = parseInt(stepMatch[3], 10)
      if (step <= 0) throw new Error(`bad step ${step}`)
      let lo = min
      let hi = max
      if (range !== '*') {
        const match = range.match(/^(\d+)(?:-(\d+))?$/)!
        lo = parseInt(match[1], 10)
        hi = match[2] ? parseInt(match[2], 10) : max
      }
      for (let i = lo; i <= hi; i += step) set.add(i)
      continue
    }
    const rangeMatch = piece.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const lo = parseInt(rangeMatch[1], 10)
      const hi = parseInt(rangeMatch[2], 10)
      if (lo < min || hi > max || lo > hi) throw new Error(`bad field value: ${piece}`)
      for (let i = lo; i <= hi; i++) set.add(i)
      continue
    }
    const n = parseInt(piece, 10)
    if (!Number.isFinite(n) || String(n) !== piece || n < min || n > max) {
      throw new Error(`bad field value: ${piece}`)
    }
    set.add(n)
  }
  return set
}

export function parseCron(expr: string): CronExpr {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(`Cron needs 5 fields (min hour dom month dow), got ${parts.length}: "${expr}"`)
  }
  return {
    minutes: parseField(parts[0], 0, 59),
    hours: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6)
  }
}

function matches(expr: CronExpr, date: Date): boolean {
  return (
    expr.minutes.has(date.getMinutes()) &&
    expr.hours.has(date.getHours()) &&
    expr.dayOfMonth.has(date.getDate()) &&
    expr.month.has(date.getMonth() + 1) &&
    expr.dayOfWeek.has(date.getDay())
  )
}

const COMMON_PRESETS: Record<string, string> = {
  '* * * * *': 'Every minute',
  '*/5 * * * *': 'Every 5 minutes',
  '*/10 * * * *': 'Every 10 minutes',
  '*/15 * * * *': 'Every 15 minutes',
  '*/30 * * * *': 'Every 30 minutes',
  '0 * * * *': 'Every hour, on the hour',
  '0 */2 * * *': 'Every 2 hours',
  '0 9 * * *': 'Daily at 09:00',
  '0 9 * * 1-5': 'Weekdays at 09:00',
  '0 0 * * *': 'Daily at midnight',
  '0 0 * * 0': 'Weekly at midnight Sunday',
  '0 0 1 * *': 'Monthly on the 1st'
}

function describeFieldSet(set: FieldSet, min: number, max: number, label: string): string {
  if (set.size === max - min + 1) return `every ${label}`
  const sorted = [...set].sort((a, b) => a - b)
  if (sorted.length === 1) return `at ${label} ${sorted[0]}`
  if (sorted.length >= 3) {
    const step = sorted[1] - sorted[0]
    if (step > 1 && sorted.slice(2).every((value, index) => value - sorted[index + 1] === step)) {
      return `every ${step} ${label}${label.endsWith('s') ? '' : 's'}`
    }
  }
  return `${label}s ${sorted.join(',')}`
}

export function describeCron(expr: string): string | null {
  const trimmed = expr.trim().replace(/\s+/g, ' ')
  if (COMMON_PRESETS[trimmed]) return COMMON_PRESETS[trimmed]
  let parsed: CronExpr
  try {
    parsed = parseCron(trimmed)
  } catch {
    return null
  }
  return `${describeFieldSet(parsed.minutes, 0, 59, 'minute')}, ${describeFieldSet(parsed.hours, 0, 23, 'hour')}`
}

export function nextFireAfter(expr: string, from: Date = new Date()): Date | null {
  let parsed: CronExpr
  try {
    parsed = parseCron(expr)
  } catch {
    return null
  }
  const candidate = new Date(from)
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)
  const horizonMinutes = 366 * 24 * 60
  for (let i = 0; i < horizonMinutes; i++) {
    if (matches(parsed, candidate)) return new Date(candidate)
    candidate.setMinutes(candidate.getMinutes() + 1)
  }
  return null
}

function nextIntervalBoundary(trigger: { everySeconds: number; startAt?: number }, now: number): number {
  const intervalMs = trigger.everySeconds * 1000
  const anchor = trigger.startAt ?? now
  if (anchor > now) return anchor
  return anchor + (Math.floor((now - anchor) / intervalMs) + 1) * intervalMs
}

export function initialNextRunAt(trigger: AutomationTrigger, now: number): number | null {
  if (trigger.kind === 'event') return null
  if (trigger.kind === 'one_shot') return Math.max(trigger.at, now)
  if (trigger.kind === 'schedule' && trigger.cron) {
    return nextFireAfter(trigger.cron, new Date(now))?.getTime() ?? null
  }
  return trigger.kind === 'schedule'
    ? nextIntervalBoundary({ everySeconds: trigger.everySeconds!, startAt: trigger.startAt }, now)
    : nextIntervalBoundary(trigger, now)
}

export function nextRunAfterSettlement(trigger: AutomationTrigger, now: number): number | null {
  if (trigger.kind === 'one_shot' || trigger.kind === 'event') return null
  if (trigger.kind === 'schedule' && trigger.cron) {
    return nextFireAfter(trigger.cron, new Date(now))?.getTime() ?? null
  }
  return trigger.kind === 'schedule'
    ? nextIntervalBoundary({ everySeconds: trigger.everySeconds!, startAt: trigger.startAt }, now)
    : nextIntervalBoundary(trigger, now)
}

export function triggerKey(trigger: AutomationTrigger, scheduledAt: number, eventId?: string): string {
  if (trigger.kind === 'event') {
    if (!eventId) throw new Error('event trigger requires a stable event id.')
    return `event:${trigger.eventName}:${eventId}`
  }
  return `${trigger.kind}:${scheduledAt}`
}

export function retryAt(trigger: AutomationTrigger, attempt: number, failedAt: number): number | null {
  if (attempt >= trigger.maxAttempts) return null
  const multiplier = 2 ** Math.max(0, attempt - 1)
  return failedAt + trigger.retryDelaySeconds * 1000 * multiplier
}
