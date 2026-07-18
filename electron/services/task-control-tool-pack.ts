import { app } from 'electron'
import { join } from 'path'
import { toolRegistry } from './tool-registry'
import { listTaskSnapshots, readTaskSnapshot, waitForTasks } from './task-query'
import { forkTaskAtTurn } from './fork-task'
import { createAgentWorktreeManager } from './worktree-runner'
import { recordEvent } from './event-log'
import { taskLifecycle } from './task-lifecycle'

toolRegistry.registerNative(
  {
    id: 'list_tasks',
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'List conversation tasks from the canonical task graph with stable cursor pagination and current status.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cursor: { type: 'string', description: 'Opaque cursor returned by a prior call.' },
        limit: { type: 'number', description: 'Page size from 1 to 200.' },
        rootConversationId: {
          type: 'string',
          description: 'Optional root conversation tree filter.'
        }
      }
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    mutates: false
  },
  async (args) =>
    JSON.stringify(
      listTaskSnapshots({
        cursor: typeof args.cursor === 'string' ? args.cursor : null,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        rootConversationId:
          typeof args.rootConversationId === 'string' ? args.rootConversationId : null
      })
    )
)

toolRegistry.registerNative(
  {
    id: 'update_task_metadata',
    name: 'update_task_metadata',
    title: 'Update task metadata',
    description:
      'Rename, pin, unpin, archive, close, or restore a task. Close/archive are recoverable.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string' },
        action: { type: 'string', enum: ['rename', 'pin', 'unpin', 'archive', 'restore', 'close'] },
        value: { type: 'string', description: 'New title for rename.' }
      },
      required: ['taskId', 'action']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true
  },
  async (args) =>
    JSON.stringify(
      taskLifecycle.update(
        String(args.taskId ?? ''),
        String(args.action ?? '') as never,
        typeof args.value === 'string' ? args.value : null
      )
    )
)

toolRegistry.registerNative(
  {
    id: 'preview_delete_task',
    name: 'preview_delete_task',
    title: 'Preview task deletion',
    description:
      'Preview the exact conversation, run, identity, and turn descendants affected by permanent task deletion. Returns a short-lived token required by delete_task.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { taskId: { type: 'string' } },
      required: ['taskId']
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    mutates: false
  },
  async (args) => JSON.stringify(taskLifecycle.previewDelete(String(args.taskId ?? '')))
)

toolRegistry.registerNative(
  {
    id: 'delete_task',
    name: 'delete_task',
    title: 'Permanently delete task',
    description:
      'Permanently delete a task tree after preview_delete_task. Active descendants block deletion; the short-lived preview token must still match.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string' },
        previewToken: { type: 'string' }
      },
      required: ['taskId', 'previewToken']
    },
    risks: ['write', 'destructive'],
    requiresApproval: true,
    enabled: true,
    mutates: true
  },
  async (args) =>
    JSON.stringify(taskLifecycle.delete(String(args.taskId ?? ''), String(args.previewToken ?? '')))
)

toolRegistry.registerNative(
  {
    id: 'fork_task',
    name: 'fork_task',
    title: 'Fork task at turn',
    description:
      'Create a linked task whose transcript ends at one completed source turn. The new task stores source task/turn backlinks and uses an isolated worktree when requested.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sourceTaskId: { type: 'string' },
        turnId: { type: 'string' },
        title: { type: 'string' },
        includeRagAttachments: { type: 'boolean' },
        isolateWorktree: { type: 'boolean' }
      },
      required: ['sourceTaskId', 'turnId']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true
  },
  async (args, ctx) => {
    const manager =
      args.isolateWorktree === true && ctx.workspacePath
        ? createAgentWorktreeManager({
            baseCwd: ctx.workspacePath,
            workspacesRoot: join(app.getPath('userData'), 'fork-worktrees')
          })
        : null
    return JSON.stringify(
      await forkTaskAtTurn(
        {
          sourceConversationId: String(args.sourceTaskId ?? ''),
          turnId: String(args.turnId ?? ''),
          title: typeof args.title === 'string' ? args.title : null,
          includeRagAttachments: args.includeRagAttachments !== false,
          isolateWorktree: args.isolateWorktree === true
        },
        { worktreeManager: manager, record: recordEvent }
      )
    )
  }
)

toolRegistry.registerNative(
  {
    id: 'read_task',
    name: 'read_task',
    title: 'Read task',
    description:
      'Read one task and its bounded descendant graph. Accepts a conversation id or a typed graph node id.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskId: { type: 'string', description: 'Conversation id or typed task graph node id.' },
        descendantLimit: { type: 'number', description: 'Maximum descendants from 0 to 200.' }
      },
      required: ['taskId']
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    mutates: false
  },
  async (args) =>
    JSON.stringify(
      readTaskSnapshot(
        String(args.taskId ?? ''),
        typeof args.descendantLimit === 'number' ? args.descendantLimit : 100
      )
    )
)

toolRegistry.registerNative(
  {
    id: 'wait_tasks',
    name: 'wait_tasks',
    title: 'Wait for tasks',
    description:
      'Wait without polling for one to eight tasks to change, time out, receive Steering, or be cancelled. Pass each prior cursor as afterCursor to suppress already-seen state.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        targets: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              taskId: { type: 'string' },
              afterCursor: { type: 'string' }
            },
            required: ['taskId']
          }
        },
        timeoutMs: { type: 'number', description: 'Bounded timeout from 0 to 300000 ms.' }
      },
      required: ['targets']
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    mutates: false
  },
  async (args, ctx) => {
    const targets = Array.isArray(args.targets)
      ? args.targets.map((raw) => {
          const target = raw as Record<string, unknown>
          return {
            taskId: String(target.taskId ?? ''),
            afterCursor: typeof target.afterCursor === 'string' ? target.afterCursor : null
          }
        })
      : []
    return JSON.stringify(
      await waitForTasks(targets, {
        timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
        signal: ctx.signal
      })
    )
  }
)
