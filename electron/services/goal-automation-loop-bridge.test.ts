import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: true,
  handler: null as null | ((conversationId: string | undefined, goal: any, action: string) => void),
  abort: vi.fn(),
  createLoop: vi.fn(),
  enqueue: vi.fn(),
  getLoop: vi.fn(),
  updateLoop: vi.fn(),
  getGoal: vi.fn(),
  bindGoal: vi.fn(),
  transitionGoal: vi.fn(),
  getAutomation: vi.fn(),
  updateAutomation: vi.fn()
}))

vi.mock('./loop-config', () => ({
  readLoopConfig: () => ({
    enabled: mocks.enabled,
    maxIterations: 25,
    maxWallclockMs: 1_800_000,
    tokenBudget: 500_000,
    maxConcurrent: 1,
    minIntervalSeconds: 30
  })
}))
vi.mock('./loop-controller', () => ({ abortLoopIteration: mocks.abort }))
vi.mock('./loop-store', () => ({
  createLoop: mocks.createLoop,
  enqueueBacklog: mocks.enqueue,
  getLoop: mocks.getLoop,
  updateLoop: mocks.updateLoop
}))
vi.mock('./plan-goal-store', () => ({
  getGoal: mocks.getGoal,
  bindGoalLoop: mocks.bindGoal,
  transitionGoal: mocks.transitionGoal
}))
vi.mock('./automations-store', () => ({
  getAutomation: mocks.getAutomation,
  updateAutomation: mocks.updateAutomation
}))
vi.mock('./goal-loop-transition-runtime', () => ({
  setGoalLoopTransitionHandler: (handler: typeof mocks.handler) => { mocks.handler = handler }
}))

import {
  bindAutomationToGoal,
  composeLoopCeilings,
  createGoalOwnedLoop,
  wakeGoalFromAutomation
} from './goal-automation-loop-bridge'

const loop = {
  id: 'loop-1', conversationId: 'c1', mode: 'autonomous', status: 'running',
  maxIterations: 20, maxWallclockMs: 900_000, tokenBudget: 300_000
}
const goal = {
  id: 'goal-1', title: 'Ship it', description: 'Finish safely', lifecycleStatus: 'active',
  loopId: 'loop-1', loopMaxIterations: 15, loopMaxWallclockMs: 800_000,
  loopTokenBudget: 250_000, blocker: null
}
const automation = {
  id: 'automation-1', goalId: 'goal-1', goalConversationId: 'c1',
  loopMaxIterations: 12, loopMaxWallclockMs: 700_000, loopTokenBudget: 200_000
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled = true
  mocks.getLoop.mockReturnValue(loop)
  mocks.updateLoop.mockImplementation((_id, patch) => ({ ...loop, ...patch }))
  mocks.getGoal.mockReturnValue(goal)
  mocks.getAutomation.mockReturnValue(automation)
  mocks.updateAutomation.mockImplementation((_id, patch) => ({ ...automation, ...patch }))
})

describe('GA-4 goal, automation, and loop bridge', () => {
  it('composes every positive ceiling by the tightest policy', () => {
    expect(composeLoopCeilings(
      { maxIterations: 25, maxWallclockMs: 1_800_000, tokenBudget: 500_000 },
      { maxIterations: 10, maxWallclockMs: 0, tokenBudget: 300_000 },
      { maxIterations: 20, maxWallclockMs: 600_000, tokenBudget: null }
    )).toEqual({ maxIterations: 10, maxWallclockMs: 600_000, tokenBudget: 300_000 })
  })

  it('refuses every autonomous entry point while loops are disabled', () => {
    mocks.enabled = false
    expect(() => createGoalOwnedLoop({ conversationId: 'c1', goalId: 'goal-1', mode: 'autonomous' }))
      .toThrow(/loops are disabled/i)
    expect(() => bindAutomationToGoal({ automationId: 'automation-1', conversationId: 'c1', goalId: 'goal-1' }))
      .toThrow(/loops are disabled/i)
    expect(() => wakeGoalFromAutomation(automation as any)).toThrow(/loops are disabled/i)
  })

  it('creates one goal-owned loop through the existing loop store', () => {
    mocks.getGoal.mockReturnValueOnce({ ...goal, lifecycleStatus: 'open', loopId: null })
    mocks.createLoop.mockReturnValue(loop)
    mocks.bindGoal.mockReturnValue({ ...goal, lifecycleStatus: 'open' })
    mocks.transitionGoal.mockReturnValue(goal)
    const result = createGoalOwnedLoop({
      conversationId: 'c1', goalId: 'goal-1', mode: 'autonomous', tasks: ['A', 'B'],
      maxIterations: 10
    })
    expect(mocks.createLoop).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'c1', mode: 'autonomous', maxIterations: 10
    }))
    expect(mocks.enqueue).toHaveBeenCalledWith('loop-1', ['A', 'B'])
    expect(mocks.bindGoal).toHaveBeenCalledWith('c1', 'goal-1', expect.objectContaining({ loopId: 'loop-1' }))
    expect(mocks.transitionGoal).toHaveBeenCalledWith('c1', expect.objectContaining({ action: 'start', actor: 'system' }))
    expect(result.goal.lifecycleStatus).toBe('active')
  })

  it('binds an automation without allowing its caps to relax existing policy', () => {
    bindAutomationToGoal({
      automationId: 'automation-1', conversationId: 'c1', goalId: 'goal-1',
      maxIterations: 24, maxWallclockMs: 600_000, tokenBudget: 400_000
    })
    expect(mocks.updateLoop).toHaveBeenCalledWith('loop-1', {
      maxIterations: 20, maxWallclockMs: 600_000, tokenBudget: 300_000
    })
    expect(mocks.updateAutomation).toHaveBeenCalledWith('automation-1', expect.objectContaining({
      goalId: 'goal-1', goalConversationId: 'c1', loopMaxIterations: 24
    }))
  })

  it('turns an automation firing into a due loop wake, not a provider call', () => {
    const result = wakeGoalFromAutomation(automation as any)
    expect(mocks.updateLoop).toHaveBeenCalledWith('loop-1', expect.objectContaining({
      status: 'running', maxIterations: 12, maxWallclockMs: 700_000, tokenBudget: 200_000
    }))
    expect(result).toMatchObject({ goalId: 'goal-1', loopId: 'loop-1' })
  })

  it('propagates pause, abort, and clear to the owned loop and aborts in-flight work', () => {
    expect(mocks.handler).toBeTypeOf('function')
    mocks.handler!('c1', { ...goal, lifecycleStatus: 'paused' }, 'pause')
    expect(mocks.abort).toHaveBeenCalledWith('loop-1')
    expect(mocks.updateLoop).toHaveBeenLastCalledWith('loop-1', expect.objectContaining({ status: 'paused' }))
    mocks.handler!('c1', { ...goal, lifecycleStatus: 'aborted' }, 'abort')
    expect(mocks.updateLoop).toHaveBeenLastCalledWith('loop-1', expect.objectContaining({ status: 'stopped' }))
    mocks.handler!('c1', goal, 'clear')
    expect(mocks.updateLoop).toHaveBeenLastCalledWith('loop-1', expect.objectContaining({ stopReason: 'goal-cleared' }))
  })
})
