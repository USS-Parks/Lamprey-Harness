import { describe, it, expect } from 'vitest'
import {
  classifyGrant,
  isAutoGrant,
  buildGrantRequest,
  resolveEffectiveTools,
  concreteFloor
} from './agent-grants'

// AO-3 — the deterministic grant layer. These tests are the phase's core
// safety claim: what a fork may touch is decided by the persisted grant at
// resolution time, never by prompt language.

describe('classifyGrant', () => {
  const READONLY_FLOOR = new Set(['read_file', 'grep_search', 'glob_search'])

  it('a read-only-floor fork auto-grants with NO approval prompt', () => {
    const d = classifyGrant(['read_file', 'grep_search'], READONLY_FLOOR)
    expect(d.needsApproval).toEqual([])
    expect(d.autoGranted).toEqual(['grep_search', 'read_file'])
    expect(isAutoGrant(['read_file'], READONLY_FLOOR)).toBe(true)
  })

  it('a fork requesting nothing auto-grants (tool-less multi_agent_run roles)', () => {
    expect(classifyGrant([], READONLY_FLOOR).needsApproval).toEqual([])
    expect(isAutoGrant([], READONLY_FLOOR)).toBe(true)
  })

  it('tools outside the floor require the user decision', () => {
    const d = classifyGrant(['read_file', 'apply_patch', 'shell_command'], READONLY_FLOOR)
    expect(d.autoGranted).toEqual(['read_file'])
    expect(d.needsApproval).toEqual(['apply_patch', 'shell_command'])
    expect(isAutoGrant(['apply_patch'], READONLY_FLOOR)).toBe(false)
  })

  it('buildGrantRequest surfaces exactly the pending tools as chips', () => {
    const d = classifyGrant(['read_file', 'apply_patch'], READONLY_FLOOR)
    const req = buildGrantRequest('id-1', 'general', d)
    expect(req.identityId).toBe('id-1')
    expect(req.agentType).toBe('general')
    expect(req.autoGranted).toEqual(['read_file'])
    expect(req.pending).toEqual(['apply_patch'])
  })
})

describe('resolveEffectiveTools — the enforcement point', () => {
  const FLOOR = ['read_file', 'apply_patch', 'shell_command']

  it('a REVOKED identity resolves to ZERO tools (kill switch)', () => {
    expect(resolveEffectiveTools(FLOOR, { status: 'revoked', grantedTools: FLOOR })).toEqual([])
  })

  it('a refused tool is ABSENT from the resolved set', () => {
    // User approved read_file + apply_patch, refused shell_command.
    const resolved = resolveEffectiveTools(FLOOR, {
      status: 'active',
      grantedTools: ['read_file', 'apply_patch']
    })
    expect(resolved).toEqual(['apply_patch', 'read_file'])
    expect(resolved).not.toContain('shell_command')
  })

  it('a null identity (auto-grant floor) yields the type floor unchanged', () => {
    expect(resolveEffectiveTools(FLOOR, null)).toEqual([
      'apply_patch',
      'read_file',
      'shell_command'
    ])
  })

  it('granted tools outside the floor are still bounded by the floor', () => {
    // Defensive: even if a granted set somehow names a tool the type never
    // allowed, the floor intersection drops it.
    const resolved = resolveEffectiveTools(['read_file'], {
      status: 'active',
      grantedTools: ['read_file', 'delete_everything']
    })
    expect(resolved).toEqual(['read_file'])
  })
})

describe('concreteFloor — resolving allowedTools against parent tools', () => {
  it("'*' means everything the parent has", () => {
    expect(concreteFloor('*', ['a', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('a list is intersected with the parent tools', () => {
    expect(concreteFloor(['a', 'z'], ['a', 'b'])).toEqual(['a'])
  })
})
