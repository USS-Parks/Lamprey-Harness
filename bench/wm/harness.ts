// Lamprey Workspace Bench (LWB) — WM-15 harness.
//
// Materialize a task's fixture tree into a workspace and evaluate its goal
// predicates through the SAME engine the product uses
// (goal-predicate-eval). Turn execution (driving runHeadlessTurn against a
// live model) lives in scripts/wm-bench.cjs; this module is the pure,
// testable core so the bench's measurement is gated in CI even though a
// live run is owner-only.

import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import {
  evaluatePredicate,
  type CommandRunner,
  type PredicateResult
} from '../../electron/services/goal-predicate-eval'
import type { BenchTask } from './tasks'

/** Write a task's fixture files under `root`. Returns the file paths written. */
export function materializeTask(task: BenchTask, root: string): string[] {
  const written: string[] = []
  for (const [rel, contents] of Object.entries(task.setup)) {
    const abs = resolve(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, contents)
    written.push(abs)
  }
  return written
}

export interface TaskEvaluation {
  taskId: string
  bench: 'single' | 'multi'
  success: boolean
  results: PredicateResult[]
}

const REJECT_COMMANDS: CommandRunner = async () => ({
  ok: false,
  detail: 'command predicates are not run in the bench self-test'
})

/**
 * Evaluate a task's predicates against the workspace at `root`. All
 * predicates must pass for success. The command runner defaults to a
 * rejector (the fixtures use file predicates); the live runner supplies a
 * real one.
 */
export async function evaluateTask(
  task: BenchTask,
  root: string,
  runCommand: CommandRunner = REJECT_COMMANDS
): Promise<TaskEvaluation> {
  const results: PredicateResult[] = []
  for (const predicate of task.predicates) {
    results.push(await evaluatePredicate(predicate, root, runCommand))
  }
  return {
    taskId: task.id,
    bench: task.bench,
    success: results.length > 0 && results.every((r) => r.met),
    results
  }
}

export interface BenchMetrics {
  bench: 'single' | 'multi'
  tasks: number
  succeeded: number
  successRate: number
}

/** Aggregate task evaluations into per-bench success metrics. */
export function summarize(evaluations: TaskEvaluation[]): BenchMetrics[] {
  const byBench = new Map<'single' | 'multi', TaskEvaluation[]>()
  for (const e of evaluations) {
    const list = byBench.get(e.bench) ?? []
    list.push(e)
    byBench.set(e.bench, list)
  }
  return [...byBench.entries()].map(([bench, list]) => {
    const succeeded = list.filter((e) => e.success).length
    return {
      bench,
      tasks: list.length,
      succeeded,
      successRate: list.length === 0 ? 0 : succeeded / list.length
    }
  })
}
