import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useActivityStore, type AgentRunSnapshot } from './activity-store'
const agent: AgentRunSnapshot = { id: 'agent', parentConvId: 'owner', parentRunId: null, agentType: 'coder', label: 'Work', status: 'error', startedAt: 1, finishedAt: 2, resultText: null, error: 'failed', worktreePath: null, background: true }
beforeEach(() => useActivityStore.setState({ agentRuns: [agent], error: null, readIds: [] }))
afterEach(() => vi.unstubAllGlobals())
it('preserves known activity and exposes failed reads', async () => {
  vi.stubGlobal('window', { api: { tasks: { list: vi.fn().mockResolvedValue({ success: false, error: 'storage unavailable' }) } } })
  await useActivityStore.getState().refreshAgents()
  expect(useActivityStore.getState().agentRuns).toEqual([agent])
  expect(useActivityStore.getState().error).toBe('storage unavailable')
})
it('marks only read identity without mutating the operational result', () => {
  vi.stubGlobal('window', { localStorage: { setItem: vi.fn() } })
  useActivityStore.getState().markRead('agent:agent')
  expect(useActivityStore.getState().agentRuns[0].status).toBe('error')
  expect(useActivityStore.getState().readIds).toEqual(['agent:agent'])
})
