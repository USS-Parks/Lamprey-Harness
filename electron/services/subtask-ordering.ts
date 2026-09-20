// Workspace World Model Phase (WM-12) — expected cost and online reordering.
//
// Eq. 7 for the workspace: first-task costs h from belief-weighted expected
// effort (files-to-scan proxies for traversable area), pairwise transition
// costs A with a visited-scope discount (searching a directory once
// localizes everything in it), exact enumeration for N ≤ 6. The product
// lever is ordering, not dispatch: ledger entries and each follow-through
// complaint list unmet goals cheapest-first, re-ranked per round as
// observations land — information from working one subtask reprices the
// rest, the paper's online reordering. Admissibility fall-through for a
// full ordering's concatenated plan lives in the bench's multi-task
// runner, where per-subtask plans exist.

import { buildFileIndex, buildLocationBelief } from './location-beliefs'

export interface OrderableSubtask {
  id: string
  title: string
  targets: string[]
}

export interface OrderingContext {
  workspaceRoot: string
  conversationId: string
}

const LOCATED_COST = 1
const VISITED_SCOPE_DISCOUNT = 0.3
const MAX_EXACT_N = 6

function dirOf(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i === -1 ? '' : rel.slice(0, i)
}

interface EffortModel {
  dirSizes: Map<string, number>
  totalFiles: number
}

function buildEffortModel(ctx: OrderingContext): EffortModel {
  const index = buildFileIndex(ctx.workspaceRoot, ctx.conversationId)
  const dirSizes = new Map<string, number>()
  for (const e of index) {
    const d = dirOf(e.rel)
    dirSizes.set(d, (dirSizes.get(d) ?? 0) + 1)
  }
  return { dirSizes, totalFiles: index.length }
}

interface TargetEffort {
  effort: number
  /** Directories this target's belief mass lives in (top candidates). */
  scopes: string[]
}

function targetEffort(target: string, ctx: OrderingContext, model: EffortModel): TargetEffort {
  const index = buildFileIndex(ctx.workspaceRoot, ctx.conversationId)
  const normalized = target.replace(/\\/g, '/')
  if (index.some((e) => e.rel === normalized)) {
    return { effort: LOCATED_COST, scopes: [dirOf(normalized)] }
  }
  const belief = buildLocationBelief(ctx.workspaceRoot, ctx.conversationId, target)
  if (belief.candidates.length === 0) {
    return { effort: Math.max(LOCATED_COST, model.totalFiles / 2), scopes: [] }
  }
  let effort = 0
  const scopes: string[] = []
  for (const c of belief.candidates) {
    const d = dirOf(c.path)
    effort += c.weight * Math.max(1, model.dirSizes.get(d) ?? 1)
    if (scopes.length < 2) scopes.push(d)
  }
  return { effort, scopes }
}

export interface SubtaskCost {
  id: string
  effort: number
  scopes: string[]
}

export function computeSubtaskCosts(
  subtasks: OrderableSubtask[],
  ctx: OrderingContext
): Map<string, SubtaskCost> {
  const model = buildEffortModel(ctx)
  const out = new Map<string, SubtaskCost>()
  for (const s of subtasks) {
    let effort = 0
    const scopes = new Set<string>()
    for (const t of s.targets) {
      const te = targetEffort(t, ctx, model)
      effort += te.effort
      for (const sc of te.scopes) scopes.add(sc)
    }
    // A subtask naming no targets costs a flat median-ish unknown.
    if (s.targets.length === 0) effort = Math.max(LOCATED_COST, model.totalFiles / 4)
    out.set(s.id, { id: s.id, effort, scopes: [...scopes] })
  }
  return out
}

function transitionCost(from: SubtaskCost, to: SubtaskCost): number {
  if (to.scopes.length === 0 || from.scopes.length === 0) return to.effort
  const visited = new Set(from.scopes)
  const overlapping = to.scopes.filter((s) => visited.has(s)).length
  if (overlapping === 0) return to.effort
  const discount = 1 - VISITED_SCOPE_DISCOUNT * (overlapping / to.scopes.length)
  return to.effort * Math.max(VISITED_SCOPE_DISCOUNT, discount)
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([items[i], ...p])
  }
  return out
}

export interface OrderingResult {
  order: OrderableSubtask[]
  expectedCost: number
}

/**
 * Order subtasks by Eq. 7. Exact enumeration up to N = 6 (the paper's
 * regime); larger sets fall back to a greedy nearest-next construction,
 * honestly approximate and noted in the result by cost NaN-avoidance
 * rather than pretended exactness.
 */
export function orderSubtasks(
  subtasks: OrderableSubtask[],
  ctx: OrderingContext
): OrderingResult {
  if (subtasks.length <= 1) return { order: [...subtasks], expectedCost: 0 }
  const costs = computeSubtaskCosts(subtasks, ctx)
  const cost = (id: string): SubtaskCost => costs.get(id)!

  const evaluate = (order: OrderableSubtask[]): number => {
    let total = cost(order[0].id).effort
    for (let p = 1; p < order.length; p++) {
      total += transitionCost(cost(order[p - 1].id), cost(order[p].id))
    }
    return total
  }

  if (subtasks.length <= MAX_EXACT_N) {
    let best: OrderableSubtask[] | null = null
    let bestCost = Number.POSITIVE_INFINITY
    for (const perm of permutations(subtasks)) {
      const c = evaluate(perm)
      // Ties break toward the cheaper FIRST task: when the total is
      // order-independent, do the quick win first (the paper breaks belief
      // ties by shortest path the same way).
      const better =
        c < bestCost - 1e-9 ||
        (Math.abs(c - bestCost) <= 1e-9 &&
          best !== null &&
          cost(perm[0].id).effort < cost(best[0].id).effort)
      if (best === null || better) {
        bestCost = c
        best = perm
      }
    }
    return { order: best ?? subtasks, expectedCost: bestCost }
  }

  // Greedy fallback for N > 6.
  const remaining = [...subtasks]
  const order: OrderableSubtask[] = []
  remaining.sort((a, b) => cost(a.id).effort - cost(b.id).effort)
  order.push(remaining.shift()!)
  while (remaining.length > 0) {
    let bestIdx = 0
    let bestC = Number.POSITIVE_INFINITY
    for (let i = 0; i < remaining.length; i++) {
      const c = transitionCost(cost(order[order.length - 1].id), cost(remaining[i].id))
      if (c < bestC) {
        bestC = c
        bestIdx = i
      }
    }
    order.push(remaining.splice(bestIdx, 1)[0])
  }
  return { order, expectedCost: evaluate(order) }
}
