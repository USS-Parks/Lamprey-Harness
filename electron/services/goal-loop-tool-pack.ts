import { bindAutomationToGoal, createGoalOwnedLoop } from './goal-automation-loop-bridge'
import { toolRegistry } from './tool-registry'
import type { LoopMode } from './loop-store'

function textArg(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`goal loop bridge: "${field}" must be a non-empty string.`)
  }
  return value.trim()
}

function capArg(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`goal loop bridge: "${field}" must be a non-negative integer or null.`)
  }
  return value
}

const ceilingProperties = {
  max_iterations: { type: ['integer', 'null'], minimum: 0 },
  max_wallclock_ms: { type: ['integer', 'null'], minimum: 0 },
  token_budget: { type: ['integer', 'null'], minimum: 0 }
} as const

toolRegistry.registerNative(
  {
    id: 'goal_bind_loop',
    name: 'goal_bind_loop',
    title: 'Bind goal to recurring loop',
    description:
      'Create one governed recurring loop owned by an existing goal. Global loop policy remains the outer gate and all supplied ceilings can only tighten it.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        goal_id: { type: 'string' },
        mode: { type: 'string', enum: ['interval', 'self_paced', 'autonomous'] },
        instruction: { type: ['string', 'null'] },
        model: { type: ['string', 'null'] },
        interval_seconds: { type: ['integer', 'null'], minimum: 0 },
        tasks: { type: 'array', items: { type: 'string' } },
        ...ceilingProperties
      },
      required: ['goal_id', 'mode'],
      additionalProperties: false
    },
    risks: ['write', 'network'],
    requiresApproval: true,
    enabled: true,
    lazy: true
  },
  async (args, ctx) => {
    if (!ctx.conversationId) throw new Error('goal_bind_loop requires an active conversation.')
    const mode = String(args.mode) as LoopMode
    if (!['interval', 'self_paced', 'autonomous'].includes(mode)) {
      throw new Error('goal_bind_loop: invalid mode.')
    }
    return JSON.stringify(
      createGoalOwnedLoop({
        conversationId: ctx.conversationId,
        goalId: textArg(args.goal_id, 'goal_id'),
        mode,
        instruction: typeof args.instruction === 'string' ? args.instruction : null,
        model: typeof args.model === 'string' ? args.model : null,
        intervalSeconds: capArg(args.interval_seconds, 'interval_seconds'),
        tasks: Array.isArray(args.tasks) ? args.tasks.map(String) : undefined,
        maxIterations: capArg(args.max_iterations, 'max_iterations'),
        maxWallclockMs: capArg(args.max_wallclock_ms, 'max_wallclock_ms'),
        tokenBudget: capArg(args.token_budget, 'token_budget')
      })
    )
  }
)

toolRegistry.registerNative(
  {
    id: 'automation_bind_goal',
    name: 'automation_bind_goal',
    title: 'Bind automation to goal',
    description:
      'Bind an existing automation to a goal-owned loop. Future trigger runs wake that loop through its normal controller instead of starting a second execution path.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        automation_id: { type: 'string' },
        goal_id: { type: 'string' },
        ...ceilingProperties
      },
      required: ['automation_id', 'goal_id'],
      additionalProperties: false
    },
    risks: ['write'],
    requiresApproval: true,
    enabled: true,
    lazy: true
  },
  async (args, ctx) => {
    if (!ctx.conversationId) throw new Error('automation_bind_goal requires an active conversation.')
    return JSON.stringify(
      bindAutomationToGoal({
        automationId: textArg(args.automation_id, 'automation_id'),
        conversationId: ctx.conversationId,
        goalId: textArg(args.goal_id, 'goal_id'),
        maxIterations: capArg(args.max_iterations, 'max_iterations'),
        maxWallclockMs: capArg(args.max_wallclock_ms, 'max_wallclock_ms'),
        tokenBudget: capArg(args.token_budget, 'token_budget')
      })
    )
  }
)
