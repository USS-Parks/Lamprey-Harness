// WM-11 — location beliefs: ranked distributions, layout priors, pruning
// as belief-support removal, and the never-collapse rule.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetLocationBeliefCacheForTesting,
  beliefEvidence,
  buildFileIndex,
  buildLocationBelief,
  pruneBelief
} from './location-beliefs'
import {
  __resetWorldModelStateForTesting,
  recordPatchOutcome
} from './workspace-world-model'

const CONV = 'conv-wm11'
let root: string

function seed(paths: string[]): void {
  for (const p of paths) {
    mkdirSync(join(root, p.split('/').slice(0, -1).join('/')), { recursive: true })
    writeFileSync(join(root, p), 'content')
  }
}

beforeEach(() => {
  __resetWorldModelStateForTesting()
  __resetLocationBeliefCacheForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm11-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('buildLocationBelief', () => {
  it('ranks exact basename matches above stem and containment matches', () => {
    seed(['src/util.ts', 'src/util-helpers.ts', 'docs/util.md'])
    const b = buildLocationBelief(root, CONV, 'util.ts')
    expect(b.candidates[0].path).toBe('src/util.ts')
    expect(b.candidates.map((c) => c.path)).toContain('src/util-helpers.ts')
  })

  it('applies layout priors: src beats docs for the same match strength', () => {
    seed(['src/thing.ts', 'docs/thing.ts'])
    const b = buildLocationBelief(root, CONV, 'thing.ts')
    expect(b.candidates[0].path).toBe('src/thing.ts')
    expect(b.candidates).toHaveLength(2)
  })

  it('keeps the full normalized distribution, never top-1', () => {
    seed(['src/dup.ts', 'lib/dup.ts', 'scripts/dup.ts'])
    const b = buildLocationBelief(root, CONV, 'dup.ts')
    expect(b.candidates.length).toBe(3)
    const total = b.candidates.reduce((n, c) => n + c.weight, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('an optional semantic scorer reweights without dropping candidates', () => {
    seed(['src/a-parser.ts', 'lib/a-parser.ts'])
    const b = buildLocationBelief(root, CONV, 'a-parser.ts', {
      semanticScorer: (_name, paths) =>
        new Map(paths.map((p) => [p, p.startsWith('lib/') ? 1 : 0]))
    })
    expect(b.candidates[0].path).toBe('lib/a-parser.ts')
    expect(b.candidates).toHaveLength(2)
  })

  it('skips node_modules and hidden directories in the index', () => {
    seed(['node_modules/pkg/hidden.ts', 'src/hidden.ts'])
    const idx = buildFileIndex(root, CONV)
    expect(idx.some((e) => e.rel.startsWith('node_modules'))).toBe(false)
  })

  it('the index cache invalidates on workspace writes', () => {
    seed(['src/first.ts'])
    buildFileIndex(root, CONV)
    seed(['src/second.ts'])
    // Without a recorded write the cache serves the stale index…
    expect(buildFileIndex(root, CONV).some((e) => e.base === 'second.ts')).toBe(false)
    // …and any recorded write rebuilds it.
    recordPatchOutcome(CONV, [{ kind: 'add', path: 'src/second.ts' }], root)
    expect(buildFileIndex(root, CONV).some((e) => e.base === 'second.ts')).toBe(true)
  })
})

describe('pruneBelief', () => {
  it('removes candidates under zero-hit scopes and renormalizes', () => {
    seed(['src/x.ts', 'lib/x.ts'])
    const b = buildLocationBelief(root, CONV, 'x.ts')
    const pruned = pruneBelief(b, ['lib'])
    expect(pruned.candidates.map((c) => c.path)).toEqual(['src/x.ts'])
    expect(pruned.candidates[0].weight).toBeCloseTo(1, 5)
  })

  it('refuses to prune the belief to nothing', () => {
    seed(['src/y.ts'])
    const b = buildLocationBelief(root, CONV, 'y.ts')
    const pruned = pruneBelief(b, ['src'])
    expect(pruned.candidates).toHaveLength(1)
  })
})

describe('beliefEvidence', () => {
  it('renders a compact candidate line', () => {
    seed(['src/z.ts', 'lib/z.ts'])
    const b = buildLocationBelief(root, CONV, 'z.ts')
    expect(beliefEvidence(b)).toMatch(/^Closest existing candidates: /)
  })

  it('is empty when nothing matches', () => {
    const b = buildLocationBelief(root, CONV, 'nothing-like-this.xyz')
    expect(beliefEvidence(b)).toBe('')
  })
})
