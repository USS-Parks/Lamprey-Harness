// WM-12 — expected cost + ordering: located-vs-unlocated effort, the
// visited-scope discount, exact enumeration, and per-round reordering.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computeSubtaskCosts,
  orderSubtasks,
  type OrderableSubtask
} from './subtask-ordering'
import { __resetLocationBeliefCacheForTesting } from './location-beliefs'
import { __resetWorldModelStateForTesting } from './workspace-world-model'

const CONV = 'conv-wm12'
let root: string

function seed(paths: string[]): void {
  for (const p of paths) {
    const dir = p.split('/').slice(0, -1).join('/')
    if (dir) mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, p), 'x')
  }
}

beforeEach(() => {
  __resetWorldModelStateForTesting()
  __resetLocationBeliefCacheForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm12-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const ctx = () => ({ workspaceRoot: root, conversationId: CONV })
const st = (id: string, targets: string[]): OrderableSubtask => ({ id, title: id, targets })

describe('computeSubtaskCosts', () => {
  it('located targets cost the flat constant; unlocated cost belief-weighted scan size', () => {
    seed(['src/known.ts', 'src/a.ts', 'src/b.ts', 'src/c.ts'])
    const costs = computeSubtaskCosts(
      [st('located', ['src/known.ts']), st('unlocated', ['mystery.ts'])],
      ctx()
    )
    expect(costs.get('located')!.effort).toBe(1)
    expect(costs.get('unlocated')!.effort).toBeGreaterThan(1)
  })

  it('an unlocated target with a basename match scopes to its belief dirs', () => {
    seed(['src/deep/find.ts'])
    const costs = computeSubtaskCosts([st('s', ['find.ts'])], ctx())
    expect(costs.get('s')!.scopes).toContain('src/deep')
  })
})

describe('orderSubtasks', () => {
  it('puts the cheapest subtask first', () => {
    seed(['src/cheap.ts', ...Array.from({ length: 12 }, (_, i) => `lib/f${i}.ts`)])
    const r = orderSubtasks(
      [st('expensive', ['nowhere-close.ts']), st('cheap', ['src/cheap.ts'])],
      ctx()
    )
    expect(r.order[0].id).toBe('cheap')
  })

  it('the visited-scope discount groups subtasks sharing a directory', () => {
    seed([
      'src/feature/one.ts', 'src/feature/two.ts',
      ...Array.from({ length: 10 }, (_, i) => `src/feature/pad${i}.ts`),
      'docs/far.md'
    ])
    // b and c share src/feature; a lives in docs. The cheapest full route
    // works the shared-scope pair back-to-back rather than alternating.
    const r = orderSubtasks(
      [st('a', ['docs/far.md']), st('b', ['one.ts']), st('c', ['two.ts'])],
      ctx()
    )
    const idx = (id: string): number => r.order.findIndex((s) => s.id === id)
    expect(Math.abs(idx('b') - idx('c'))).toBe(1)
  })

  it('single and empty inputs pass through', () => {
    expect(orderSubtasks([], ctx()).order).toEqual([])
    const one = [st('only', [])]
    expect(orderSubtasks(one, ctx()).order).toEqual(one)
  })

  it('N > 6 falls back to greedy and still returns every subtask', () => {
    seed(['src/a.ts'])
    const many = Array.from({ length: 8 }, (_, i) => st(`s${i}`, []))
    const r = orderSubtasks(many, ctx())
    expect(r.order).toHaveLength(8)
    expect(new Set(r.order.map((s) => s.id)).size).toBe(8)
  })
})
