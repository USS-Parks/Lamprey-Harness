import { randomUUID } from 'crypto'
import {
  clearAllPlanGoalState,
  clearConversation as persistClearConversation,
  listAllPlanGoalState,
  loadGoals,
  loadPlanSteps,
  removeGoal,
  savePlanSteps,
  upsertGoal,
  __resetPlanGoalPersistence,
  type ConversationPlanGoalState
} from './plan-goal-persistence'
import { applyGoalLoopTransition } from './goal-loop-transition-runtime'
import { readLoopConfig } from './loop-config'

// Per-conversation plan + goal state for the `update_plan`, `get_goal`,
// `create_goal`, and `update_goal` native tools.
//
// Durability: this module is a per-session cache in front of
// plan-goal-persistence, which writes through to two SQLite tables
// (`plan_steps`, `goals`). State is hydrated from disk on the first access to a
// conversation and survives Lamprey restarts. If persistence is unavailable
// (headless tests, disk failure) the persistence layer transparently falls back
// to memory, so this cache still works for the session — same fallback contract
// as permissions-store.
//
// Conversation id is optional everywhere: missing/undefined ids map to a
// shared GLOBAL_KEY bucket so a tool run without a conversation context
// still works.

const GLOBAL_KEY = '__global__'

export type PlanStepStatus = 'pending' | 'in_progress' | 'done'

export interface PlanStep {
  id: string
  text: string
  status: PlanStepStatus
}

export type GoalStatus = 'open' | 'in_progress' | 'done' | 'abandoned'
export type GoalLifecycleStatus = 'open' | 'active' | 'paused' | 'blocked' | 'completed' | 'aborted'
export type GoalActor = 'user' | 'system' | 'model'
export type GoalAction =
  | 'edit'
  | 'start'
  | 'pause'
  | 'resume'
  | 'block'
  | 'complete'
  | 'abort'
  | 'clear'
  | 'record_usage'

export interface Goal {
  id: string
  title: string
  description?: string
  dueDate?: string
  status: GoalStatus
  lifecycleStatus: GoalLifecycleStatus
  lastActor: GoalActor
  tokenBudget: number | null
  tokenUsed: number
  timeBudgetMs: number | null
  elapsedMs: number
  activeSince: number | null
  pausedAt: number | null
  completedAt: number | null
  abortedAt: number | null
  blocker: string | null
  completion: string | null
  transitionReason: string | null
  loopId: string | null
  loopMaxIterations: number | null
  loopMaxWallclockMs: number | null
  loopTokenBudget: number | null
  createdAt: number
  updatedAt: number
}

interface ConversationState {
  planSteps: PlanStep[]
  goals: Map<string, Goal>
}

const state = new Map<string, ConversationState>()

// Strictly-monotonic timestamp source for createdAt / updatedAt. Date.now()
// can return the same value across back-to-back calls — on Windows the
// system clock resolution is ~15 ms and even setTimeout(0) often does not
// advance it within the same tick. We need the timestamps to be a faithful
// total order so listGoals() can sort by "most recently updated" deterministically.
let __monoCursor = 0
function monoNow(): number {
  const t = Date.now()
  __monoCursor = t > __monoCursor ? t : __monoCursor + 1
  return __monoCursor
}

function keyOf(conversationId: string | undefined): string {
  return conversationId ?? GLOBAL_KEY
}

function getState(conversationId: string | undefined): ConversationState {
  const key = keyOf(conversationId)
  let s = state.get(key)
  if (!s) {
    // First access this session — hydrate from persistence. Returns empty when
    // nothing was stored (or when persistence is unavailable).
    const goals = new Map<string, Goal>()
    for (const g of loadGoals(key)) goals.set(g.id, g)
    s = { planSteps: loadPlanSteps(key), goals }
    state.set(key, s)
  }
  return s
}

// ───────────────────── Plan steps ─────────────────────

export interface UpdatePlanInput {
  // text is optional at the type level because the executor's update path
  // accepts a status-only patch and preserves the prior text. The model-
  // facing JSON schema (native-dev-tool-pack.ts) still requires text for
  // append calls; this only relaxes the TS shape for in-process callers.
  steps: Array<{ id?: string; text?: string; status?: PlanStepStatus }>
  replace?: boolean
}

export interface PlanSnapshot {
  conversationId: string
  steps: PlanStep[]
  totals: { pending: number; in_progress: number; done: number; total: number }
}

/**
 * Apply an update_plan call. When `replace` is true, the existing plan is
 * wiped and the incoming steps become the whole plan. Otherwise the steps
 * are merged: any incoming step whose `id` matches an existing step updates
 * that step (text + status); incoming steps without an `id` (or with an id
 * that doesn't match) are appended as new steps.
 */
