import { pushNotification } from './notifications-service'
import { sendSessionMessage } from './cross-session-messaging'
import { toolRegistry } from './tool-registry'
import { taskDelivery } from './task-delivery'

toolRegistry.registerNative(
  {
    id: 'push_notification',
    name: 'push_notification',
    title: 'Push notification',
    description:
      'Show an OS notification to the user. Optionally include a deep link such as conversation:<id>.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title.' },
        body: { type: 'string', description: 'Notification body text.' },
        deepLink: { type: 'string', description: 'Optional deep link, e.g. conversation:<id>.' }
      },
      required: ['title', 'body'],
      additionalProperties: false
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true
  },
  async (args) => {
    const result = pushNotification({
      title: String(args.title ?? ''),
      body: String(args.body ?? ''),
      deepLink: typeof args.deepLink === 'string' ? args.deepLink : null
    })
    return JSON.stringify(result)
  }
)

toolRegistry.registerNative(
  {
    id: 'send_to_task',
    name: 'send_to_task',
    title: 'Send to task',
    description:
      'Send text to another task. Queue is durable next-turn delivery; Steer targets the exact active regular turn and requires expectedTurnId. Rejections never auto-convert between modes.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        targetTaskId: { type: 'string', description: 'Target conversation/task id.' },
        body: { type: 'string', description: 'Text to deliver.' },
        mode: { type: 'string', enum: ['queue', 'steer'], description: 'Delivery mode.' },
        expectedTurnId: { type: 'string', description: 'Required only for Steer.' },
        targetAgentRunId: { type: 'string', description: 'Optional steerable child run target.' },
        clientUserMessageId: { type: 'string', description: 'Optional retry-deduplication id.' }
      },
      required: ['targetTaskId', 'body', 'mode']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true
  },
  async (args, ctx) =>
    JSON.stringify(
      taskDelivery.send({
        targetConversationId: String(args.targetTaskId ?? ''),
        body: String(args.body ?? ''),
        mode: args.mode === 'steer' ? 'steer' : 'queue',
        expectedTurnId: typeof args.expectedTurnId === 'string' ? args.expectedTurnId : null,
        targetAgentRunId: typeof args.targetAgentRunId === 'string' ? args.targetAgentRunId : null,
        clientUserMessageId:
          typeof args.clientUserMessageId === 'string' ? args.clientUserMessageId : null,
        sourceConversationId: ctx.conversationId ?? null,
        sourceTaskId: ctx.conversationId ?? null
      })
    )
)

toolRegistry.registerNative(
  {
    id: 'interrupt_task',
    name: 'interrupt_task',
    title: 'Interrupt task',
    description:
      'Interrupt one exact active task turn. Requires the current expectedTurnId; does not kill terminals or background processes.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        targetTaskId: { type: 'string', description: 'Target conversation/task id.' },
        expectedTurnId: { type: 'string', description: 'Exact active turn identity.' }
      },
      required: ['targetTaskId', 'expectedTurnId']
    },
    risks: ['write', 'destructive'],
    requiresApproval: true,
    enabled: true,
    mutates: true
  },
  async (args) =>
    JSON.stringify(
      taskDelivery.interrupt(String(args.targetTaskId ?? ''), String(args.expectedTurnId ?? ''))
    )
)

toolRegistry.registerNative(
  {
    id: 'send_to_session',
    name: 'send_to_session',
    title: 'Send to session',
    description:
      'Send a task notification to another conversation/session. It appears in that session on its next model turn.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        targetSessionId: { type: 'string', description: 'Target conversation/session ID.' },
        body: { type: 'string', description: 'Message body to send to the target session.' }
      },
      required: ['targetSessionId', 'body'],
      additionalProperties: false
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true
  },
  async (args, ctx) => {
    const message = sendSessionMessage({
      targetSessionId: String(args.targetSessionId ?? ''),
      body: String(args.body ?? ''),
      fromSessionId: ctx.conversationId ?? null
    })
    return JSON.stringify({ sent: true, id: message.id, targetSessionId: message.targetSessionId })
  }
)
