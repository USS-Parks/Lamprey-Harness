// WM-14 — the world-model event tally feeding the After-action panel.

import { describe, expect, it } from 'vitest'
import { tallyWorldModelEvents, type WorldModelTally } from './after-action-report'
import type { EventRecord } from './event-log'

let seq = 0
function ev(type: string, payload: Record<string, unknown> = {}): EventRecord {
  return {
    id: `e${seq++}`,
    type: type as EventRecord['type'],
    createdAt: seq,
    severity: 'info',
    actorKind: 'system',
    payload,
    redaction: 'metadata'
  }
}

const empty: WorldModelTally = {
  verdicts: 0,
  repairs: 0,
  downgrades: 0,
  followThroughContinues: 0,
  followThroughExhausted: 0,
  goalsMet: 0,
  goalsUnmet: 0
}

describe('tallyWorldModelEvents', () => {
  it('returns zeros for a conversation with no world-model events', () => {
    expect(tallyWorldModelEvents([ev('chat.error'), ev('tool.call.completed')])).toEqual(empty)
  })

  it('counts verdicts, repairs, and downgrades', () => {
    const t = tallyWorldModelEvents([
      ev('world_model.verdict'),
      ev('world_model.verdict'),
      ev('world_model.repair'),
      ev('world_model.downgrade')
    ])
    expect(t.verdicts).toBe(2)
    expect(t.repairs).toBe(1)
    expect(t.downgrades).toBe(1)
  })

  it('splits follow-through events by phase', () => {
    const t = tallyWorldModelEvents([
      ev('world_model.followthrough', { phase: 'continue', goals: 3, unmet: 2 }),
      ev('world_model.followthrough', { phase: 'continue', goals: 3, unmet: 1 }),
      ev('world_model.followthrough', { phase: 'exhausted', goals: 3, unmet: 1 })
    ])
    expect(t.followThroughContinues).toBe(2)
    expect(t.followThroughExhausted).toBe(1)
  })

  it('takes goals met/unmet from the LATEST follow-through, not a running sum', () => {
    const t = tallyWorldModelEvents([
      ev('world_model.followthrough', { phase: 'continue', goals: 4, unmet: 4 }),
      ev('world_model.followthrough', { phase: 'continue', goals: 4, unmet: 2 }),
      ev('world_model.followthrough', { phase: 'met', goals: 4, unmet: 0 })
    ])
    expect(t.goalsMet).toBe(4)
    expect(t.goalsUnmet).toBe(0)
  })

  it('never reports negative goals met', () => {
    const t = tallyWorldModelEvents([
      ev('world_model.followthrough', { phase: 'exhausted', goals: 1, unmet: 3 })
    ])
    expect(t.goalsMet).toBe(0)
    expect(t.goalsUnmet).toBe(3)
  })
})
