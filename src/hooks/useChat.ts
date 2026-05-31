import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useAgentStore } from '@/stores/agent-store'
import type { AgentStatusEvent } from '@/lib/types'

export function useChat(): void {
  useEffect(() => {
    if (!window.api) return

    // Chunks can arrive faster than React can render — every chunk re-renders
    // MessageList, reparses markdown, and reflows. That backs up the main
    // thread and starves click handlers (e.g. sidebar collapse goes
    // unresponsive). Coalesce all chunks that land within a single animation
    // frame into one store update so we re-render at most ~60×/sec.
    let pendingChunk = ''
    let rafHandle: number | null = null

    const flushPending = () => {
      rafHandle = null
      if (!pendingChunk) return
      const buf = pendingChunk
      pendingChunk = ''
      useChatStore.getState().appendStreamChunk(buf)
    }

    const queueChunk = (content: string) => {
      pendingChunk += content
      if (rafHandle === null) {
        rafHandle = requestAnimationFrame(flushPending)
      }
    }

    const flushNow = () => {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle)
        rafHandle = null
      }
      if (pendingChunk) {
        const buf = pendingChunk
        pendingChunk = ''
        useChatStore.getState().appendStreamChunk(buf)
      }
    }

    // Filter all incoming chat events by the active conversation so that
    // side-chat panels (which run their own conversation in parallel) don't
    // leak chunks into the main thread's UI state.
    const matchesActive = (e: { conversationId?: string }) =>
      e?.conversationId === useChatStore.getState().activeConversationId

    window.api.chat.onChunk((e) => {
      if (!matchesActive(e)) return
      queueChunk(e.content)
    })

    window.api.chat.onDone((e) => {
      if (!matchesActive(e as { conversationId?: string })) return
      flushNow()
      useChatStore.getState().finishStream(e.message as any)
      useAgentStore.getState().clearRun()
    })

    window.api.chat.onError((e) => {
      if (!matchesActive(e)) return
      flushNow()
      useChatStore.getState().streamError(e.error)
      useAgentStore.getState().clearRun()
    })

    window.api.chat.onToolCall((e) => {
      if (!matchesActive(e as { conversationId?: string })) return
      useChatStore.getState().addToolCall(e as any)
    })

    window.api.chat.onToolCallResult((e) => {
      if (!matchesActive(e as { conversationId?: string })) return
      useChatStore.getState().updateToolCall(e as any)
    })

    const onAgentStatus = window.api.chat.onAgentStatus
    if (onAgentStatus) {
      onAgentStatus((e: unknown) => {
        useAgentStore.getState().recordStatus(e as AgentStatusEvent)
      })
    }

    return () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      window.api?.chat.offAll()
    }
  }, [])
}
