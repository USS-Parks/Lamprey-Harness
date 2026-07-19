import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAutomationTrigger } from './automation-trigger'

const mocks = vi.hoisted(() => ({
  enabled: true,
  rows: [] as Array<Record<string, any>>,
  claimed: new Set<string>(),
  beginAutomationRun: vi.fn((input: Record<string, any>) => {
    const key = `${input.automationId}:${input.triggerKey}:${input.attempt}`
    if (mocks.claimed.has(key)) return null
    mocks.claimed.add(key)
    return `run:${key}`
  }),
  settleAutomationRun: vi.fn(),
  chatOnce: vi.fn(async () => ({ content: 'ok' })),
  wakeGoal: vi.fn(() => ({ goalId: 'g1', loopId: 'l1', nextFireAt: 10_000, ceilings: {} }))
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./loop-config', () => ({ readLoopConfig: () => ({ enabled: mocks.enabled }) }))
vi.mock('./automations-store', () => ({
  listAutomations: () => mocks.rows,
  getAutomation: (id: string) => mocks.rows.find((row) => row.id === id) ?? null,
  beginAutomationRun: mocks.beginAutomationRun,
  settleAutomationRun: mocks.settleAutomationRun,
  recoverInterruptedAutomationRuns: vi.fn(() => 0),
  initializeAutomationNextRuns: vi.fn(() => 0)
}))
vi.mock('./providers/registry', () => ({ chatOnce: mocks.chatOnce }))
vi.mock('./goal-automation-loop-bridge', () => ({ wakeGoalFromAutomation: mocks.wakeGoal }))
vi.mock('./event-log', () => ({
  boundedJsonPreview: (value: unknown) => value,
  recordEvent: vi.fn()
}))

import { dispatchAutomationEvent, tickAutomationsOnce } from './automations-runner'

function row(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: 'a1',
    label: 'A',
    prompt: 'Run',
    model: null,
    enabled: true,
    trigger: parseAutomationTrigger({ kind: 'schedule', everySeconds: 30, startAt: 0 }),
    nextRunAt: 10_000,
    lastTriggerKey: null,
    retryAttempt: 0,
    retryAt: null,
    disabledReason: null,
    goalId: null,
    ...overrides
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  mocks.enabled = true
  mocks.rows = []
  mocks.claimed.clear()
  mocks.beginAutomationRun.mockClear()
  mocks.settleAutomationRun.mockClear()
  mocks.chatOnce.mockReset()
  mocks.chatOnce.mockResolvedValue({ content: 'ok' })
  mocks.wakeGoal.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GA-2 automation runner scheduling', () => {
  it('honors the outer loop gate and per-row disabled state', async () => {
    mocks.rows = [row(), row({ id: 'disabled', enabled: false })]
    mocks.enabled = false
    expect(await tickAutomationsOnce(10_000)).toBe(0)
    expect(mocks.beginAutomationRun).not.toHaveBeenCalled()

    mocks.enabled = true
    expect(await tickAutomationsOnce(10_000)).toBe(1)
    expect(mocks.beginAutomationRun).toHaveBeenCalledTimes(1)
  })

  it('settles due schedules and advances to one future boundary', async () => {
    mocks.rows = [row()]
    expect(await tickAutomationsOnce(10_000)).toBe(1)
    expect(mocks.settleAutomationRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      triggerKey: 'schedule:10000',
      nextRunAt: 30_000,
      retryAttempt: 0,
      retryAt: null
    }))
  })

  it('wakes a bound goal loop without calling the provider directly', async () => {
    mocks.rows = [row({ goalId: 'g1', goalConversationId: 'c1' })]
    expect(await tickAutomationsOnce(10_000)).toBe(1)
    expect(mocks.wakeGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', goalId: 'g1' }))
    expect(mocks.chatOnce).not.toHaveBeenCalled()
  })

  it('deduplicates named events by stable event id', async () => {
    mocks.rows = [row({
      trigger: parseAutomationTrigger({ kind: 'event', eventName: 'build.completed' }),
      nextRunAt: null
    })]
    expect(await dispatchAutomationEvent('build.completed', 'event-1'))
      .toEqual({ matched: 1, started: 1 })
    expect(await dispatchAutomationEvent('build.completed', 'event-1'))
      .toEqual({ matched: 1, started: 0 })
    expect(mocks.chatOnce).toHaveBeenCalledTimes(1)
  })

  it('retries the same trigger key with deterministic backoff after failure', async () => {
    mocks.chatOnce.mockRejectedValueOnce(new Error('provider offline'))
    mocks.rows = [row({
      trigger: parseAutomationTrigger({
        kind: 'monitor', everySeconds: 60, retryDelaySeconds: 10, maxAttempts: 3
      })
    })]
    expect(await tickAutomationsOnce(10_000)).toBe(1)
    expect(mocks.settleAutomationRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      triggerKey: 'monitor:10000',
      retryAttempt: 1,
      retryAt: 20_000
    }))
  })
})
