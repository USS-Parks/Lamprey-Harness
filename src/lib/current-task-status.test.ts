import { describe, expect, it } from 'vitest'
import { currentTaskStatus } from './current-task-status'
import { applyTurnSettledEvent, applyTurnStartedEvent, reconcileTurnControlSnapshot } from './follow-up-state'
import type { TurnId } from './turn-control-types'
const turnId = 'turn-one' as TurnId
const base = { owner: 'one', sending: false, phase: null, approvalCount: 0, state: { activeTurn: null, followUps: [], observedAt: 1, revision: 1 } } as const

describe('one truthful task status', () => {
  it('does not call unknown or unavailable status idle', () => {
    expect(currentTaskStatus({ ...base, state: undefined }).label).toBe('Loading status')
    expect(currentTaskStatus({ ...base, state: { ...base.state, followUps: [], hydrationError: 'offline' } }).label).toBe('Status unavailable')
  })
  it.each(['completed', 'failed', 'cancelled', 'interrupted', 'recovered'] as const)('preserves the distinct %s outcome', status => {
    const state = applyTurnSettledEvent(undefined, { conversationId: 'one', turnId, status, occurredAt: 20, completedAt: 20, persisted: true, revision: 2 })
    const result = currentTaskStatus({ ...base, state })
    expect(result.tone === 'success').toBe(status === 'completed')
    expect(result.label.toLowerCase()).toContain(status === 'recovered' ? 'recovered' : status)
  })
  it('never claims successful persistence after saving fails', () => {
    const state = applyTurnSettledEvent(undefined, { conversationId: 'one', turnId, status: 'completed', occurredAt: 20, completedAt: 20, persisted: false, revision: 2 })
    expect(currentTaskStatus({ ...base, state }).label).toBe('Turn ended; saving failed')
  })
  it('gives approvals precedence and keeps orphan recovery explicit', () => {
    expect(currentTaskStatus({ ...base, state: undefined, approvalCount: 2 }).label).toBe('Waiting for approval (2)')
    expect(currentTaskStatus({ ...base, state: { ...base.state, followUps: [], orphaned: true } }).label).toContain('needs recovery')
  })
  it('does not revive a settled turn from a stale started event', () => {
    const settled = applyTurnSettledEvent(undefined, { conversationId: 'one', turnId, status: 'cancelled', occurredAt: 20, completedAt: 20, persisted: true, revision: 5 })
    const stale = applyTurnStartedEvent(settled, { conversationId: 'one', turnId, kind: 'regular', status: 'running', startedAt: 1, occurredAt: 1, revision: 4 })
    expect(stale).toBe(settled)
    expect(currentTaskStatus({ ...base, state: stale }).label).toBe('Cancelled')
  })
  it('hydrates a durable failure without replacing it with an older snapshot', () => {
    const snapshot = { conversationId: 'one', activeTurn: null, followUps: [], lastOutcome: { turnId, status: 'failed' as const, completedAt: 5, persisted: true }, observedAt: 10, revision: 5 }
    const state = reconcileTurnControlSnapshot(undefined, snapshot)
    expect(currentTaskStatus({ ...base, state }).label).toBe('Failed')
    expect(reconcileTurnControlSnapshot(state, { ...snapshot, lastOutcome: null, revision: 4 })).toBe(state)
  })
})
