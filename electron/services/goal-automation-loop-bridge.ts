import { getAutomation, updateAutomation, type Automation } from './automations-store'
import { abortLoopIteration } from './loop-controller'
import { readLoopConfig, type LoopConfig } from './loop-config'
import {
  createLoop,
  enqueueBacklog,
  getLoop,
  updateLoop,
  type Loop,
  type LoopMode
} from './loop-store'
import { setGoalLoopTransitionHandler } from './goal-loop-transition-runtime'
import { bindGoalLoop, getGoal, transitionGoal, type Goal } from './plan-goal-store'

export interface LoopCeilings {
  maxIterations: number | null
  maxWallclockMs: number | null
  tokenBudget: number | null
}

type CeilingInput = Partial<LoopCeilings> | null | undefined

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function tightest(...values: unknown[]): number | null {
  const caps = values.map(positiveInteger).filter((value): value is number => value !== null)
  return caps.length ? Math.min(...caps) : null
}

/** Global policy is always included. Goal and automation caps may only tighten it. */
export function composeLoopCeilings(
  global: Pick<LoopConfig, 'maxIterations' | 'maxWallclockMs' | 'tokenBudget'>,
  goal?: CeilingInput,
  automation?: CeilingInput
): LoopCeilings {
  return {
    maxIterations: tightest(global.maxIterations, goal?.maxIterations, automation?.maxIterations),
    maxWallclockMs: tightest(global.maxWallclockMs, goal?.maxWallclockMs, automation?.maxWallclockMs),
    tokenBudget: tightest(global.tokenBudget, goal?.tokenBudget, automation?.tokenBudget)
  }
}

function requireLoopsEnabled(): LoopConfig {
  const config = readLoopConfig()
  if (!config.enabled) throw new Error('goal loop bridge: loops are disabled.')
  return config
}

function goalCeilings(goal: Goal): LoopCeilings {
  return {
    maxIterations: goal.loopMaxIterations,
    maxWallclockMs: goal.loopMaxWallclockMs,
    tokenBudget: goal.loopTokenBudget
  }
}

function automationCeilings(automation: Automation): LoopCeilings {
  return {
    maxIterations: automation.loopMaxIterations,
    maxWallclockMs: automation.loopMaxWallclockMs,
    tokenBudget: automation.loopTokenBudget
  }
}

export function createGoalOwnedLoop(input: {
  conversationId: string
  goalId: string
  mode: LoopMode
  instruction?: string | null
  model?: string | null
  intervalSeconds?: number | null
  tasks?: string[]
  maxIterations?: number | null
  maxWallclockMs?: number | null
  tokenBudget?: number | null
}): { goal: Goal; loop: Loop } {
  const config = requireLoopsEnabled()
  const goal = getGoal(input.conversationId, input.goalId)
  if (!goal) throw new Error(`goal loop bridge: no goal with id "${input.goalId}".`)
  if (goal.lifecycleStatus === 'completed' || goal.lifecycleStatus === 'aborted') {
    throw new Error(`goal loop bridge: cannot bind a ${goal.lifecycleStatus} goal.`)
  }
  if (goal.loopId) throw new Error(`goal loop bridge: goal already owns loop "${goal.loopId}".`)

  const ceilings = composeLoopCeilings(config, {
    maxIterations: input.maxIterations,
    maxWallclockMs: input.maxWallclockMs,
    tokenBudget: input.tokenBudget
  })
  const loop = createLoop({
    conversationId: input.conversationId,
    mode: input.mode,
    instruction: input.instruction?.trim() || goal.description || goal.title,
    model: input.model,
    intervalSeconds: input.intervalSeconds,
    ...ceilings
  })
  const tasks = (input.tasks ?? [goal.title]).map((task) => task.trim()).filter(Boolean)
  if (tasks.length) enqueueBacklog(loop.id, tasks)
  let bound = bindGoalLoop(input.conversationId, goal.id, { loopId: loop.id, ...ceilings })
  if (bound.lifecycleStatus === 'open') {
    bound = transitionGoal(input.conversationId, {
      goalId: bound.id,
      action: 'start',
      actor: 'system',
      reason: 'goal-owned-loop-started'
    })!
  }
  return { goal: bound, loop: getLoop(loop.id) ?? loop }
}

