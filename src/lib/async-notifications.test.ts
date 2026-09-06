import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { presentAsyncNotification } from './async-notifications'
import { useInlineNoticesStore } from '@/stores/inline-notices-store'
import { useToastStore } from '@/stores/toast-store'
import { useChatStore } from '@/stores/chat-store'
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout: vi.fn() })
  useChatStore.setState({ activeConversationId: 'active' })
  useInlineNoticesStore.setState({ byConv: {}, seenIds: [] })
  useToastStore.setState({ toasts: [], history: [] })
})
afterEach(() => vi.unstubAllGlobals())
it('presents one off-task toast and retains its task history on repeated delivery', () => {
  const event = { id: 'event', conversationId: 'other', title: 'Done', message: 'Work completed', createdAt: 1 }
  presentAsyncNotification(event); presentAsyncNotification(event)
  expect(useToastStore.getState().toasts).toHaveLength(1)
  expect(useInlineNoticesStore.getState().byConv.other).toHaveLength(1)
  useToastStore.getState().clear(); useInlineNoticesStore.getState().dismiss('other', 'event')
  presentAsyncNotification(event)
  expect(useToastStore.getState().toasts).toHaveLength(0)
  expect(useToastStore.getState().history).toHaveLength(1)
})
it('uses inline presentation for an active task without a duplicate toast', () => {
  presentAsyncNotification({ id: 'event', conversationId: 'active', title: 'Done', createdAt: 1 })
  expect(useInlineNoticesStore.getState().byConv.active).toHaveLength(1)
  expect(useToastStore.getState().toasts).toHaveLength(0)
})
it('coalesces simultaneous identical toasts but preserves distinct severities', () => {
  const store = useToastStore.getState()
  expect(store.show('error', 'Failure')).toBe(store.show('error', 'Failure'))
  store.show('warning', 'Failure')
  expect(useToastStore.getState().toasts).toHaveLength(2)
})
