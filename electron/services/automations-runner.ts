import { randomUUID } from 'crypto'
import {
  beginAutomationRun,
  getAutomation,
  initializeAutomationNextRuns,
  listAutomations,
  recoverInterruptedAutomationRuns,
  settleAutomationRun,
  type Automation
} from './automations-store'
import { chatOnce } from './providers/registry'
import { boundedJsonPreview, recordEvent } from './event-log'
import { readLoopConfig } from './loop-config'
import { wakeGoalFromAutomation } from './goal-automation-loop-bridge'
import {
  describeCron,
  nextFireAfter,
  nextRunAfterSettlement,
  parseCron,
  retryAt,
  triggerKey,
  type AutomationTriggerKind
} from './automation-trigger'

export { describeCron, nextFireAfter, parseCron } from './automation-trigger'

interface AutomationInvocation {
  triggerKind: AutomationTriggerKind | 'manual'
  triggerKey: string
  scheduledAt: number | null
  attempt: number
  startedAt?: number
}

export interface AutomationRunOutcome {
  started: boolean
  status: 'completed' | 'failed' | 'deduplicated' | 'already-running' | 'not-found'
  automationId: string
  triggerKey: string
  attempt: number
}

const runningAutomations = new Set<string>()
let timer: NodeJS.Timeout | null = null
const TICK_INTERVAL_MS = 5_000

function emitAutomationEvent(
  type: 'automation.started' | 'automation.completed' | 'automation.failed',
  detail: {
    automation: Automation
    triggerKey: string
    triggerKind: AutomationTriggerKind | 'manual'
    attempt: number
    model: string
    correlationId: string
    startedAt: number
    durationMs?: number
    replyPreview?: string
    error?: string
    errorClass?: string
  }
): void {
  try {
    recordEvent({
      type,
      actorKind: 'system',
      severity: type === 'automation.failed' ? 'error' : 'info',
      automationId: detail.automation.id,
      correlationId: detail.correlationId,
      entityKind: 'automation',
      entityId: detail.automation.id,
      payload: {
        automationId: detail.automation.id,
        label: detail.automation.label,
        triggerKind: detail.triggerKind,
        triggerKey: detail.triggerKey,
        attempt: detail.attempt,
        model: detail.model,
        startedAt: detail.startedAt,
        durationMs: detail.durationMs,
        replyPreview: boundedJsonPreview(detail.replyPreview),
        errorPreview: boundedJsonPreview(detail.error),
        errorClass: detail.errorClass
      }
    })
  } catch (error) {
    console.error(`[automations] ${type} event failed:`, error)
  }
}

async function runOne(
  automationId: string,
  invocation: AutomationInvocation
): Promise<AutomationRunOutcome> {
  if (runningAutomations.has(automationId)) {
    return {
      started: false,
      status: 'already-running',
      automationId,
      triggerKey: invocation.triggerKey,
      attempt: invocation.attempt
    }
  }
  const automation = getAutomation(automationId)
  if (!automation) throw new Error(`automation runner: no automation with id "${automationId}".`)

  const startedAt = invocation.startedAt ?? Date.now()
  const runId = beginAutomationRun({
    automationId,
    triggerKey: invocation.triggerKey,
    triggerKind: invocation.triggerKind,
    scheduledAt: invocation.scheduledAt,
    attempt: invocation.attempt,
    startedAt
  })
  if (!runId) {
    return {
      started: false,
      status: 'deduplicated',
      automationId,
      triggerKey: invocation.triggerKey,
      attempt: invocation.attempt
    }
  }

  runningAutomations.add(automationId)
  const model = automation.model || 'deepseek-v4-flash'
  const correlationId = randomUUID()
  emitAutomationEvent('automation.started', {
    automation,
    triggerKey: invocation.triggerKey,
    triggerKind: invocation.triggerKind,
    attempt: invocation.attempt,
    model,
    correlationId,
    startedAt
  })

  try {
    const replyResult = automation.goalId
      ? { content: JSON.stringify(wakeGoalFromAutomation(automation)) }
      : await chatOnce(
          [{ role: 'user', content: automation.prompt }] as any,
          model,
          undefined,
          { correlationId, purpose: 'other', role: 'automation' }
        )
    const finishedAt = Date.now()
    const reply = replyResult.content
    const isManual = invocation.triggerKind === 'manual'
    const oneShotComplete = !isManual && automation.trigger.kind === 'one_shot'
    settleAutomationRun({
      runId,
      automationId,
      triggerKey: invocation.triggerKey,
      status: 'completed',
      finishedAt,
      result: reply.slice(0, 4000),
      nextRunAt: isManual
        ? automation.nextRunAt
        : nextRunAfterSettlement(automation.trigger, finishedAt),
      retryAttempt: isManual ? automation.retryAttempt : 0,
      retryAt: isManual ? automation.retryAt : null,
      enabled: oneShotComplete ? false : automation.enabled,
      disabledReason: oneShotComplete ? 'one-shot-completed' : automation.disabledReason
    })
    emitAutomationEvent('automation.completed', {
      automation,
      triggerKey: invocation.triggerKey,
      triggerKind: invocation.triggerKind,
      attempt: invocation.attempt,
      model,
      correlationId,
      startedAt,
      durationMs: finishedAt - startedAt,
      replyPreview: reply
    })
    return {
      started: true,
      status: 'completed',
      automationId,
      triggerKey: invocation.triggerKey,
      attempt: invocation.attempt
    }
  } catch (error) {
    const finishedAt = Date.now()
    const message = error instanceof Error ? error.message : 'unknown'
    const isManual = invocation.triggerKind === 'manual'
    const nextRetryAt = isManual ? null : retryAt(automation.trigger, invocation.attempt, finishedAt)
    const exhaustedOneShot =
      !isManual && automation.trigger.kind === 'one_shot' && nextRetryAt === null
    settleAutomationRun({
      runId,
      automationId,
      triggerKey: invocation.triggerKey,
      status: 'failed',
      finishedAt,
      error: message,
      nextRunAt: isManual
        ? automation.nextRunAt
        : nextRetryAt === null
          ? nextRunAfterSettlement(automation.trigger, finishedAt)
          : automation.nextRunAt,
      retryAttempt: isManual ? automation.retryAttempt : invocation.attempt,
      retryAt: isManual ? automation.retryAt : nextRetryAt,
      enabled: exhaustedOneShot ? false : automation.enabled,
      disabledReason: exhaustedOneShot ? 'one-shot-failed' : automation.disabledReason
    })
    emitAutomationEvent('automation.failed', {
      automation,
      triggerKey: invocation.triggerKey,
      triggerKind: invocation.triggerKind,
      attempt: invocation.attempt,
      model,
      correlationId,
      startedAt,
      durationMs: finishedAt - startedAt,
      error: message,
      errorClass: error instanceof Error ? error.name : undefined
    })
    return {
      started: true,
      status: 'failed',
      automationId,
      triggerKey: invocation.triggerKey,
      attempt: invocation.attempt
    }
  } finally {
    runningAutomations.delete(automationId)
  }
}