export function bindAutomationToGoal(input: {
  automationId: string
  conversationId: string
  goalId: string
  maxIterations?: number | null
  maxWallclockMs?: number | null
  tokenBudget?: number | null
}): { automation: Automation; goal: Goal; loop: Loop } {
  const config = requireLoopsEnabled()
  const automation = getAutomation(input.automationId)
  if (!automation) throw new Error(`goal loop bridge: no automation with id "${input.automationId}".`)
  const goal = getGoal(input.conversationId, input.goalId)
  if (!goal?.loopId) throw new Error('goal loop bridge: the goal does not own a loop.')
  const loop = getLoop(goal.loopId)
  if (!loop) throw new Error(`goal loop bridge: no loop with id "${goal.loopId}".`)

  const requested = {
    maxIterations: input.maxIterations,
    maxWallclockMs: input.maxWallclockMs,
    tokenBudget: input.tokenBudget
  }
  const ceilings = composeLoopCeilings(
    config,
    {
      maxIterations: loop.maxIterations,
      maxWallclockMs: loop.maxWallclockMs,
      tokenBudget: loop.tokenBudget
    },
    requested
  )
  const tightened = updateLoop(loop.id, ceilings)
  const bound = updateAutomation(automation.id, {
    goalId: goal.id,
    goalConversationId: input.conversationId,
    loopMaxIterations: positiveInteger(input.maxIterations),
    loopMaxWallclockMs: positiveInteger(input.maxWallclockMs),
    loopTokenBudget: positiveInteger(input.tokenBudget)
  })
  if (!tightened || !bound) throw new Error('goal loop bridge: binding could not be persisted.')
  return { automation: bound, goal, loop: tightened }
}

/** An automation wake never calls a provider directly; it makes the owned loop due. */
export function wakeGoalFromAutomation(automation: Automation): {
  goalId: string
  loopId: string
  nextFireAt: number
  ceilings: LoopCeilings
} {
  const config = requireLoopsEnabled()
  if (!automation.goalId || !automation.goalConversationId) {
    throw new Error('goal loop bridge: automation is not bound to a goal.')
  }
  const goal = getGoal(automation.goalConversationId, automation.goalId)
  if (!goal?.loopId) throw new Error('goal loop bridge: bound goal has no owned loop.')
  if (goal.lifecycleStatus !== 'active') {
    throw new Error(`goal loop bridge: bound goal is ${goal.lifecycleStatus}; wake refused.`)
  }
  const loop = getLoop(goal.loopId)
  if (!loop) throw new Error(`goal loop bridge: no loop with id "${goal.loopId}".`)
  const ceilings = composeLoopCeilings(config, goalCeilings(goal), automationCeilings(automation))
  const nextFireAt = Date.now()
  const updated = updateLoop(loop.id, { ...ceilings, status: 'running', nextFireAt, stopReason: null })
  if (!updated) throw new Error('goal loop bridge: loop wake could not be persisted.')
  return { goalId: goal.id, loopId: loop.id, nextFireAt, ceilings }
}

setGoalLoopTransitionHandler((_conversationId, goal, action) => {
  if (!goal.loopId) return
  const loop = getLoop(goal.loopId)
  if (!loop) return
  if (action === 'clear') {
    abortLoopIteration(loop.id)
    updateLoop(loop.id, { status: 'stopped', nextFireAt: null, stopReason: 'goal-cleared' })
    return
  }
  if (goal.lifecycleStatus === 'active') {
    if (!readLoopConfig().enabled) throw new Error('goal loop bridge: loops are disabled.')
    updateLoop(loop.id, { status: 'running', nextFireAt: Date.now(), stopReason: null })
    return
  }
  abortLoopIteration(loop.id)
  if (goal.lifecycleStatus === 'paused' || goal.lifecycleStatus === 'blocked') {
    updateLoop(loop.id, {
      status: 'paused',
      nextFireAt: null,
      stopReason: goal.blocker ?? `goal-${goal.lifecycleStatus}`
    })
  } else if (goal.lifecycleStatus === 'completed') {
    updateLoop(loop.id, { status: 'done', nextFireAt: null, stopReason: 'goal-completed' })
  } else if (goal.lifecycleStatus === 'aborted') {
    updateLoop(loop.id, { status: 'stopped', nextFireAt: null, stopReason: 'goal-aborted' })
  }
})
