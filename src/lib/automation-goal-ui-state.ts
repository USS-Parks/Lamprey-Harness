import type { Goal } from './types'

export interface AutomationStateInput {
  enabled: boolean
  trigger: { kind: 'one_shot' | 'schedule' | 'event' | 'monitor'; eventName?: string }
  nextRunAt: number | null
  retryAt: number | null
  retryAttempt: number
  disabledReason: string | null
  goalId: string | null
}

function compactDuration(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.ceil(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.ceil(hours / 24)}d`
}

export function triggerKindLabel(kind: AutomationStateInput['trigger']['kind']): string {
  return { one_shot: 'Reminder', schedule: 'Schedule', event: 'Event', monitor: 'Monitor' }[kind]
}

export function automationDisplayState(
  automation: AutomationStateInput,
  now = Date.now()
): { label: string; detail: string; tone: 'muted' | 'active' | 'warning' | 'done' } {
  if (!automation.enabled) {
    const completed = automation.disabledReason === 'one-shot-completed'
    return {
      label: completed ? 'Completed' : 'Disabled',
      detail: completed
        ? 'Reminder completed'
        : (automation.disabledReason ?? 'No runs will start'),
      tone: completed ? 'done' : 'muted'
    }
  }
  if (automation.retryAt !== null) {
    return {
      label: `Retry ${automation.retryAttempt + 1}`,
      detail: `in ${compactDuration(automation.retryAt - now)}`,
      tone: 'warning'
    }
  }
  if (automation.nextRunAt !== null) {
    return {
      label: 'Next run',
      detail:
        automation.nextRunAt <= now
          ? 'due now'
          : `in ${compactDuration(automation.nextRunAt - now)}`,
      tone: 'active'
    }
  }
  if (automation.trigger.kind === 'event') {
    return {
      label: 'Waiting',
      detail: `event ${automation.trigger.eventName ?? '(unnamed)'}`,
      tone: 'active'
    }
  }
  return { label: 'No next run', detail: 'Scheduler has no eligible occurrence', tone: 'warning' }
}

function percentage(used: number, budget: number | null): number | null {
  if (budget === null || budget <= 0) return null
  return Math.min(100, Math.round((used / budget) * 100))
}

export function goalDisplayState(
  goal: Goal,
  now = Date.now()
): {
  elapsedMs: number
  tokenPercent: number | null
  timePercent: number | null
  statusDetail: string | null
} {
  const elapsedMs =
    goal.elapsedMs +
    (goal.lifecycleStatus === 'active' && goal.activeSince !== null
      ? Math.max(0, now - goal.activeSince)
      : 0)
  return {
    elapsedMs,
    tokenPercent: percentage(goal.tokenUsed, goal.tokenBudget),
    timePercent: percentage(elapsedMs, goal.timeBudgetMs),
    statusDetail:
      goal.lifecycleStatus === 'blocked'
        ? (goal.blocker ?? 'Blocked without a recorded reason')
        : goal.lifecycleStatus === 'completed'
          ? (goal.completion ?? 'Completed without recorded evidence')
          : goal.lifecycleStatus === 'aborted'
            ? (goal.transitionReason ?? 'Aborted by user or system')
            : null
  }
}
