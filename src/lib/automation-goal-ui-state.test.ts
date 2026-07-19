import { describe, expect, it, vi } from 'vitest'
import {
  automationDisplayState,
  goalDisplayState,
  triggerKindLabel
} from './automation-goal-ui-state'
import type { Goal } from './types'

const baseAutomation = {
  enabled: true,
  trigger: { kind: 'schedule' as const },
  nextRunAt: 160_000,
  retryAt: null,
  retryAttempt: 0,
  disabledReason: null,
  goalId: null
}

const baseGoal: Goal = {
  id: 'g1',
  title: 'Ship',
  status: 'in_progress',
  lifecycleStatus: 'active',
  lastActor: 'system',
  tokenBudget: 1000,
  tokenUsed: 250,
  timeBudgetMs: 10_000,
  elapsedMs: 2000,
  activeSince: 99_000,
  pausedAt: null,
  completedAt: null,
  abortedAt: null,
  blocker: null,
  completion: null,
  transitionReason: null,
  loopId: 'l1',
  loopMaxIterations: 10,
  loopMaxWallclockMs: 10_000,
  loopTokenBudget: 1000,
  createdAt: 1,
  updatedAt: 2
}

describe('GA-5 fake-clock automation and goal display state', () => {
  it('labels every trigger kind for management UI', () => {
    expect(
      ['one_shot', 'schedule', 'event', 'monitor'].map((kind) => triggerKindLabel(kind as any))
    ).toEqual(['Reminder', 'Schedule', 'Event', 'Monitor'])
  })

  it('reports deterministic next-run, retry, event-waiting, and completed states', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    expect(automationDisplayState(baseAutomation).detail).toBe('in 1m')
    expect(
      automationDisplayState({ ...baseAutomation, retryAt: 130_000, retryAttempt: 1 })
    ).toMatchObject({
      label: 'Retry 2',
      detail: 'in 30s',
      tone: 'warning'
    })
    expect(
      automationDisplayState({
        ...baseAutomation,
        trigger: { kind: 'event', eventName: 'push' },
        nextRunAt: null
      })
    ).toMatchObject({ label: 'Waiting', detail: 'event push' })
    expect(
      automationDisplayState({
        ...baseAutomation,
        enabled: false,
        disabledReason: 'one-shot-completed'
      })
    ).toMatchObject({ label: 'Completed', tone: 'done' })
    vi.useRealTimers()
  })

  it('derives live budget progress and honest blocked/completed detail', () => {
    expect(goalDisplayState(baseGoal, 100_000)).toMatchObject({
      elapsedMs: 3000,
      tokenPercent: 25,
      timePercent: 30,
      statusDetail: null
    })
    expect(
      goalDisplayState({
        ...baseGoal,
        lifecycleStatus: 'blocked',
        activeSince: null,
        blocker: 'quota'
      })
    ).toMatchObject({ statusDetail: 'quota' })
    expect(
      goalDisplayState({
        ...baseGoal,
        lifecycleStatus: 'completed',
        activeSince: null,
        completion: null
      })
    ).toMatchObject({ statusDetail: 'Completed without recorded evidence' })
  })
})
