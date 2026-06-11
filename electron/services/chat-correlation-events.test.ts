import { beforeEach, describe, expect, it, vi } from 'vitest'

// Force the event-log + policy-store fallbacks so tests run without
// better-sqlite3. UB-1 (Unburdening Phase, 2026-06-10): the agent.stage.*
// pipeline-event suites that used to live here died with runAgentPipeline —
// what remains is the correlation contract for the producers that still
// exist (approvals + tool lifecycle).
vi.mock('electron', () => ({
  app: {
    getPath: () => {
      throw new Error('electron app not available in test environment')
    }
  },
  BrowserWindow: { getAllWindows: () => [] }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

import {
  __forceMemoryFallback as forceEventMemory,
  __resetEventLog,
  listEvents,
  listTimeline
} from './event-log'
import {
  __forceMemoryFallback as forcePolicyMemory,
  __resetPolicyStore,
  upsertPolicy
} from './permission-policies-store'
import { permissionsService } from './permissions-store'
import { toolRegistry } from './tool-registry'

beforeEach(() => {
  __resetEventLog()
  forceEventMemory()
  __resetPolicyStore()
  forcePolicyMemory()
})

// ──────────────────── correlationId on tool + approval producers ────────────────────

describe('producers pass correlationId through to event payloads', () => {
  it('recordCallStart/End attach correlationId to lifecycle events', () => {
    const cid = 'corr-tool-1'
    toolRegistry.recordCallStart(
      {
        id: 'tc-1',
        toolId: 'shell_command',
        name: 'shell_command',
        conversationId: 'conv-X',
        args: { cmd: 'ls' },
        startedAt: Date.now(),
        status: 'running'
      },
      cid
    )
    toolRegistry.recordCallEnd('tc-1', {
      status: 'done',
      result: 'ok',
      approvalSource: 'none',
      finishedAt: Date.now(),
      correlationId: cid
    })
    const events = listEvents({ correlationId: cid, order: 'asc' })
    expect(events.map((e) => e.type)).toEqual([
      'tool.call.started',
      'tool.call.completed'
    ])
    expect(events.every((e) => e.correlationId === cid)).toBe(true)
  })

  it('permissionsService attaches req.correlationId to approval events', async () => {
    upsertPolicy({
      scope: 'global',
      subjectKind: 'tool',
      subject: 'shell_command',
      decision: 'allow'
    })
    const cid = 'corr-approval-1'
    const outcome = await permissionsService.requestApprovalDetailed({
      callId: 'tc-2',
      toolId: 'shell_command',
      name: 'shell_command',
      serverId: 'internal',
      providerKind: 'native',
      risks: ['destructive'],
      args: { cmd: 'rm' },
      conversationId: 'conv-X',
      correlationId: cid
    })
    expect(outcome.decision).toBe('allow')
    const approved = listEvents({ correlationId: cid, type: 'tool.call.approved' })
    expect(approved).toHaveLength(1)
    expect(approved[0].correlationId).toBe(cid)
  })
})

// ──────────────────── correlation-grouped timeline ────────────────────

describe('one correlationId reconstructs a coherent multi-producer run', () => {
  it('approval + tool lifecycle share a correlationId and order by time', async () => {
    const cid = 'corr-mixed-run'
    // 1. Approval (policy-match allow → emits tool.call.approved).
    upsertPolicy({
      scope: 'global',
      subjectKind: 'tool',
      subject: 'shell_command',
      decision: 'allow'
    })
    await permissionsService.requestApprovalDetailed({
      callId: 'tc-M',
      toolId: 'shell_command',
      name: 'shell_command',
      serverId: 'internal',
      providerKind: 'native',
      risks: ['destructive'],
      args: { cmd: 'ls' },
      conversationId: 'conv-M',
      correlationId: cid
    })
    // 2. Tool started + completed.
    toolRegistry.recordCallStart(
      {
        id: 'tc-M',
        toolId: 'shell_command',
        name: 'shell_command',
        conversationId: 'conv-M',
        args: { cmd: 'ls' },
        startedAt: Date.now(),
        status: 'running'
      },
      cid
    )
    toolRegistry.recordCallEnd('tc-M', {
      status: 'done',
      result: 'a.txt',
      approvalSource: 'policy:p',
      finishedAt: Date.now(),
      correlationId: cid
    })

    const tl = listTimeline({ correlationId: cid })
    // Every event in the timeline must share the same correlationId — the
    // very property that lets the UI reconstruct a chat run by one id.
    expect(tl.length).toBeGreaterThanOrEqual(3)
    expect(tl.every((e) => e.correlationId === cid)).toBe(true)
    // The first event chronologically is the approval (it ran first); the
    // last is the tool completion.
    expect(tl[0].type).toBe('tool.call.approved')
    expect(tl[tl.length - 1].type).toBe('tool.call.completed')
  })
})
