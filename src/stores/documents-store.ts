import { create } from 'zustand'
import type { ConversationDocument, DocumentAttachment } from '@/lib/types'

// Per-conversation cache of every DocumentAttachment the model has emitted
// via `create_document`. Backs the right-sidebar Documents view inside
// ArtifactsPanel and stays in sync via the `chat:document-created` event
// already broadcast by main. Mirroring chat-store's pattern: one map keyed
// by conversationId so opening a different chat shows that chat's docs
// without re-fetching every time.

interface DocumentsState {
  /** Keyed by conversationId. Empty array means "loaded, no docs"; missing
   *  entry means "never loaded". */
  byConv: Record<string, ConversationDocument[]>
  /** Conversations currently fetching from `window.api.documents.list`. The
   *  panel renders a subtle skeleton when the active conv is in this set. */
  loading: Set<string>

  /** Pull the full list for the conversation. Cached after the first call;
   *  re-call to force a refresh (e.g. after the live event indicates a doc
   *  arrived but the panel was mounted later). */
  load: (conversationId: string) => Promise<void>
  /** Append one document to the cache. Called from the live IPC subscription
   *  in useChat the moment a `create_document` tool returns. Idempotent —
   *  duplicates by id are dropped. The `messageId` is unknown at live-event
   *  time (the assistant row is persisted later in the turn), so we tag the
   *  pending doc with a sentinel that `load` overwrites once the row lands. */
  appendLive: (conversationId: string, doc: DocumentAttachment) => void
  /** Wipe the cache for a conversation. Called when the conversation is
   *  deleted so a future create with the same id starts fresh. */
  clear: (conversationId: string) => void
  /** Drop the entire cache. Called on app reset / sign out. */
  reset: () => void
}

const PENDING_MESSAGE_ID = '__pending__'

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  byConv: {},
  loading: new Set(),

  load: async (conversationId: string) => {
    if (!conversationId) return
    if (!window.api?.documents?.list) {
      // Renderer outside Electron (browser dev) — leave the cache empty so
      // the panel renders its empty state instead of crashing.
      set((s) => ({ byConv: { ...s.byConv, [conversationId]: [] } }))
      return
    }
    const loading = new Set(get().loading)
    loading.add(conversationId)
    set({ loading })
    try {
      const res = await window.api.documents.list(conversationId)
      if (res?.success) {
        const docs = (res.data as ConversationDocument[]) ?? []
        set((s) => ({ byConv: { ...s.byConv, [conversationId]: docs } }))
      }
    } finally {
      const nextLoading = new Set(get().loading)
      nextLoading.delete(conversationId)
      set({ loading: nextLoading })
    }
  },

  appendLive: (conversationId: string, doc: DocumentAttachment) => {
    if (!conversationId || !doc?.id) return
    set((s) => {
      const existing = s.byConv[conversationId] ?? []
      if (existing.some((d) => d.id === doc.id)) return s
      const annotated: ConversationDocument = {
        ...doc,
        messageId: PENDING_MESSAGE_ID,
        messageCreatedAt: doc.createdAt
      }
      return { byConv: { ...s.byConv, [conversationId]: [...existing, annotated] } }
    })
  },

  clear: (conversationId: string) => {
    set((s) => {
      const next = { ...s.byConv }
      delete next[conversationId]
      return { byConv: next }
    })
  },

  reset: () => set({ byConv: {}, loading: new Set() })
}))
