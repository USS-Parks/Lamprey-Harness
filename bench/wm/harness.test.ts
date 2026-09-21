// WM-15 — the bench predicate-engine self-test. Proves the harness
// materializes fixtures and evaluates goals correctly on a known-good and a
// known-bad workspace, so a live run's numbers mean what they claim.

import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { evaluateTask, materializeTask, summarize } from './harness'
import { ALL_TASKS, MULTI_TASKS, SINGLE_TASKS, type BenchTask } from './tasks'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lwb-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** Perform the change a correct model would make for a given task. */
function applySolution(task: BenchTask): void {
  switch (task.id) {
    case 'single/rename-symbol':
      writeFileSync(join(root, 'src/math.ts'), 'export function sum(a: number, b: number): number {\n  return a + b\n}\n')
      writeFileSync(join(root, 'src/index.ts'), "import { sum } from './math'\nconsole.log(sum(2, 3))\n")
      break
    case 'multi/two-files':
      writeFileSync(join(root, 'src/meta.ts'), "export const NAME = 'demo'\nexport const VERSION = '1.0.0'\n")
      writeFileSync(join(root, 'docs/CHANGELOG.md'), '# Changelog\n')
      break
    default:
      throw new Error(`no solution wired for ${task.id}`)
  }
}

describe('LWB task catalog', () => {
  it('has both benches populated with unique ids', () => {
    expect(SINGLE_TASKS.length).toBeGreaterThanOrEqual(5)
    expect(MULTI_TASKS.length).toBeGreaterThanOrEqual(2)
    const ids = ALL_TASKS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every task has at least one predicate', () => {
    for (const t of ALL_TASKS) expect(t.predicates.length).toBeGreaterThan(0)
  })
})

describe('materialize + evaluate — known-bad (fixture as-is)', () => {
  it('a freshly materialized single task fails its goals', async () => {
    const task = SINGLE_TASKS.find((t) => t.id === 'single/rename-symbol')!
    materializeTask(task, root)
    const evaluation = await evaluateTask(task, root)
    expect(evaluation.success).toBe(false)
  })

  it('a freshly materialized multi task fails its goals', async () => {
    const task = MULTI_TASKS.find((t) => t.id === 'multi/two-files')!
    materializeTask(task, root)
    const evaluation = await evaluateTask(task, root)
    expect(evaluation.success).toBe(false)
  })
})

describe('materialize + evaluate — known-good (solution applied)', () => {
  it('a correctly solved single task passes every predicate', async () => {
    const task = SINGLE_TASKS.find((t) => t.id === 'single/rename-symbol')!
    materializeTask(task, root)
    applySolution(task)
    const evaluation = await evaluateTask(task, root)
    expect(evaluation.success).toBe(true)
    expect(evaluation.results.every((r) => r.met)).toBe(true)
  })

  it('a correctly solved multi task passes every predicate', async () => {
    const task = MULTI_TASKS.find((t) => t.id === 'multi/two-files')!
    materializeTask(task, root)
    applySolution(task)
    const evaluation = await evaluateTask(task, root)
    expect(evaluation.success).toBe(true)
  })
})

describe('summarize', () => {
  it('aggregates per-bench success rates', () => {
    const metrics = summarize([
      { taskId: 'a', bench: 'single', success: true, results: [] },
      { taskId: 'b', bench: 'single', success: false, results: [] },
      { taskId: 'c', bench: 'multi', success: true, results: [] }
    ])
    const single = metrics.find((m) => m.bench === 'single')!
    const multi = metrics.find((m) => m.bench === 'multi')!
    expect(single).toMatchObject({ tasks: 2, succeeded: 1, successRate: 0.5 })
    expect(multi).toMatchObject({ tasks: 1, succeeded: 1, successRate: 1 })
  })
})
