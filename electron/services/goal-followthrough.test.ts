// WM-9 — follow-through decisions: continue with a structured complaint,
// settle when met, exhaust honestly, never re-arm within a turn.

import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./event-log', () => ({
  recordEvent: vi.fn()
}))

import {
  buildUnmetComplaint,
  runFollowThroughCheck
} from './goal-followthrough'
import {
  __resetGoalLedgerForTesting,
  evaluateLedger,
  recordExtractedGoals
} from './goal-ledger'
import {
  __forceMemoryFallback,
  __resetPlanGoalPersistence
} from './plan-goal-persistence'
import { __resetPlanGoalStore, listGoals } from './plan-goal-store'
import {
  __resetWorldModelBudgetForTesting,
  beginWorldModelTurn
} from './world-model-budget'

const CONV = 'conv-wm9'
let root: string

beforeEach(() => {
  __resetGoalLedgerForTesting()
  __resetPlanGoalStore()
  __resetPlanGoalPersistence()
  __forceMemoryFallback()
  __resetWorldModelBudgetForTesting()
  beginWorldModelTurn(CONV)
  root = mkdtempSync(join(tmpdir(), 'wm9-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const okRunner = async () => ({ ok: true, detail: 'exit 0' })

function check(maxRounds = 5, atRoundCap = false) {
  return runFollowThroughCheck({
    conversationId: CONV,
    workspaceRoot: root,
    maxRounds,
    atRoundCap,
    runner: okRunner
  })
}

describe('runFollowThroughCheck', () => {
  it('settles immediately when the ledger is empty', async () => {
    const r = await check()
    expect(r.continue).toBe(false)
    expect(r.evaluations).toEqual([])
  })

  it('completes met goals and settles without a continuation', async () => {
    writeFileSync(join(root, 'made.ts'), 'x')
    recordExtractedGoals(CONV, [
      { title: 'make it', targets: [], predicates: [{ kind: 'file-exists', path: 'made.ts' }] }
    ])
    const r = await check()
    expect(r.continue).toBe(false)
    expect(listGoals(CONV)[0].lifecycleStatus).toBe('completed')
  })

  it('continues with a structured complaint while rounds remain', async () => {
    recordExtractedGoals(CONV, [
      { title: 'unfinished', targets: [], predicates: [{ kind: 'file-exists', path: 'not-yet.ts' }] }
    ])
    const r = await check(5)
    expect(r.continue).toBe(true)
    expect(r.complaint).toContain('UNMET file-exists not-yet.ts')
    expect(r.complaint).toContain('Continue working')
    expect(r.systemNote).toContain('round 1/5')
  })

  it('counts rounds across checks and exhausts at the cap with blocked goals', async () => {
    recordExtractedGoals(CONV, [
      { title: 'never done', targets: [], predicates: [{ kind: 'file-exists', path: 'never.ts' }] }
    ])
    const r1 = await check(2)
    const r2 = await check(2)
    expect(r1.continue).toBe(true)
    expect(r2.continue).toBe(true)
    const r3 = await check(2)
    expect(r3.continue).toBe(false)
    expect(r3.systemNote).toContain('unmet')
    expect(listGoals(CONV)[0].lifecycleStatus).toBe('blocked')
  })

  it('never re-arms within a turn after exhaustion; a new turn does', async () => {
    recordExtractedGoals(CONV, [
      { title: 'stuck', targets: [], predicates: [{ kind: 'file-exists', path: 'never.ts' }] }
    ])
    await check(1)
    const exhausted = await check(1)
    expect(exhausted.continue).toBe(false)
    // Even repeated checks in the same turn stay settled (blocked goals are
    // no longer open, so the ledger has nothing to drive).
    const again = await check(1)
    expect(again.continue).toBe(false)
    expect(again.evaluations).toEqual([])
  })

  it('the round-cap guard forces a final settle even with rounds remaining', async () => {
    recordExtractedGoals(CONV, [
      { title: 'capped', targets: [], predicates: [{ kind: 'file-exists', path: 'never.ts' }] }
    ])
    const r = await check(5, true)
    expect(r.continue).toBe(false)
    expect(listGoals(CONV)[0].lifecycleStatus).toBe('blocked')
  })

  it('mixed goals: met ones complete now, unmet ones drive the complaint only', async () => {
    writeFileSync(join(root, 'done.ts'), 'x')
    recordExtractedGoals(CONV, [
      { title: 'done part', targets: [], predicates: [{ kind: 'file-exists', path: 'done.ts' }] },
      { title: 'open part', targets: [], predicates: [{ kind: 'file-exists', path: 'open.ts' }] }
    ])
    const r = await check()
    expect(r.continue).toBe(true)
    expect(r.complaint).not.toContain('done part')
    expect(r.complaint).toContain('open part')
    const goals = listGoals(CONV)
    expect(goals.find((g) => g.title === 'done part')!.lifecycleStatus).toBe('completed')
    expect(goals.find((g) => g.title === 'open part')!.lifecycleStatus).toBe('open')
  })
})

describe('buildUnmetComplaint', () => {
  it('names each unmet predicate with its evidence detail', async () => {
    recordExtractedGoals(CONV, [
      {
        title: 'goal',
        targets: [],
        predicates: [
          { kind: 'file-contains', path: 'x.ts', needle: 'export' },
          { kind: 'command-succeeds', command: 'npm test' }
        ]
      }
    ])
    const evals = await evaluateLedger(CONV, root, async () => ({ ok: false, detail: 'exit 1' }))
    const c = buildUnmetComplaint(evals)
    expect(c).toContain('UNMET file-contains x.ts: file missing')
    expect(c).toContain('UNMET command-succeeds npm test: exit 1')
  })
})
