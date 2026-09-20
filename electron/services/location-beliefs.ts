// Workspace World Model Phase (WM-11) — location beliefs.
//
// The RSN analog, deterministic at inference: for a named-but-unlocated
// file, rank candidate locations from a bounded filename index plus repo
// layout priors. The FULL distribution is retained (the paper's top-1
// ranked first only 47% of the time — collapsing discards exactly the
// information that pays), and zero-hit searches prune support the way a
// searched room leaves the belief. An optional semantic scorer seam takes
// RAG-embedding scores when a caller has a collection warmed up; the
// deterministic sources carry the pre-registered claims.

import { readdirSync } from 'fs'
import { relative, resolve, sep } from 'path'
import { getLastWriteAt } from './workspace-world-model'

export interface BeliefCandidate {
  /** Workspace-relative path (file match) or directory scope. */
  path: string
  weight: number
}

export interface LocationBelief {
  name: string
  /** Normalized, descending by weight. Never collapsed to top-1. */
  candidates: BeliefCandidate[]
}

/** Optional semantic scorer: path → similarity in [0, 1]. */
export type SemanticScorer = (name: string, paths: string[]) => Map<string, number>

const WALK_DIR_SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.cache', 'coverage'])
const WALK_ENTRY_CAP = 20_000
const MAX_CANDIDATES = 8

// Layout priors: where code files usually live, by top segment.
const DIR_PRIORS: Record<string, number> = {
  src: 1.0,
  electron: 1.0,
  lib: 0.9,
  app: 0.9,
  packages: 0.8,
  server: 0.8,
  scripts: 0.6,
  test: 0.5,
  tests: 0.5,
  docs: 0.3
}

interface IndexEntry {
  rel: string
  base: string
  baseLower: string
}

interface CachedIndex {
  builtAtWrite: number | null
  entries: IndexEntry[]
}

const indexCache = new Map<string, CachedIndex>()

export function buildFileIndex(workspaceRoot: string, conversationId: string): IndexEntry[] {
  const key = `${conversationId}::${workspaceRoot}`
  const lastWrite = getLastWriteAt(conversationId)
  const cached = indexCache.get(key)
  if (cached && cached.builtAtWrite === lastWrite) return cached.entries

  const rootAbs = resolve(workspaceRoot)
  const entries: IndexEntry[] = []
  const queue: string[] = [rootAbs]
  let seen = 0
  while (queue.length > 0 && seen < WALK_ENTRY_CAP) {
    const dir = queue.shift()!
    let dirents
    try {
      dirents = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of dirents) {
      if (++seen > WALK_ENTRY_CAP) break
      const full = resolve(dir, e.name)
      if (e.isDirectory()) {
        if (!WALK_DIR_SKIP.has(e.name) && !e.name.startsWith('.')) queue.push(full)
      } else {
        const rel = relative(rootAbs, full).split(sep).join('/')
        entries.push({ rel, base: e.name, baseLower: e.name.toLowerCase() })
      }
    }
  }
  indexCache.set(key, { builtAtWrite: lastWrite, entries })
  return entries
}

function priorFor(rel: string): number {
  const top = rel.split('/')[0]
  return DIR_PRIORS[top] ?? 0.4
}

function normalizeName(name: string): { baseLower: string; stemLower: string } {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '')
  return { baseLower: base.toLowerCase(), stemLower: stem.toLowerCase() }
}

/**
 * Build the belief for a name. Weights: exact basename 3.0, stem match
 * 1.5, containment 0.6 — each multiplied by the layout prior and any
 * semantic score, then normalized over the retained candidates.
 */
export function buildLocationBelief(
  workspaceRoot: string,
  conversationId: string,
  name: string,
  opts: { semanticScorer?: SemanticScorer } = {}
): LocationBelief {
  const { baseLower, stemLower } = normalizeName(name)
  const index = buildFileIndex(workspaceRoot, conversationId)
  const scored: BeliefCandidate[] = []
  for (const entry of index) {
    let match = 0
    if (entry.baseLower === baseLower) match = 3.0
    else if (stemLower.length >= 3 && entry.baseLower.replace(/\.[a-z0-9]+$/, '') === stemLower) match = 1.5
    else if (stemLower.length >= 4 && entry.baseLower.includes(stemLower)) match = 0.6
    if (match === 0) continue
    scored.push({ path: entry.rel, weight: match * priorFor(entry.rel) })
  }
  scored.sort((a, b) => b.weight - a.weight)
  let candidates = scored.slice(0, MAX_CANDIDATES)

  if (opts.semanticScorer && candidates.length > 1) {
    const scores = opts.semanticScorer(name, candidates.map((c) => c.path))
    candidates = candidates.map((c) => ({
      ...c,
      weight: c.weight * (0.5 + (scores.get(c.path) ?? 0.5))
    }))
    candidates.sort((a, b) => b.weight - a.weight)
  }

  return { name, candidates: normalize(candidates) }
}

function normalize(candidates: BeliefCandidate[]): BeliefCandidate[] {
  const total = candidates.reduce((n, c) => n + c.weight, 0)
  if (total <= 0) return candidates
  return candidates.map((c) => ({ ...c, weight: c.weight / total }))
}

/**
 * Prune support: candidates under scopes that zero-hit searches covered
 * drop out (the searched-room rule), and the rest renormalize. The
 * distribution survives — never collapsed to its head.
 */
export function pruneBelief(belief: LocationBelief, zeroHitScopes: string[]): LocationBelief {
  if (zeroHitScopes.length === 0) return belief
  const kept = belief.candidates.filter(
    (c) => !zeroHitScopes.some((scope) => scope !== '' && c.path.startsWith(scope.replace(/\/+$/, '') + '/'))
  )
  if (kept.length === 0) return belief // pruning everything means the beliefs were wrong, not the file gone
  return { name: belief.name, candidates: normalize(kept) }
}

/** Compact evidence line for verdicts: "closest candidates: a, b, c". */
export function beliefEvidence(belief: LocationBelief, cap = 3): string {
  if (belief.candidates.length === 0) return ''
  const names = belief.candidates.slice(0, cap).map((c) => c.path)
  return `Closest existing candidates: ${names.join(', ')}.`
}

/** Test-only reset. */
export function __resetLocationBeliefCacheForTesting(): void {
  indexCache.clear()
}