export function applyUpdatePlan(
  conversationId: string | undefined,
  input: UpdatePlanInput
): PlanSnapshot {
  const s = getState(conversationId)
  const incoming = Array.isArray(input?.steps) ? input.steps : []

  if (input?.replace) {
    s.planSteps = incoming.map((step) => ({
      id: step.id && step.id.length > 0 ? step.id : randomUUID(),
      text: String(step.text ?? ''),
      status: step.status ?? 'pending'
    }))
    savePlanSteps(keyOf(conversationId), s.planSteps)
    return planSnapshot(conversationId, s)
  }

  for (const step of incoming) {
    const targetId = step.id && step.id.length > 0 ? step.id : null
    const existingIdx = targetId
      ? s.planSteps.findIndex((p) => p.id === targetId)
      : -1
    if (existingIdx >= 0) {
      const prev = s.planSteps[existingIdx]
      s.planSteps[existingIdx] = {
        id: prev.id,
        text: step.text != null ? String(step.text) : prev.text,
        status: step.status ?? prev.status
      }
    } else {
      s.planSteps.push({
        id: targetId ?? randomUUID(),
        text: String(step.text ?? ''),
        status: step.status ?? 'pending'
      })
    }
  }

  savePlanSteps(keyOf(conversationId), s.planSteps)
  return planSnapshot(conversationId, s)
}

function planSnapshot(
  conversationId: string | undefined,
  s: ConversationState
): PlanSnapshot {
  const totals = { pending: 0, in_progress: 0, done: 0, total: s.planSteps.length }
  for (const step of s.planSteps) totals[step.status] += 1
  return {
    conversationId: conversationId ?? GLOBAL_KEY,
    steps: s.planSteps.map((p) => ({ ...p })),
    totals
  }
}

/** Public read of the current plan for `conversationId`. Returns an empty
 * snapshot when nothing has been recorded yet so renderer code doesn't have
 * to branch on "no plan vs empty plan". */
export function getPlanSnapshot(conversationId: string | undefined): PlanSnapshot {
  return planSnapshot(conversationId, getState(conversationId))
}

// ───────────────────── Goals ─────────────────────

export interface CreateGoalInput {
  title: string
  description?: string
  dueDate?: string
  tokenBudget?: number | null
  timeBudgetMs?: number | null
  actor?: GoalActor
}

export interface UpdateGoalInput {
  goalId: string
  title?: string
  description?: string
  dueDate?: string
  status?: GoalStatus
  tokenBudget?: number | null
  timeBudgetMs?: number | null
  actor?: GoalActor
  reason?: string
  completion?: string
}

export interface GoalTransitionInput {
  goalId: string
  action: GoalAction
  actor: GoalActor
  reason?: string
  title?: string
  description?: string
  dueDate?: string
  blocker?: string
  completion?: string
  tokensUsed?: number
  elapsedMs?: number
  tokenBudget?: number | null
  timeBudgetMs?: number | null
  now?: number
}

function nonNegativeInteger(value: number | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`update_goal: "${field}" must be a non-negative integer or null.`)
  }
  return value
}

function legacyStatus(status: GoalLifecycleStatus): GoalStatus {
  if (status === 'active') return 'in_progress'
  if (status === 'completed') return 'done'
  if (status === 'aborted') return 'abandoned'
  return 'open'
}

function accrueActiveTime(goal: Goal, now: number): void {
  if (goal.lifecycleStatus === 'active' && goal.activeSince !== null) {
    goal.elapsedMs += Math.max(0, now - goal.activeSince)
    goal.activeSince = null
  }
}

function publicGoal(goal: Goal, now = Date.now()): Goal {
  return {
    ...goal,
    elapsedMs:
      goal.elapsedMs +
      (goal.lifecycleStatus === 'active' && goal.activeSince !== null
        ? Math.max(0, now - goal.activeSince)
        : 0)
  }
}

function assertNonTerminal(goal: Goal, action: GoalAction): void {
  if (goal.lifecycleStatus === 'completed' || goal.lifecycleStatus === 'aborted') {
    throw new Error(`update_goal: cannot ${action} a ${goal.lifecycleStatus} goal.`)
  }
}

function applyBudgetBlock(goal: Goal, now: number): boolean {
  const tokenExhausted = goal.tokenBudget !== null && goal.tokenUsed >= goal.tokenBudget
  const timeExhausted = goal.timeBudgetMs !== null && goal.elapsedMs >= goal.timeBudgetMs
  if (!tokenExhausted && !timeExhausted) return false
  accrueActiveTime(goal, now)
  goal.lifecycleStatus = 'blocked'
  goal.status = 'open'
  goal.blocker = tokenExhausted ? 'token-budget-exhausted' : 'time-budget-exhausted'
  goal.lastActor = 'system'
  goal.transitionReason = goal.blocker
  return true
}

