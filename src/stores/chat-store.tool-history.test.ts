import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useChatStore } from './chat-store'
import type { LampreyToolCall } from '@/lib/types'
const row: LampreyToolCall = { id: 'call', name: 'shell_command', toolId: 'shell_command', conversationId: 'owner', args: {}, startedAt: 1, status: 'done' }
beforeEach(() => useChatStore.setState({ activeConversationId: 'owner', messages: [], toolCalls: [], activeTurn: null, toolHistoryLoading: false, toolHistoryError: null }))
afterEach(() => vi.unstubAllGlobals())
it('ignores an older same-task history response', async () => {
  let resolve!: (value: { success: boolean; data: LampreyToolCall[] }) => void
  const first = new Promise<{ success: boolean; data: LampreyToolCall[] }>(done => { resolve = done })
  const getCallsForConversation = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({ success: true, data: [{ ...row, status: 'error' }] })
  vi.stubGlobal('window', { api: { tools: { getCallsForConversation } } })
  const old = useChatStore.getState().refreshToolHistory()
  await useChatStore.getState().refreshToolHistory()
  resolve({ success: true, data: [row] }); await old
  expect(useChatStore.getState().toolCalls[0].status).toBe('error')
})
it('does not apply another task history after selection changes', async () => {
  let resolve!: (value: { success: boolean; data: LampreyToolCall[] }) => void
  vi.stubGlobal('window', { api: { tools: { getCallsForConversation: () => new Promise(done => { resolve = done }) } } })
  const pending = useChatStore.getState().refreshToolHistory()
  useChatStore.setState({ activeConversationId: 'other' })
  resolve({ success: true, data: [row] }); await pending
  expect(useChatStore.getState().toolCalls).toEqual([])
})
it('reports failed storage reads while preserving inspectable content', async () => {
  vi.stubGlobal('window', { api: { tools: { getCallsForConversation: vi.fn().mockRejectedValue(new Error('disk failed')) } } })
  await useChatStore.getState().refreshToolHistory()
  expect(useChatStore.getState()).toMatchObject({ toolHistoryLoading: false, toolHistoryError: 'disk failed' })
})
