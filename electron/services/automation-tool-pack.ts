import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  listAutomationRuns,
  listAutomations,
  updateAutomation
} from './automations-store'
import { parseCron, runAutomation } from './automations-runner'
import { parseAutomationTrigger, type AutomationTrigger } from './automation-trigger'
import { toolRegistry } from './tool-registry'

function asRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`automation_update: "${field}" is required.`)
  }
  return value.trim()
}

function validateCron(cron: string): string {
  try {
    parseCron(cron)
  } catch (error) {
    throw new Error(
      `automation_update: invalid cron: ${error instanceof Error ? error.message : 'parse error'}`,
      { cause: error }
    )
  }
  return cron
}

const AUTOMATION_ID_SCHEMA = {
  automation_id: {
    type: 'string',
    description: 'Exact automation id returned by automation_list or automation_update.'
  }
} as const

const TRIGGER_SCHEMA = {
  type: 'object',
  description: 'Typed trigger configuration. Only fields relevant to the selected kind are used.',
  properties: {
    kind: { type: 'string', enum: ['one_shot', 'schedule', 'event', 'monitor'] },
    at: { type: 'number', description: 'one_shot: epoch milliseconds for the one run.' },
    cron: { type: 'string', description: 'schedule: five-field cron expression.' },
    every_seconds: { type: 'number', description: 'schedule/monitor: fixed interval, minimum 30.' },
    event_name: { type: 'string', description: 'event: exact named event to match.' },
    start_at: { type: 'number', description: 'schedule/monitor: optional epoch-ms anchor.' },
    max_attempts: { type: 'number', description: 'Bounded attempts per trigger occurrence.' },
    retry_delay_seconds: { type: 'number', description: 'Base retry delay in seconds.' }
  },
  required: ['kind'],
  additionalProperties: false
} as const

function parseToolTrigger(value: unknown): AutomationTrigger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('automation_update: "trigger" must be an object.')
  }
  const input = value as Record<string, unknown>
  return parseAutomationTrigger({
    kind: input.kind,
    at: input.at,
    cron: input.cron,
    everySeconds: input.every_seconds,
    eventName: input.event_name,
    startAt: input.start_at,
    maxAttempts: input.max_attempts,
    retryDelaySeconds: input.retry_delay_seconds
  })
}

toolRegistry.registerNative(
  {
    id: 'automation_list',
    name: 'automation_list',
    title: 'List automations',
    description:
      'List the saved automations and their latest run result. Returns only the public automation record; scheduler internals are not exposed.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: AUTOMATION_ID_SCHEMA,
      additionalProperties: false
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    lazy: true,
    mutates: false
  },
  async (args) => {
    const automationId = args.automation_id
    if (automationId === undefined) return JSON.stringify(listAutomations(), null, 2)
    if (typeof automationId !== 'string' || automationId.trim() === '') {
      throw new Error('automation_list: "automation_id" must be a non-empty string.')
    }
    const id = automationId.trim()
    return JSON.stringify(
      { automation: getAutomation(id), runs: listAutomationRuns(id) },
      null,
      2
    )
  }
)

toolRegistry.registerNative(
  {
    id: 'automation_update',
    name: 'automation_update',
    title: 'Create or update automation',
    description:
      'Create one automation when automation_id is omitted, or update one exact saved automation when it is supplied. Creation requires label, cron, and prompt. Only the declared fields are accepted.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        ...AUTOMATION_ID_SCHEMA,
        label: { type: 'string', description: 'Human-readable automation label.' },
        cron: {
          type: 'string',
          description: 'Five-field cron expression: minute hour day-of-month month day-of-week.'
        },
        prompt: { type: 'string', description: 'Prompt sent when the automation runs.' },
        model: {
          type: ['string', 'null'],
          description: 'Optional saved model id. Null restores the default automation model.'
        },
        enabled: { type: 'boolean', description: 'Whether scheduled execution is enabled.' }
        ,
        trigger: TRIGGER_SCHEMA
      },
      additionalProperties: false
    },
    risks: ['write'],
    requiresApproval: true,
    enabled: true,
    lazy: true,
    mutates: true
  },
  async (args) => {
    const automationId = args.automation_id
    if (automationId === undefined) {
      const label = asRequiredText(args.label, 'label')
      const prompt = asRequiredText(args.prompt, 'prompt')
      const model = args.model === null ? null : typeof args.model === 'string' ? args.model.trim() || null : undefined
      const trigger = args.trigger === undefined ? undefined : parseToolTrigger(args.trigger)
      const cron = trigger ? undefined : validateCron(asRequiredText(args.cron, 'cron'))
      return JSON.stringify(createAutomation({ label, cron, prompt, model, trigger }), null, 2)
    }

    if (typeof automationId !== 'string' || automationId.trim() === '') {
      throw new Error('automation_update: "automation_id" must be a non-empty string.')
    }
    const id = automationId.trim()
    if (!getAutomation(id)) throw new Error(`automation_update: no automation with id "${id}".`)

    const patch: Parameters<typeof updateAutomation>[1] = {}
    if (args.label !== undefined) patch.label = asRequiredText(args.label, 'label')
    if (args.cron !== undefined) patch.cron = validateCron(asRequiredText(args.cron, 'cron'))
    if (args.prompt !== undefined) patch.prompt = asRequiredText(args.prompt, 'prompt')
    if (args.model !== undefined) {
      if (args.model !== null && typeof args.model !== 'string') {
        throw new Error('automation_update: "model" must be a string or null.')
      }
      patch.model = args.model === null ? null : args.model.trim() || null
    }
    if (args.enabled !== undefined) {
      if (typeof args.enabled !== 'boolean') {
        throw new Error('automation_update: "enabled" must be a boolean.')
      }
      patch.enabled = args.enabled
    }
    if (args.trigger !== undefined) patch.trigger = parseToolTrigger(args.trigger)
    if (Object.keys(patch).length === 0) {
      throw new Error('automation_update: supply at least one field to update.')
    }
    updateAutomation(id, patch)
    return JSON.stringify(getAutomation(id), null, 2)
  }
)

toolRegistry.registerNative(
  {
    id: 'automation_delete',
    name: 'automation_delete',
    title: 'Delete automation',
    description: 'Permanently delete one exact saved automation by id.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: AUTOMATION_ID_SCHEMA,
      required: ['automation_id'],
      additionalProperties: false
    },
    risks: ['write', 'destructive'],
    requiresApproval: true,
    enabled: true,
    lazy: true,
    mutates: true
  },
  async (args) => {
    const id = asRequiredText(args.automation_id, 'automation_id')
    if (!getAutomation(id)) throw new Error(`automation_delete: no automation with id "${id}".`)
    deleteAutomation(id)
    return JSON.stringify({ deleted: true, automationId: id })
  }
)

toolRegistry.registerNative(
  {
    id: 'automation_run_now',
    name: 'automation_run_now',
    title: 'Run automation now',
    description:
      'Run one exact saved automation immediately through the existing runner, then return its updated public record and latest run result.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: AUTOMATION_ID_SCHEMA,
      required: ['automation_id'],
      additionalProperties: false
    },
    risks: ['write', 'network'],
    requiresApproval: true,
    enabled: true,
    lazy: true,
    mutates: true
  },
  async (args) => {
    const id = asRequiredText(args.automation_id, 'automation_id')
    if (!getAutomation(id)) throw new Error(`automation_run_now: no automation with id "${id}".`)
    const outcome = await runAutomation(id)
    return JSON.stringify(
      { outcome, automation: getAutomation(id), runs: listAutomationRuns(id) },
      null,
      2
    )
  }
)
