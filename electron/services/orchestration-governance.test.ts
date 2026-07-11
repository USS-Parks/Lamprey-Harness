import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { governFork, settleRunSpend } from './orchestration-governance'
import { ORCHESTRATION_CONFIG_DEFAULTS } from './orchestration-config'

// AO-5 — the governance seam. Its central guarantee: OFF ⇒ no identity, no DB
// writes (the existing fork paths run byte-for-byte as before).

const scope = {
  conversationId: 'conv-1',
  scopeKind: 'conversation' as const,
  agentType: 'multi_agent_run',
  requestedTools: [],
  floor: new Set<string>(),
  label: 'test run'
}

describe('governFork', () => {
  it('OFF ⇒ returns null identity and NEVER creates one (byte-compat)', () => {
    const createIdentity = vi.fn()
    const res = governFork(scope, {
      config: { ...ORCHESTRATION_CONFIG_DEFAULTS, enabled: false },
      createIdentity
    })
    expect(res.identityId).toBeNull()
    expect(res.needsApproval).toEqual([])
    expect(createIdentity).not.toHaveBeenCalled()
  })

  it('ON ⇒ mints an auto-granted identity carrying the run budget', () => {
    const createIdentity = vi.fn((args) => ({ ...args, status: 'active' as const }))
    const res = governFork(
      { ...scope, requestedTools: ['read_file'], floor: new Set(['read_file']) },
      {
        config: {
          ...ORCHESTRATION_CONFIG_DEFAULTS,
          enabled: true,
          maxTokensPerRun: 12_345,
          maxWallclockMs: 60_000
        },
        createIdentity,
        genId: () => 'fixed-id',
        now: () => 1000
      }
    )
    expect(res.identityId).toBe('fixed-id')
    expect(res.needsApproval).toEqual([])
    expect(createIdentity).toHaveBeenCalledOnce()
    const passed = createIdentity.mock.calls[0][0]
    expect(passed.grantedTools).toEqual(['read_file'])
    expect(passed.tokensCeiling).toBe(12_345)
    expect(passed.wallMsCeiling).toBe(60_000)
    expect(passed.scopeKind).toBe('conversation')
  })

  it('ON with tools beyond the floor ⇒ those tools land in needsApproval, ungranted', () => {
    const createIdentity = vi.fn((args) => args)
    const res = governFork(
      {
        ...scope,
        requestedTools: ['read_file', 'apply_patch'],
        floor: new Set(['read_file'])
      },
      { config: { ...ORCHESTRATION_CONFIG_DEFAULTS, enabled: true }, createIdentity }
    )
    expect(res.needsApproval).toEqual(['apply_patch'])
    expect(createIdentity.mock.calls[0][0].grantedTools).toEqual(['read_file'])
  })
})

describe('AO-10 audit event on mint', () => {
  it('emits an id + counts payload, never tool arguments', () => {
    // The created-event payload shape is source-locked here: ids + counts only.
    const src = readFileSync(join(__dirname, 'orchestration-governance.ts'), 'utf-8')
    expect(src).toMatch(/action: 'created'/)
    expect(src).toMatch(/grantedCount: decision\.autoGranted\.length/)
    expect(src).toMatch(/pendingCount: decision\.needsApproval\.length/)
    // No tool-name arrays in the event payload.
    expect(src).not.toMatch(/payload:[\s\S]*?grantedTools:/)
  })
})

describe('settleRunSpend', () => {
  it('accumulates tokens + wall onto the identity', () => {
    const accumulate = vi.fn()
    settleRunSpend('id-1', 500, 1200, { accumulate })
    expect(accumulate).toHaveBeenCalledWith('id-1', 500, 1200)
  })

  it('is a no-op when there is no identity (orchestration off)', () => {
    const accumulate = vi.fn()
    settleRunSpend(null, 500, 1200, { accumulate })
    expect(accumulate).not.toHaveBeenCalled()
  })
})
