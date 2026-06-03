import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAgentStore } from './agent-store'
import type { AgentStatusEvent } from '@/lib/types'

// Zustand stores are plain singletons. Reset between cases by restoring
// the documented initial state so tests don't share residue.
const initialState = {
  mode: 'single' as const,
  roster: {
    planner: 'deepseek-v4-pro',
    coder: 'deepseek-v4-flash',
    reviewer: 'deepseek-v4-pro',
    coworker: 'qwen3-coder-plus'
  },
  activeRun: [] as ReturnType<typeof useAgentStore.getState>['activeRun']
}

beforeEach(() => {
  // Hydrate to defaults — covers the case where setMode/setRole/etc
  // mutated state on previous runs even if order isn't deterministic.
  useAgentStore.setState({ ...initialState })
})

afterEach(() => {
  useAgentStore.getState().clearRun()
})

describe('useAgentStore — initial shape', () => {
  it('boots in single mode with an empty activeRun', () => {
    const s = useAgentStore.getState()
    expect(s.mode).toBe('single')
    expect(s.activeRun).toEqual([])
    expect(s.roster.planner).toBe('deepseek-v4-pro')
    expect(s.roster.coder).toBe('deepseek-v4-flash')
    expect(s.roster.reviewer).toBe('deepseek-v4-pro')
  })
})

describe('useAgentStore.recordStatus', () => {
  function event(role: AgentStatusEvent['role'], state: AgentStatusEvent['state'], extras: Partial<AgentStatusEvent> = {}): AgentStatusEvent {
    return {
      conversationId: 'c-1',
      role,
      model: 'deepseek-v4-pro',
      state,
      ...extras
    }
  }

  it('appends a new entry on the first event for a role', () => {
    useAgentStore.getState().recordStatus(event('planner', 'running'))
    expect(useAgentStore.getState().activeRun).toEqual([
      expect.objectContaining({ role: 'planner', state: 'running' })
    ])
  })

  it('updates the existing entry on a subsequent event for the same role', () => {
    useAgentStore.getState().recordStatus(event('planner', 'running'))
    useAgentStore
      .getState()
      .recordStatus(event('planner', 'done', { output: 'plan text' }))
    const entries = useAgentStore.getState().activeRun
    expect(entries).toHaveLength(1)
    expect(entries[0].role).toBe('planner')
    expect(entries[0].state).toBe('done')
    expect(entries[0].output).toBe('plan text')
  })

  it('preserves prior `output` when a later event omits it', () => {
    useAgentStore
      .getState()
      .recordStatus(event('reviewer', 'running', { output: 'partial reasoning' }))
    useAgentStore.getState().recordStatus(event('reviewer', 'done'))
    const entries = useAgentStore.getState().activeRun
    expect(entries[0].state).toBe('done')
    expect(entries[0].output).toBe('partial reasoning')
  })

  it('accumulates entries across distinct roles in arrival order', () => {
    useAgentStore.getState().recordStatus(event('planner', 'running'))
    useAgentStore.getState().recordStatus(event('planner', 'done'))
    useAgentStore.getState().recordStatus(event('coder', 'running'))
    useAgentStore.getState().recordStatus(event('reviewer', 'running'))
    const roles = useAgentStore.getState().activeRun.map((r) => r.role)
    expect(roles).toEqual(['planner', 'coder', 'reviewer'])
  })

  it('captures the per-role model id from the event (not the global roster)', () => {
    useAgentStore.getState().recordStatus(
      event('coder', 'running', { model: 'gemma-3-27b' })
    )
    expect(useAgentStore.getState().activeRun[0].model).toBe('gemma-3-27b')
  })

  it('records error states without dropping the entry', () => {
    useAgentStore.getState().recordStatus(event('planner', 'running'))
    useAgentStore
      .getState()
      .recordStatus(event('planner', 'error', { output: 'upstream 500' }))
    const entry = useAgentStore.getState().activeRun.find((r) => r.role === 'planner')
    expect(entry?.state).toBe('error')
    expect(entry?.output).toBe('upstream 500')
  })
})

describe('useAgentStore.clearRun', () => {
  it('empties activeRun', () => {
    useAgentStore
      .getState()
      .recordStatus({ conversationId: 'c-1', role: 'planner', model: 'x', state: 'done' })
    expect(useAgentStore.getState().activeRun).toHaveLength(1)
    useAgentStore.getState().clearRun()
    expect(useAgentStore.getState().activeRun).toEqual([])
  })

  it('leaves mode and roster untouched', () => {
    useAgentStore.getState().setMode('multi')
    useAgentStore.getState().setRole('coder', 'qwen3-coder-plus')
    useAgentStore
      .getState()
      .recordStatus({ conversationId: 'c-1', role: 'planner', model: 'x', state: 'done' })
    useAgentStore.getState().clearRun()
    expect(useAgentStore.getState().mode).toBe('multi')
    expect(useAgentStore.getState().roster.coder).toBe('qwen3-coder-plus')
  })
})

describe('useAgentStore.setMode + setRole + hydrate', () => {
  it('setMode flips the dispatch flag without touching roster', () => {
    useAgentStore.getState().setMode('multi')
    expect(useAgentStore.getState().mode).toBe('multi')
    expect(useAgentStore.getState().roster.planner).toBe('deepseek-v4-pro')
  })

  it('setRole replaces one role without touching the others', () => {
    useAgentStore.getState().setRole('coder', 'gemma-3-27b')
    expect(useAgentStore.getState().roster.coder).toBe('gemma-3-27b')
    expect(useAgentStore.getState().roster.planner).toBe('deepseek-v4-pro')
  })

  it('hydrate replaces both mode and roster (merging onto defaults)', () => {
    useAgentStore.getState().hydrate('multi', {
      planner: 'gemma-3-27b',
      coder: 'qwen3-coder-plus',
      reviewer: 'deepseek-v4-pro',
      coworker: 'deepseek-v4-flash'
    })
    expect(useAgentStore.getState().mode).toBe('multi')
    expect(useAgentStore.getState().roster.planner).toBe('gemma-3-27b')
    expect(useAgentStore.getState().roster.coder).toBe('qwen3-coder-plus')
  })

  it('hydrate fills missing roles from the default roster (partial hydration is safe)', () => {
    useAgentStore.getState().hydrate('multi', {
      planner: 'gemma-3-27b'
    } as never)
    // The default's coder / reviewer / coworker survive the partial.
    expect(useAgentStore.getState().roster.planner).toBe('gemma-3-27b')
    expect(useAgentStore.getState().roster.coder).toBe('deepseek-v4-flash')
    expect(useAgentStore.getState().roster.reviewer).toBe('deepseek-v4-pro')
    expect(useAgentStore.getState().roster.coworker).toBe('qwen3-coder-plus')
  })
})
