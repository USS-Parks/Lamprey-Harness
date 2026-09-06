import { useChatStore } from '@/stores/chat-store'
import { useInlineNoticesStore } from '@/stores/inline-notices-store'
import { toast } from '@/stores/toast-store'
export function presentAsyncNotification(event: unknown): void {
  if (!event || typeof event !== 'object') return
  const e = event as Record<string, unknown>
  if (typeof e.id !== 'string' || !e.id) return
  const notices = useInlineNoticesStore.getState()
  if (!notices.acceptEvent(e.id)) return
  const title = typeof e.title === 'string' && e.title.trim() ? e.title.trim() : 'Background update'
  const message = typeof e.message === 'string' && e.message.trim() ? e.message.trim() : 'Ready for the next turn'
  const owner = typeof e.conversationId === 'string' ? e.conversationId : null
  if (owner) notices.push({ id: e.id, conversationId: owner, title, message, ts: typeof e.createdAt === 'number' ? e.createdAt : Date.now() })
  if (!owner || owner !== useChatStore.getState().activeConversationId) toast.info(`${title}: ${message}`, 6000)
}
