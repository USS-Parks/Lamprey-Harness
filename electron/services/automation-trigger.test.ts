import { describe, expect, it } from 'vitest'
import {
  initialNextRunAt,
  nextRunAfterSettlement,
  parseAutomationTrigger,
  retryAt,
  triggerKey
} from './automation-trigger'

describe('GA-2 automation trigger semantics', () => {
  it('runs a missed one-shot once at the next scheduler tick', () => {
    const trigger = parseAutomationTrigger({ kind: 'one_shot', at: 1_000 })
    expect(initialNextRunAt(trigger, 2_000)).toBe(2_000)
    expect(nextRunAfterSettlement(trigger, 2_000)).toBeNull()
  })

  it('coalesces missed fixed schedule and monitor intervals without a burst', () => {
    const schedule = parseAutomationTrigger({
      kind: 'schedule', everySeconds: 30, startAt: 1_000
    })
    const monitor = parseAutomationTrigger({
      kind: 'monitor', everySeconds: 60, startAt: 1_000
    })
    expect(nextRunAfterSettlement(schedule, 95_000)).toBe(121_000)
    expect(nextRunAfterSettlement(monitor, 125_000)).toBe(181_000)
  })

  it('computes cron next-run deterministically after the current minute', () => {
    const trigger = parseAutomationTrigger({ kind: 'schedule', cron: '0 9 * * *' })
    const now = new Date('2026-07-19T08:30:00').getTime()
    const next = initialNextRunAt(trigger, now)
    expect(next).not.toBeNull()
    expect(new Date(next!).getHours()).toBe(9)
    expect(new Date(next!).getMinutes()).toBe(0)
  })

  it('uses stable event ids as dedup keys and never schedules events by clock', () => {
    const trigger = parseAutomationTrigger({ kind: 'event', eventName: 'build.completed' })
    expect(initialNextRunAt(trigger, 5_000)).toBeNull()
    expect(triggerKey(trigger, 0, 'event-42')).toBe('event:build.completed:event-42')
    expect(() => triggerKey(trigger, 0)).toThrow(/stable event id/i)
  })

  it('applies bounded exponential retry and stops at maxAttempts', () => {
    const trigger = parseAutomationTrigger({
      kind: 'monitor', everySeconds: 60, maxAttempts: 3, retryDelaySeconds: 10
    })
    expect(retryAt(trigger, 1, 1_000)).toBe(11_000)
    expect(retryAt(trigger, 2, 1_000)).toBe(21_000)
    expect(retryAt(trigger, 3, 1_000)).toBeNull()
  })

  it('rejects ambiguous schedules, undersized monitors, and unknown trigger kinds', () => {
    expect(() => parseAutomationTrigger({
      kind: 'schedule', cron: '* * * * *', everySeconds: 30
    })).toThrow(/exactly one/i)
    expect(() => parseAutomationTrigger({ kind: 'monitor', everySeconds: 5 })).toThrow(/>= 30/)
    expect(() => parseAutomationTrigger({ kind: 'raw_directive' })).toThrow(/unsupported kind/i)
  })
})
