// WM-8 — goal ledger on the GA store: recording, dedup, deterministic
// evaluation, outcome lifecycle, and the command-predicate safety gate.

import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetGoalLedgerForTesting,
  clearGoalLedger,
  evaluateLedger,
  getLedger,
  getOpenLedgerEntries,
  recordEvaluationOutcomes,
  recordExtractedGoals
} from './goal-ledger'
import {
  __forceMemoryFallback,
  __resetPlanGoalPersistence
} from './plan-goal-persistence'
import { __resetPlanGoalStore, listGoals } from './plan-goal-store'

const CONV = 'conv-wm8'
let root: string

beforeEach(() => {
  __resetGoalLedgerForTesting()
  __resetPlanGoalStore()
  __resetPlanGoalPersistence()
  __forceMemoryFallback()
  root = mkdtempSync(join(tmpdir(), 'wm8-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const okRunner = async () => ({ ok: true, detail: 'exit 0' })

describe('recordExtractedGoals', () => {
  it('creates GA goals with a predicate summary description', () => {
    const entries = recordExtractedGoals(CONV, [
      {
        title: 'add util',
        targets: ['src/util.ts'],
        predicates: [{ kind: 'file-exists', path: 'src/util.ts' }]
      }
    ])
    expect(entries).toHaveLength(1)
    const goals = listGoals(CONV)
    expect(goals).toHaveLength(1)
    expect(goals[0].title).toBe('add util')
    expect(goals[0].description).toContain('src/util.ts exists')
    expect(goals[0].lastActor).toBe('system')
  })

  it('reuses an open goal with the same title instead of duplicating', () => {
    recordExtractedGoals(CONV, [{ title: 'same ask', targets: [], predicates: [] }])
    recordExtractedGoals(CONV, [
      { title: 'same ask', targets: ['a.ts'], predicates: [{ kind: 'file-exists', path: 'a.ts' }] }
    ])
    expect(listGoals(CONV)).toHaveLength(1)
    expect(getLedger(CONV)).toHaveLength(1)
    expect(getLedger(CONV)[0].predicates).toHaveLength(1)
  })
})

describe('evaluateLedger — file predicates', () => {
  it('evaluates every file predicate kind against the live workspace', async () => {
    writeFileSync(join(root, 'made.ts'), 'export const x = 1\n')
    recordExtractedGoals(CONV, [
      {
        title: 'file goals',
        targets: [],
        predicates: [
          { kind: 'file-exists', path: 'made.ts' },
          { kind: 'file-absent', path: 'gone.ts' },
          { kind: 'file-contains', path: 'made.ts', needle: 'export const x' },
          { kind: 'file-not-contains', path: 'made.ts', needle: 'TODO' }
        ]
      }
    ])
    const evals = await evaluateLedger(CONV, root, okRunner)
    expect(evals[0].met).toBe(true)
    expect(evals[0].results.every((r) => r.met)).toBe(true)
  })

  it('reports unmet predicates with details', async () => {
    recordExtractedGoals(CONV, [
      {
        title: 'unmet',
        targets: [],
        predicates: [{ kind: 'file-contains', path: 'nope.ts', needle: 'x' }]
      }
    ])
    const evals = await evaluateLedger(CONV, root, okRunner)
    expect(evals[0].met).toBe(false)
    expect(evals[0].results[0].detail).toBe('file missing')
  })

  it('a goal with zero predicates is never met by vacuity', async () => {
    recordExtractedGoals(CONV, [{ title: 'no checks', targets: [], predicates: [] }])
    const evals = await evaluateLedger(CONV, root, okRunner)
    expect(evals[0].met).toBe(false)
  })
})

describe('evaluateLedger — command predicates', () => {
  it('runs safe commands through the injected runner', async () => {
    recordExtractedGoals(CONV, [
      {
        title: 'tests pass',
        targets: [],
        predicates: [{ kind: 'command-succeeds', command: 'npm test' }]
      }
    ])
    const evals = await evaluateLedger(CONV, root, async (cmd) => {
      expect(cmd).toBe('npm test')
      return { ok: true, detail: 'exit 0' }
    })
    expect(evals[0].met).toBe(true)
  })

  it('refuses dangerous commands and counts them unmet', async () => {
    recordExtractedGoals(CONV, [
      {
        title: 'sneaky',
        targets: [],
        predicates: [{ kind: 'command-succeeds', command: 'git reset --hard HEAD~5' }]
      }
    ])
    let ran = 0
    const evals = await evaluateLedger(CONV, root, async () => {
      ran++
      return { ok: true, detail: '' }
    })
    expect(ran).toBe(0)
    expect(evals[0].met).toBe(false)
    expect(evals[0].results[0].detail).toContain('refused to run')
  })

  it('caps command predicates per evaluation', async () => {
    recordExtractedGoals(CONV, [
      {
        title: 'many commands',
        targets: [],
        predicates: [1, 2, 3, 4].map((i) => ({
          kind: 'command-succeeds' as const,
          command: `echo ${i}`
        }))
      }
    ])
    let ran = 0
    await evaluateLedger(CONV, root, async () => {
      ran++
      return { ok: true, detail: '' }
    })
    expect(ran).toBe(3)
  })
})

describe('recordEvaluationOutcomes', () => {
  it('completes met goals with evidence and leaves unmet ones open mid-flight', async () => {
    writeFileSync(join(root, 'done.ts'), 'x')
    recordExtractedGoals(CONV, [
      { title: 'met one', targets: [], predicates: [{ kind: 'file-exists', path: 'done.ts' }] },
      { title: 'unmet one', targets: [], predicates: [{ kind: 'file-exists', path: 'never.ts' }] }
    ])
    const evals = await evaluateLedger(CONV, root, okRunner)
    recordEvaluationOutcomes(CONV, evals, { final: false })
    const goals = listGoals(CONV)
    const met = goals.find((g) => g.title === 'met one')!
    const unmet = goals.find((g) => g.title === 'unmet one')!
    expect(met.lifecycleStatus).toBe('completed')
    expect(met.completion).toContain('file-exists done.ts')
    expect(unmet.lifecycleStatus).toBe('open')
    expect(getOpenLedgerEntries(CONV).map((e) => e.title)).toEqual(['unmet one'])
  })

  it('a final settle blocks unmet goals with the evidence as blocker', async () => {
    recordExtractedGoals(CONV, [
      { title: 'stuck', targets: [], predicates: [{ kind: 'file-exists', path: 'never.ts' }] }
    ])
    const evals = await evaluateLedger(CONV, root, okRunner)
    recordEvaluationOutcomes(CONV, evals, { final: true })
    const g = listGoals(CONV)[0]
    expect(g.lifecycleStatus).toBe('blocked')
    expect(g.blocker).toContain('UNMET')
  })
})

describe('lifecycle', () => {
  it('clearGoalLedger drops predicate state', () => {
    recordExtractedGoals(CONV, [{ title: 'x', targets: [], predicates: [] }])
    clearGoalLedger(CONV)
    expect(getLedger(CONV)).toEqual([])
  })
})
