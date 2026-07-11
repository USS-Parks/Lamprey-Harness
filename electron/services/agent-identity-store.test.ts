import { describe, it, expect, beforeEach } from 'vitest'
import {
  createIdentity,
  grantIdentity,
  revokeIdentity,
  accumulateSpend,
  getIdentity,
  listIdentitiesByScope,
  deleteTerminalIdentitiesBefore,
  __forceMemoryFallbackForTests
} from './agent-identity-store'

// AO-2 — identity store logic, exercised through the in-memory fallback so it
// runs everywhere (the DB path shares the same code and is covered shape-wise
// by agent-identity-db-integration.test.ts against node:sqlite).

beforeEach(() => {
  __forceMemoryFallbackForTests(true)
})

describe('agent-identity-store', () => {
  it('creates a pending identity when no grant is supplied', () => {
    const row = createIdentity({
      id: 'i1',
      label: 'Explore fork',
      agentType: 'Explore',
      scopeKind: 'conversation',
      scopeId: 'conv-1',
      requestedTools: ['read_file', 'apply_patch'],
      createdAt: 1000
    })
    expect(row.status).toBe('pending')
    expect(row.grantedTools).toEqual([])
    expect(getIdentity('i1')?.requestedTools).toEqual(['read_file', 'apply_patch'])
  })

  it('creates an active identity when an up-front grant is supplied (auto-grant floor)', () => {
    const row = createIdentity({
      id: 'i2',
      label: 'reader',
      agentType: 'reader',
      scopeKind: 'conversation',
      scopeId: 'conv-1',
      requestedTools: [],
      grantedTools: [],
      createdAt: 1000
    })
    expect(row.status).toBe('active')
  })

  it('grant persists the approve/refuse decision and activates', () => {
    createIdentity({
      id: 'i3',
      label: 'coder',
      agentType: 'general',
      scopeKind: 'conversation',
      scopeId: 'c',
      requestedTools: ['read_file', 'apply_patch', 'shell_command'],
      createdAt: 1
    })
    // User approved read_file + apply_patch, refused shell_command.
    grantIdentity('i3', ['read_file', 'apply_patch'])
    const row = getIdentity('i3')!
    expect(row.status).toBe('active')
    expect(row.grantedTools).toEqual(['read_file', 'apply_patch'])
    expect(row.grantedTools).not.toContain('shell_command')
  })

  it('revoke flips status + stamps revoked_at', () => {
    createIdentity({
      id: 'i4',
      label: 'x',
      agentType: 'general',
      scopeKind: 'loop',
      scopeId: 'loop-1',
      requestedTools: [],
      createdAt: 1
    })
    revokeIdentity('i4', 5000)
    const row = getIdentity('i4')!
    expect(row.status).toBe('revoked')
    expect(row.revokedAt).toBe(5000)
  })

  it('accumulates spend and clamps to non-negative integers', () => {
    createIdentity({
      id: 'i5',
      label: 'x',
      agentType: 'general',
      scopeKind: 'outcome',
      scopeId: 'o1',
      requestedTools: [],
      tokensCeiling: 10_000,
      createdAt: 1
    })
    accumulateSpend('i5', 1200, 3400)
    accumulateSpend('i5', 800.6, 100)
    accumulateSpend('i5', -50, -10) // clamped to 0
    const row = getIdentity('i5')!
    expect(row.tokensSpent).toBe(2001) // 1200 + 801 (rounded) + 0
    expect(row.wallMsSpent).toBe(3500)
    expect(row.tokensCeiling).toBe(10_000)
  })

  it('lists identities by scope, newest first', () => {
    createIdentity({
      id: 'a',
      label: 'a',
      agentType: 'general',
      scopeKind: 'conversation',
      scopeId: 'c9',
      requestedTools: [],
      createdAt: 10
    })
    createIdentity({
      id: 'b',
      label: 'b',
      agentType: 'general',
      scopeKind: 'conversation',
      scopeId: 'c9',
      requestedTools: [],
      createdAt: 30
    })
    createIdentity({
      id: 'c',
      label: 'c',
      agentType: 'general',
      scopeKind: 'loop',
      scopeId: 'c9',
      requestedTools: [],
      createdAt: 20
    })
    const scoped = listIdentitiesByScope('conversation', 'c9')
    expect(scoped.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('retention sweep deletes only revoked rows before the cutoff', () => {
    createIdentity({
      id: 'old-revoked',
      label: 'x',
      agentType: 'general',
      scopeKind: 'conversation',
      scopeId: 'c',
      requestedTools: [],
      createdAt: 100
    })
    revokeIdentity('old-revoked', 150)
    createIdentity({
      id: 'old-active',
      label: 'x',
      agentType: 'general',
      scopeKind: 'conversation',
      scopeId: 'c',
      requestedTools: [],
      createdAt: 100
    })
    createIdentity({
      id: 'new-revoked',
      label: 'x',
      agentType: 'general',
      scopeKind: 'conversation',
      scopeId: 'c',
      requestedTools: [],
      createdAt: 900
    })
    revokeIdentity('new-revoked', 950)
    const deleted = deleteTerminalIdentitiesBefore(500)
    expect(deleted).toBe(1)
    expect(getIdentity('old-revoked')).toBeNull()
    expect(getIdentity('old-active')).not.toBeNull() // active never swept
    expect(getIdentity('new-revoked')).not.toBeNull() // after cutoff
  })
})