export async function runAutomation(id: string): Promise<AutomationRunOutcome> {
  if (!getAutomation(id)) {
    return {
      started: false,
      status: 'not-found',
      automationId: id,
      triggerKey: '',
      attempt: 0
    }
  }
  return runOne(id, {
    triggerKind: 'manual',
    triggerKey: `manual:${randomUUID()}`,
    scheduledAt: null,
    attempt: 1
  })
}

export async function tickAutomationsOnce(now = Date.now()): Promise<number> {
  if (!readLoopConfig().enabled) return 0
  let started = 0
  for (const automation of listAutomations()) {
    if (!automation.enabled) continue

    if (automation.retryAt !== null) {
      if (automation.retryAt > now || !automation.lastTriggerKey) continue
      const attempt = automation.retryAttempt + 1
      if (attempt > automation.trigger.maxAttempts) continue
      const outcome = await runOne(automation.id, {
        triggerKind: automation.trigger.kind,
        triggerKey: automation.lastTriggerKey,
        scheduledAt: automation.nextRunAt,
        attempt,
        startedAt: now
      })
      if (outcome.started) started++
      continue
    }

    if (automation.nextRunAt === null || automation.nextRunAt > now) continue
    const outcome = await runOne(automation.id, {
      triggerKind: automation.trigger.kind,
      triggerKey: triggerKey(automation.trigger, automation.nextRunAt),
      scheduledAt: automation.nextRunAt,
      attempt: 1,
      startedAt: now
    })
    if (outcome.started) started++
  }
  return started
}

export async function dispatchAutomationEvent(
  eventName: string,
  eventId: string
): Promise<{ matched: number; started: number }> {
  if (!readLoopConfig().enabled) return { matched: 0, started: 0 }
  if (!eventName.trim() || !eventId.trim()) {
    throw new Error('automation event requires non-empty eventName and eventId.')
  }
  const matches = listAutomations().filter(
    (automation) =>
      automation.enabled &&
      automation.trigger.kind === 'event' &&
      automation.trigger.eventName === eventName
  )
  let started = 0
  for (const automation of matches) {
    const outcome = await runOne(automation.id, {
      triggerKind: 'event',
      triggerKey: triggerKey(automation.trigger, 0, eventId),
      scheduledAt: null,
      attempt: 1
    })
    if (outcome.started) started++
  }
  return { matched: matches.length, started }
}

export function startAutomations(): void {
  if (timer) return
  recoverInterruptedAutomationRuns()
  initializeAutomationNextRuns()
  timer = setInterval(() => {
    void tickAutomationsOnce().catch((error) => {
      console.error('[automations] tick failed:', error)
    })
  }, TICK_INTERVAL_MS)
  timer.unref?.()
}

export function stopAutomations(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