export function createGoal(
  conversationId: string | undefined,
  input: CreateGoalInput
): Goal {
  const s = getState(conversationId)
  const now = monoNow()
  const goal: Goal = {
    id: randomUUID(),
    title: String(input.title ?? '').trim(),
    description: input.description,
    dueDate: input.dueDate,
    status: 'open',
    lifecycleStatus: 'open',
    lastActor: input.actor ?? 'model',
    tokenBudget: nonNegativeInteger(input.tokenBudget, 'tokenBudget'),
    tokenUsed: 0,
    timeBudgetMs: nonNegativeInteger(input.timeBudgetMs, 'timeBudgetMs'),
    elapsedMs: 0,
    activeSince: null,
    pausedAt: null,
    completedAt: null,
    abortedAt: null,
    blocker: null,
    completion: null,
    transitionReason: null,
    loopId: null,
    loopMaxIterations: null,
    loopMaxWallclockMs: null,
    loopTokenBudget: null,
    createdAt: now,
    updatedAt: now
  }
  if (!goal.title) throw new Error('create_goal: title is required')
  s.goals.set(goal.id, goal)
  upsertGoal(keyOf(conversationId), goal)
  return publicGoal(goal, now)
}

export function transitionGoal(
  conversationId: string | undefined,
  input: GoalTransitionInput
): Goal | null {
  const s = getState(conversationId)
  const goal = s.goals.get(input.goalId)
  if (!goal) throw new Error(`update_goal: no goal with id "${input.goalId}"`)
  const now = input.now ?? monoNow()
  let systemBudgetBlock = false

  if ((input.action === 'abort' || input.action === 'clear') && input.actor === 'model') {
    throw new Error(`update_goal: model authority cannot ${input.action} a goal.`)
  }
  if (
    goal.loopId &&
    (input.action === 'start' || input.action === 'resume') &&
    !readLoopConfig().enabled
  ) {
    throw new Error('update_goal: loops are disabled; the goal-owned loop cannot be started.')
  }
  if (input.action === 'clear') {
    applyGoalLoopTransition(conversationId, publicGoal(goal, now), input.action)
    s.goals.delete(goal.id)
    removeGoal(keyOf(conversationId), goal.id)
    return null
  }

  if (input.action === 'edit') {
    if (input.title !== undefined) {
      const title = String(input.title).trim()
      if (!title) throw new Error('update_goal: title is required')
      goal.title = title
    }
    if (input.description !== undefined) goal.description = input.description
    if (input.dueDate !== undefined) goal.dueDate = input.dueDate
    if (input.tokenBudget !== undefined) {
      goal.tokenBudget = nonNegativeInteger(input.tokenBudget, 'tokenBudget')
    }
    if (input.timeBudgetMs !== undefined) {
      goal.timeBudgetMs = nonNegativeInteger(input.timeBudgetMs, 'timeBudgetMs')
    }
    systemBudgetBlock = applyBudgetBlock(goal, now)
  } else if (input.action === 'start') {
    if (goal.lifecycleStatus !== 'open') {
      throw new Error(`update_goal: start requires open status, got ${goal.lifecycleStatus}.`)
    }
    goal.lifecycleStatus = 'active'
    goal.activeSince = now
    goal.pausedAt = null
  } else if (input.action === 'pause') {
    if (goal.lifecycleStatus !== 'active') {
      throw new Error(`update_goal: pause requires active status, got ${goal.lifecycleStatus}.`)
    }
    accrueActiveTime(goal, now)
    goal.lifecycleStatus = 'paused'
    goal.pausedAt = now
  } else if (input.action === 'resume') {
    if (goal.lifecycleStatus !== 'paused' && goal.lifecycleStatus !== 'blocked') {
      throw new Error(`update_goal: resume requires paused or blocked status, got ${goal.lifecycleStatus}.`)
    }
    goal.lifecycleStatus = 'active'
    goal.activeSince = now
    goal.pausedAt = null
    goal.blocker = null
  } else if (input.action === 'block') {
    assertNonTerminal(goal, input.action)
    const blocker = String(input.blocker ?? '').trim()
    if (!blocker) throw new Error('update_goal: blocker is required for action=block.')
    accrueActiveTime(goal, now)
    goal.lifecycleStatus = 'blocked'
    goal.blocker = blocker
  } else if (input.action === 'complete') {
    assertNonTerminal(goal, input.action)
    const completion = String(input.completion ?? '').trim()
    if (!completion) throw new Error('update_goal: completion is required for action=complete.')
    accrueActiveTime(goal, now)
    goal.lifecycleStatus = 'completed'
    goal.completedAt = now
    goal.completion = completion
    goal.blocker = null
  } else if (input.action === 'abort') {
    assertNonTerminal(goal, input.action)
    accrueActiveTime(goal, now)
    goal.lifecycleStatus = 'aborted'
    goal.abortedAt = now
  } else if (input.action === 'record_usage') {
    assertNonTerminal(goal, input.action)
    const tokens = nonNegativeInteger(input.tokensUsed, 'tokensUsed') ?? 0
    const elapsed = nonNegativeInteger(input.elapsedMs, 'elapsedMs') ?? 0
    accrueActiveTime(goal, now)
    goal.tokenUsed += tokens
    goal.elapsedMs += elapsed
    if (goal.lifecycleStatus === 'active') goal.activeSince = now
    systemBudgetBlock = applyBudgetBlock(goal, now)
  }

  goal.status = legacyStatus(goal.lifecycleStatus)
  if (!systemBudgetBlock) {
    goal.lastActor = input.actor
    goal.transitionReason = input.reason?.trim() || goal.transitionReason
  }
  goal.updatedAt = now
  applyGoalLoopTransition(conversationId, publicGoal(goal, now), input.action)
  s.goals.set(goal.id, goal)
  upsertGoal(keyOf(conversationId), goal)
  return publicGoal(goal, now)
}

