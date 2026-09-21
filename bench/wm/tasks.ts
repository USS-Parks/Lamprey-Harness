// Lamprey Workspace Bench (LWB) — WM-15.
//
// Task definitions for measuring the workspace world model against Qwen-class
// models. Each task is self-contained: a small fixture tree (inline file
// contents), an instruction prompt, and typed goal predicates in the SAME
// GoalPredicate shape the product extracts and checks (goal-predicate-eval).
// The bench therefore measures the product mechanism, not a parallel copy.
//
// Two benches, per WM_BASELINE: single long-horizon edits (Experiment 1
// analog) and multi-part instructions with independent subtasks
// (Experiment 2 analog). Runner: scripts/wm-bench.cjs.

import type { GoalPredicate } from '../../electron/services/goal-extraction'

export interface BenchTask {
  id: string
  bench: 'single' | 'multi'
  /** The instruction handed to the model. */
  prompt: string
  /** Fixture files written into the task's temp workspace before the turn. */
  setup: Record<string, string>
  /** Goal predicates that must all pass for the task to count as success. */
  predicates: GoalPredicate[]
}

const TS_HEADER = '// generated fixture\n'

export const SINGLE_TASKS: BenchTask[] = [
  {
    id: 'single/rename-symbol',
    bench: 'single',
    prompt:
      'In src/math.ts, rename the exported function `add` to `sum` and update its call in src/index.ts.',
    setup: {
      'src/math.ts': `${TS_HEADER}export function add(a: number, b: number): number {\n  return a + b\n}\n`,
      'src/index.ts': `${TS_HEADER}import { add } from './math'\nconsole.log(add(2, 3))\n`
    },
    predicates: [
      { kind: 'file-contains', path: 'src/math.ts', needle: 'export function sum' },
      { kind: 'file-not-contains', path: 'src/math.ts', needle: 'export function add' },
      { kind: 'file-contains', path: 'src/index.ts', needle: 'sum(2, 3)' }
    ]
  },
  {
    id: 'single/add-guard',
    bench: 'single',
    prompt:
      'In src/parse.ts, make `parse` return null instead of throwing when the input string is empty.',
    setup: {
      'src/parse.ts': `${TS_HEADER}export function parse(input: string): number {\n  return Number(input)\n}\n`
    },
    predicates: [
      { kind: 'file-contains', path: 'src/parse.ts', needle: 'null' },
      { kind: 'file-contains', path: 'src/parse.ts', needle: 'input' }
    ]
  },
  {
    id: 'single/new-file',
    bench: 'single',
    prompt:
      'Create src/util/clamp.ts exporting a `clamp(n, lo, hi)` function that constrains n to the [lo, hi] range.',
    setup: {
      'src/util/.keep': ''
    },
    predicates: [
      { kind: 'file-exists', path: 'src/util/clamp.ts' },
      { kind: 'file-contains', path: 'src/util/clamp.ts', needle: 'clamp' }
    ]
  },
  {
    id: 'single/delete-dead',
    bench: 'single',
    prompt: 'Delete the unused file src/legacy/old.ts.',
    setup: {
      'src/legacy/old.ts': `${TS_HEADER}export const OLD = true\n`,
      'src/index.ts': `${TS_HEADER}console.log('hi')\n`
    },
    predicates: [{ kind: 'file-absent', path: 'src/legacy/old.ts' }]
  },
  {
    id: 'single/config-flag',
    bench: 'single',
    prompt:
      'In config.json, add a top-level boolean field "verbose" set to false. Keep the existing "name" field.',
    setup: {
      'config.json': `{\n  "name": "demo"\n}\n`
    },
    predicates: [
      { kind: 'file-contains', path: 'config.json', needle: '"verbose"' },
      { kind: 'file-contains', path: 'config.json', needle: '"name"' }
    ]
  },
  {
    id: 'single/nested-edit',
    bench: 'single',
    prompt:
      'In src/deep/nested/handler.ts, change the returned status code from 200 to 204.',
    setup: {
      'src/deep/nested/handler.ts': `${TS_HEADER}export function handle(): number {\n  return 200\n}\n`
    },
    predicates: [
      { kind: 'file-contains', path: 'src/deep/nested/handler.ts', needle: '204' },
      { kind: 'file-not-contains', path: 'src/deep/nested/handler.ts', needle: '200' }
    ]
  },
  {
    id: 'single/append-export',
    bench: 'single',
    prompt: 'Add an exported constant `MAX = 100` to the end of src/limits.ts, keeping the existing MIN export.',
    setup: {
      'src/limits.ts': `${TS_HEADER}export const MIN = 0\n`
    },
    predicates: [
      { kind: 'file-contains', path: 'src/limits.ts', needle: 'export const MAX = 100' },
      { kind: 'file-contains', path: 'src/limits.ts', needle: 'export const MIN = 0' }
    ]
  },
  {
    id: 'single/readme-section',
    bench: 'single',
    prompt: 'Add a "## Install" section heading to README.md below the existing title.',
    setup: {
      'README.md': `# Demo\n\nA demo project.\n`
    },
    predicates: [
      { kind: 'file-contains', path: 'README.md', needle: '## Install' },
      { kind: 'file-contains', path: 'README.md', needle: '# Demo' }
    ]
  }
]

export const MULTI_TASKS: BenchTask[] = [
  {
    id: 'multi/two-files',
    bench: 'multi',
    prompt:
      'Two things: (1) add a `VERSION` export set to "1.0.0" in src/meta.ts, and (2) create docs/CHANGELOG.md with a first line "# Changelog".',
    setup: {
      'src/meta.ts': `${TS_HEADER}export const NAME = 'demo'\n`,
      'docs/.keep': ''
    },
    predicates: [
      { kind: 'file-contains', path: 'src/meta.ts', needle: 'VERSION' },
      { kind: 'file-contains', path: 'src/meta.ts', needle: '1.0.0' },
      { kind: 'file-exists', path: 'docs/CHANGELOG.md' },
      { kind: 'file-contains', path: 'docs/CHANGELOG.md', needle: '# Changelog' }
    ]
  },
  {
    id: 'multi/three-independent',
    bench: 'multi',
    prompt:
      'Do three independent things: rename `foo` to `bar` in a.ts; add a `// TODO: none` comment at the top of b.ts; delete c.ts.',
    setup: {
      'a.ts': `${TS_HEADER}export const foo = 1\n`,
      'b.ts': `${TS_HEADER}export const b = 2\n`,
      'c.ts': `${TS_HEADER}export const c = 3\n`
    },
    predicates: [
      { kind: 'file-contains', path: 'a.ts', needle: 'bar' },
      { kind: 'file-not-contains', path: 'a.ts', needle: 'foo' },
      { kind: 'file-contains', path: 'b.ts', needle: 'TODO: none' },
      { kind: 'file-absent', path: 'c.ts' }
    ]
  }
]

export const ALL_TASKS: BenchTask[] = [...SINGLE_TASKS, ...MULTI_TASKS]
