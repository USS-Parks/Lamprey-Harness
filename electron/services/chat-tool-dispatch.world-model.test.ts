// WM-3 — the per-call world-model gate inside resolveSingleToolCall:
// verify mode returns verdicts for doomed calls without executing; off mode
// is byte-compatible pass-through to the real handler.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  executed: [] as string[],
  events: [] as { type: string; payload: Record<string, unknown> }[]
}))

vi.mock('electron', () => ({
  app: { getPath: () => { throw new Error('no user dir in fixture') } },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('./debug-trace', () => ({ trace: vi.fn() }))
vi.mock('./conversation-store', () => ({ isPlanModeActive: () => false }))
vi.mock('./hooks-runner', () => ({ fireHooks: async () => ({ blocked: false }) }))
vi.mock('./chat-events', () => ({ emitChatEvent: vi.fn() }))
vi.mock('./settings-helper', () => ({ readSettings: () => ({ ...state.settings }) }))
vi.mock('./event-log', () => ({
  recordEvent: (e: { type: string; payload: Record<string, unknown> }) => {
    state.events.push({ type: e.type, payload: e.payload })
  },
  boundedJsonPreview: (v: unknown) => JSON.stringify(v ?? null).slice(0, 100)
}))
vi.mock('./permissions-store', () => ({
  descriptorNeedsApproval: () => false,
  permissionsService: { requestApprovalDetailed: async () => ({ decision: 'allow', source: 'test' }) }
}))
vi.mock('./tool-registry', () => ({
  isMutatingDescriptor: () => true,
  isParallelizableDescriptor: () => false,
  toolRegistry: {
    getById: (id: string) =>
      id === 'apply_patch'
        ? {
            id, name: id, providerId: 'internal', providerKind: 'native', risks: ['write'],
            inputSchema: {
              type: 'object',
              properties: { patch: { type: 'string' } },
              required: ['patch'],
              additionalProperties: false
            }
          }
        : undefined,
    hasHandler: (id: string) => id === 'apply_patch',
    executeNative: async (_id: string, args: Record<string, unknown>, ctx: { workspacePath?: string }) => {
      state.executed.push('apply_patch')
      const { executeApplyPatch } = await import('./apply-patch-tool')
      const r = await executeApplyPatch({ patch: String(args.patch) }, ctx.workspacePath ?? '.')
      return r.result
    },
    recordCallStart: vi.fn(),
    recordCallEnd: vi.fn(),
    resolveToolSearch: () => []
  }
}))

import { resolveSingleToolCall, resolveToolCallWindows } from './chat-tool-dispatch'
import { __resetWorldModelStateForTesting } from './workspace-world-model'
import {
  __resetWorldModelBudgetForTesting,
  beginWorldModelTurn,
  isWorldModelTurnDowngraded
} from './world-model-budget'

let root: string
const CONV = 'conv-wm3-dispatch'
const PATCH = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch`

function patchCall(patch: string) {
  return {
    id: 'call-1',
    type: 'function' as const,
    function: { name: 'apply_patch', arguments: JSON.stringify({ patch }) }
  }
}

beforeEach(() => {
  __resetWorldModelStateForTesting()
  __resetWorldModelBudgetForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm3d-'))
  state.settings = {}
  state.executed = []
  state.events = []
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function dispatch(patch: string) {
  return resolveSingleToolCall(
    patchCall(patch), CONV, 'test-model', root, new AbortController().signal
  )
}

describe('WM-3 per-call gate', () => {
  it('verify mode blocks a doomed patch with a verdict and never executes', async () => {
    state.settings = { workspaceWorldModel: 'verify' }
    const r = await dispatch(PATCH('*** Update File: missing.ts\n@@\n-a\n+b'))
    const parsed = JSON.parse(r.result)
    expect(parsed.error).toBe('world_model_precondition_failed')
    expect(state.executed).toEqual([])
    expect(state.events.some((e) => e.type === 'world_model.verdict')).toBe(true)
  })

  it('verify mode blocks an anchor mismatch before partial application', async () => {
    writeFileSync(join(root, 'two-op.ts'), 'first\n')
    writeFileSync(join(root, 'other.ts'), 'real content\n')
    state.settings = { workspaceWorldModel: 'verify' }
    // Op 1 would apply; op 2 cannot anchor. The disk applier would have
    // committed op 1 before op 2 threw — the gate prevents the partial write.
    const r = await dispatch(
      PATCH('*** Update File: two-op.ts\n@@\n-first\n+FIRST\n*** Update File: other.ts\n@@\n-wrong anchor\n+x')
    )
    expect(JSON.parse(r.result).error).toBe('world_model_precondition_failed')
    expect(readFileSync(join(root, 'two-op.ts'), 'utf8')).toBe('first\n')
    expect(state.executed).toEqual([])
  })

  it('verify mode lets a valid patch through to the real handler', async () => {
    writeFileSync(join(root, 'ok.ts'), 'old\n')
    state.settings = { workspaceWorldModel: 'verify' }
    const r = await dispatch(PATCH('*** Update File: ok.ts\n@@\n-old\n+new'))
    expect(r.result).toContain('Applied 1 change')
    expect(state.executed).toEqual(['apply_patch'])
    expect(readFileSync(join(root, 'ok.ts'), 'utf8')).toBe('new\n')
  })

  it('off mode passes the doomed call straight to the handler (baseline behavior)', async () => {
    state.settings = { workspaceWorldModel: 'off' }
    const r = await dispatch(PATCH('*** Update File: missing.ts\n@@\n-a\n+b'))
    expect(state.executed).toEqual(['apply_patch'])
    expect(r.result).toContain('does not exist')
    expect(state.events.filter((e) => e.type === 'world_model.verdict')).toEqual([])
  })

  it('repair mode fixes a whitespace-only mismatch end-to-end', async () => {
    writeFileSync(join(root, 'ws.ts'), '  indented old\n')
    state.settings = { workspaceWorldModel: 'repair' }
    const r = await dispatch(PATCH('*** Update File: ws.ts\n@@\n-indented old\n+indented new'))
    expect(r.result).toContain('Applied 1 change')
    expect(readFileSync(join(root, 'ws.ts'), 'utf8')).toBe('  indented new\n')
    expect(state.events.some((e) => e.type === 'world_model.repair')).toBe(true)
  })

  it('verify mode never repairs — the same call stays a verdict', async () => {
    writeFileSync(join(root, 'ws2.ts'), '  indented old\n')
    state.settings = { workspaceWorldModel: 'verify' }
    const r = await dispatch(PATCH('*** Update File: ws2.ts\n@@\n-indented old\n+indented new'))
    expect(JSON.parse(r.result).error).toBe('world_model_precondition_failed')
    expect(readFileSync(join(root, 'ws2.ts'), 'utf8')).toBe('  indented old\n')
    expect(state.events.filter((e) => e.type === 'world_model.repair')).toEqual([])
  })

  it('a zero repair budget disables the repair tier', async () => {
    writeFileSync(join(root, 'ws3.ts'), '  indented old\n')
    state.settings = { workspaceWorldModel: 'repair', worldModelRepairBudget: 0 }
    const r = await dispatch(PATCH('*** Update File: ws3.ts\n@@\n-indented old\n+x'))
    expect(JSON.parse(r.result).error).toBe('world_model_precondition_failed')
  })

  it('verdict events carry kinds and paths, never patch bodies', async () => {
    state.settings = { workspaceWorldModel: 'full' }
    await dispatch(PATCH('*** Update File: missing.ts\n@@\n-secret content\n+b'))
    const ev = state.events.find((e) => e.type === 'world_model.verdict')!
    expect(JSON.stringify(ev.payload)).not.toContain('secret content')
    expect(ev.payload.violationKinds).toContain('exists')
  })
})

describe('WM-5 batch rollforward at the windows seam', () => {
  function batchCall(id: string, patch: string) {
    return {
      id,
      type: 'function' as const,
      function: { name: 'apply_patch', arguments: JSON.stringify({ patch }) }
    }
  }

  it('a cross-call doom executes NOTHING and verdicts the doomed call', async () => {
    writeFileSync(join(root, 'plan.ts'), 'x\n')
    state.settings = { workspaceWorldModel: 'verify' }
    const results = await resolveToolCallWindows(
      [
        batchCall('c1', PATCH('*** Delete File: plan.ts')),
        batchCall('c2', PATCH('*** Update File: plan.ts\n@@\n-x\n+y'))
      ],
      CONV, 'test-model', root, new AbortController().signal
    )
    expect(state.executed).toEqual([])
    expect(readFileSync(join(root, 'plan.ts'), 'utf8')).toBe('x\n')
    expect(JSON.parse(results[0].result).error).toBe('batch_not_executed')
    expect(JSON.parse(results[1].result).error).toBe('world_model_precondition_failed')
  })

  it('an index-0 violation falls through to the per-call gate', async () => {
    writeFileSync(join(root, 'ok2.ts'), 'fine\n')
    state.settings = { workspaceWorldModel: 'verify' }
    const results = await resolveToolCallWindows(
      [
        batchCall('c1', PATCH('*** Update File: nowhere.ts\n@@\n-a\n+b')),
        batchCall('c2', PATCH('*** Update File: ok2.ts\n@@\n-fine\n+better'))
      ],
      CONV, 'test-model', root, new AbortController().signal
    )
    expect(JSON.parse(results[0].result).error).toBe('world_model_precondition_failed')
    expect(results[1].result).toContain('Applied 1 change')
    expect(readFileSync(join(root, 'ok2.ts'), 'utf8')).toBe('better\n')
  })

  it('a coherent batch executes fully in order', async () => {
    writeFileSync(join(root, 'seq.ts'), 'one\n')
    state.settings = { workspaceWorldModel: 'verify' }
    const results = await resolveToolCallWindows(
      [
        batchCall('c1', PATCH('*** Update File: seq.ts\n@@\n-one\n+two')),
        batchCall('c2', PATCH('*** Update File: seq.ts\n@@\n-two\n+three'))
      ],
      CONV, 'test-model', root, new AbortController().signal
    )
    expect(results.map((r) => r.result)).toEqual([
      expect.stringContaining('Applied 1 change'),
      expect.stringContaining('Applied 1 change')
    ])
    expect(readFileSync(join(root, 'seq.ts'), 'utf8')).toBe('three\n')
  })

  it('budget exhaustion downgrades the gate for the rest of the turn', async () => {
    state.settings = { workspaceWorldModel: 'verify', worldModelRepairBudget: 2 }
    beginWorldModelTurn(CONV)
    const doomed = PATCH('*** Update File: nope.ts\n@@\n-a\n+b')
    await dispatch(doomed)
    await dispatch(doomed)
    expect(isWorldModelTurnDowngraded(CONV)).toBe(true)
    expect(state.events.filter((e) => e.type === 'world_model.downgrade')).toHaveLength(1)
    // Third identical call passes through to the real handler (baseline path).
    const r3 = await dispatch(doomed)
    expect(r3.result).toContain('does not exist')
    expect(state.executed).toEqual(['apply_patch'])
  })

  it('off mode never rolls forward', async () => {
    writeFileSync(join(root, 'off.ts'), 'x\n')
    state.settings = { workspaceWorldModel: 'off' }
    await resolveToolCallWindows(
      [
        batchCall('c1', PATCH('*** Delete File: off.ts')),
        batchCall('c2', PATCH('*** Update File: off.ts\n@@\n-x\n+y'))
      ],
      CONV, 'test-model', root, new AbortController().signal
    )
    // Baseline behavior: call 1 deletes, call 2 fails at the tool itself.
    expect(state.executed).toEqual(['apply_patch', 'apply_patch'])
    expect(existsSync(join(root, 'off.ts'))).toBe(false)
  })
})