export function bindGoalLoop(
  conversationId: string | undefined,
  goalId: string,
  binding: {
    loopId: string
    maxIterations: number | null
    maxWallclockMs: number | null
    tokenBudget: number | null
  }
): Goal {
  const s = getState(conversationId)
  const goal = s.goals.get(goalId)
  if (!goal) throw new Error(`goal loop bridge: no goal with id "${goalId}"`)
  if (goal.loopId && goal.loopId !== binding.loopId) {
    throw new Error(`goal loop bridge: goal already owns loop "${goal.loopId}".`)
  }
  goal.loopId = binding.loopId
  goal.loopMaxIterations = binding.maxIterations
  goal.loopMaxWallclockMs = binding.maxWallclockMs
  goal.loopTokenBudget = binding.tokenBudget
  goal.lastActor = 'system'
  goal.transitionReason = 'loop-bound'
  goal.updatedAt = monoNow()
  s.goals.set(goal.id, goal)
  upsertGoal(keyOf(conversationId), goal)
  return publicGoal(goal)
}

export function updateGoal(
  conversationId: string | undefined,
  input: UpdateGoalInput
): Goal {
  const actor = input.actor ?? 'model'
  let goal = transitionGoal(conversationId, {
    goalId: input.goalId,
    action: 'edit',
    actor,
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    tokenBudget: input.tokenBudget,
    timeBudgetMs: input.timeBudgetMs,
    reason: input.reason
  })!
  if (input.status === 'in_progress' && goal.lifecycleStatus !== 'active') {
    goal = transitionGoal(conversationId, {
      goalId: input.goalId,
      action: goal.lifecycleStatus === 'open' ? 'start' : 'resume',
      actor,
      reason: input.reason
    })!
  } else if (input.status === 'done' && goal.lifecycleStatus !== 'completed') {
    goal = transitionGoal(conversationId, {
      goalId: input.goalId,
      action: 'complete',
      actor,
      completion: input.completion ?? 'Marked done.',
      reason: input.reason
    })!
  } else if (input.status === 'abandoned' && goal.lifecycleStatus !== 'aborted') {
    goal = transitionGoal(conversationId, {
      goalId: input.goalId,
      action: 'abort',
      actor,
      reason: input.reason
    })!
  }
  return goal
}

export function getGoal(
  conversationId: string | undefined,
  goalId: string
): Goal | null {
  const s = getState(conversationId)
  const goal = s.goals.get(goalId)
  return goal ? publicGoal(goal) : null
}

export function listGoals(conversationId: string | undefined): Goal[] {
  const s = getState(conversationId)
  return Array.from(s.goals.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((goal) => publicGoal(goal))
}

/** Every conversation with plan or goal state, for the inspect/clear UI.
 * Reads through persistence (the authoritative store — writes are write-through),
 * so it reflects conversations not loaded into the session cache. */
export function getAllPlanGoalState(): ConversationPlanGoalState[] {
  return listAllPlanGoalState()
}

/** Drop all plan + goal state for one conversation, in cache and on disk.
 * Call when a conversation is deleted so its rows don't linger. */
export function clearConversationState(conversationId: string | undefined): void {
  const key = keyOf(conversationId)
  state.delete(key)
  persistClearConversation(key)
}

/** Drop every conversation's plan + goal state (cache + disk). */
export function clearAllState(): void {
  state.clear()
  clearAllPlanGoalState()
}

/** Test-only: reset all per-conversation state (cache + persistence). */
export function __resetPlanGoalStore(): void {
  state.clear()
  __monoCursor = 0
  __resetPlanGoalPersistence()
}

/** Test-only: drop the per-session cache without touching persistence, to
 * simulate an app restart that must rehydrate plan + goal state from disk. */
export function __dropPlanGoalCache(): void {
  state.clear()
  __monoCursor = 0
}
