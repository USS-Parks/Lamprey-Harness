import { useChatStore } from './chat-store'
import { reconcileTaskRows } from '@/lib/task-navigation'
import { create } from 'zustand'
import { toast } from '@/stores/toast-store'
import type { Conversation } from '@/lib/types'

// Renderer-side store for the cross-session Sessions sidebar (E3).
//
// Owns the active tab (recent/pinned/archived), the search query, the
// paged list, and the archive/pin mutations. Hits the new `sessions.*`
// preload methods. The legacy `conversation.*` store stays untouched
// for the chat surface; this store is a parallel view.

export type SessionsTab = 'recent' | 'pinned' | 'archived'

export type SessionEntry = Conversation

export interface SessionSearchHit {
  conversationId: string
  source: 'conversation' | 'message'
  messageId: string | null
  snippet: string
  rank: number
}

const PAGE_SIZE = 50

// JM-22 (RD-12) — search sequencing + debounce. setQuery fired a request per
// keystroke with no ordering, so a slower earlier response could resolve last
// and overwrite the newer query's results. A monotonic token discards stale
// resolutions; a short debounce coalesces bursts of keystrokes.
let loadSeq = 0
let queryDebounce: ReturnType<typeof setTimeout> | null = null
const QUERY_DEBOUNCE_MS = 180
const PIN_ORDER_KEY = 'lamprey.sessions.pinOrder'

interface SessionsState {
  tab: SessionsTab
  query: string
  projectId: string | null | undefined
  error: string | null
  entries: SessionEntry[]
  hits: SessionSearchHit[]
  loading: boolean
  page: number
  hasMore: boolean
  unreadAgentResults: Record<string, number>
  pinOrder: string[]

  setTab: (tab: SessionsTab) => void
  setQuery: (query: string) => void
  setProject: (projectId: string | null | undefined) => void
  loadFirstPage: () => Promise<void>
  loadMore: () => Promise<void>
  archive: (id: string, archived: boolean) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
  duplicate: (id: string) => Promise<string | null>
  deleteSession: (id: string) => Promise<void>
  markUnreadAgentResult: (conversationId: string) => void
  clearUnread: (conversationId: string) => void
  reorderPinned: (orderedIds: string[]) => void
}

function getApi():
  | {
      sessions?: {
        list: (opts: {
          tab: SessionsTab
          projectId?: string | null
          query?: string
          limit?: number
          offset?: number
        }) => Promise<{ success: boolean; data?: SessionEntry[]; error?: string }>
        archive: (id: string, archived: boolean) => Promise<{ success: boolean; error?: string }>
        setPinned: (id: string, pinned: boolean) => Promise<{ success: boolean; error?: string }>
        search: (
          query: string,
          limit?: number,
          opts?: { tab?: SessionsTab; projectId?: string | null }
        ) => Promise<{ success: boolean; data?: SessionSearchHit[]; error?: string }>
      }
      conversation?: {
        fork: (id: string) => Promise<{ success: boolean; data?: SessionEntry; error?: string }>
        delete: (id: string) => Promise<{ success: boolean; error?: string }>
      }
    }
  | null {
  return (window as any).api ?? null
}

function readPinOrder(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage?.getItem(PIN_ORDER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writePinOrder(order: string[]): void {
  try {
    window.localStorage?.setItem(PIN_ORDER_KEY, JSON.stringify(order))
  } catch {
    // ignore unavailable storage
  }
}

function applyPinnedOrder(entries: SessionEntry[], order: string[]): SessionEntry[] {
  if (order.length === 0) return entries
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...entries].sort((a, b) => {
    const ar = rank.get(a.id)
    const br = rank.get(b.id)
    if (ar === undefined && br === undefined) return 0
    if (ar === undefined) return 1
    if (br === undefined) return -1
    return ar - br
  })
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  tab: 'recent',
  query: '',
  projectId: undefined,
  error: null,
  entries: [],
  hits: [],
  loading: false,
  page: 0,
  hasMore: true,
  unreadAgentResults: {},
  pinOrder: readPinOrder(),

  setTab: (tab) => {
    if (get().tab === tab) return
    if (queryDebounce) clearTimeout(queryDebounce)
    set({ tab })
    void get().loadFirstPage()
  },
  setProject: projectId => {
    if (queryDebounce) clearTimeout(queryDebounce)
    set({ projectId })
    void get().loadFirstPage()
  },
  setQuery: query => {
    ++loadSeq
    set({ query, page: 0, hasMore: true, entries: [], hits: [], error: null, loading: true })
    if (queryDebounce) clearTimeout(queryDebounce)
    queryDebounce = setTimeout(() => { queryDebounce = null; void get().loadFirstPage() }, QUERY_DEBOUNCE_MS)
  },
  loadFirstPage: async () => {
    const seq = ++loadSeq
    const api = getApi()?.sessions
    set({ loading: true, page: 0, entries: [], hits: [], error: null })
    const { tab, query, projectId } = get()
    try {
      if (!api) throw new Error('Task search unavailable')
      const [res, hitsRes] = await Promise.all([
        api.list({ tab, query: query || undefined, projectId, limit: PAGE_SIZE, offset: 0 }),
        query.trim() ? api.search(query.trim(), PAGE_SIZE, { tab, projectId }) : Promise.resolve({ success: true, data: [] })
      ])
      if (seq !== loadSeq) return
      if (!res.success) throw new Error(res.error || 'Could not load tasks')
      if (!hitsRes.success) throw new Error('Could not search task history')
      const raw = res.data ?? []
      set({ loading: false, entries: tab === 'pinned' ? applyPinnedOrder(raw, get().pinOrder) : raw, hits: hitsRes.data ?? [], page: 1, hasMore: raw.length === PAGE_SIZE })
    } catch (error) {
      if (seq === loadSeq) set({ loading: false, error: String(error), hasMore: false })
    }
  },
  loadMore: async () => {
    const api = getApi()?.sessions
    const { tab, query, projectId, page, loading, hasMore } = get()
    if (!api || loading || !hasMore) return
    const seq = loadSeq
    set({ loading: true, error: null })
    try {
      const res = await api.list({ tab, query: query || undefined, projectId, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      if (seq !== loadSeq) return
      if (!res.success) throw new Error(res.error || 'Could not load more tasks')
      const next = res.data ?? []
      const rows = reconcileTaskRows([...get().entries, ...next])
      set({ loading: false, entries: tab === 'pinned' ? applyPinnedOrder(rows, get().pinOrder) : rows, page: page + 1, hasMore: next.length === PAGE_SIZE })
    } catch (error) {
      if (seq === loadSeq) set({ loading: false, error: String(error) })
    }
  },

  archive: async (id, archived) => {
    const api = getApi()?.sessions
    if (!api) return
    const res = await api.archive(id, archived)
    if (!res.success) {
      toast.error(`Failed to archive: ${res.error}`)
      return
    }
    await Promise.all([get().loadFirstPage(), useChatStore.getState().loadConversations()])
  },

  setPinned: async (id, pinned) => {
    const api = getApi()?.sessions
    if (!api) return
    const res = await api.setPinned(id, pinned)
    if (!res.success) {
      toast.error(`Failed to pin: ${res.error}`)
      return
    }
    await Promise.all([get().loadFirstPage(), useChatStore.getState().loadConversations()])
  },

  duplicate: async (id) => {
    const api = getApi()?.conversation
    if (!api) return null
    const res = await api.fork(id)
    if (!res.success || !res.data) {
      toast.error(`Failed to duplicate: ${res.error}`)
      return null
    }
    await Promise.all([get().loadFirstPage(), useChatStore.getState().loadConversations()])
    // JM-22 (RD-2) — conversation:fork returns { conversationId }; reading
    // .id here silently returned undefined so Duplicate never navigated.
    return (res.data as unknown as { conversationId: string }).conversationId
  },

  deleteSession: async id => {
    await useChatStore.getState().deleteConversation(id)
    await get().loadFirstPage()
  },

  markUnreadAgentResult: (conversationId) => {
    set((state) => ({
      unreadAgentResults: {
        ...state.unreadAgentResults,
        [conversationId]: (state.unreadAgentResults[conversationId] ?? 0) + 1
      }
    }))
  },

  clearUnread: (conversationId) => {
    set((state) => {
      if (!state.unreadAgentResults[conversationId]) return state
      const next = { ...state.unreadAgentResults }
      delete next[conversationId]
      return { unreadAgentResults: next }
    })
  },

  reorderPinned: (orderedIds) => {
    const visible = new Set(orderedIds)
    const queue = [...orderedIds]
    const merged = get().pinOrder.map(id => visible.has(id) ? queue.shift()! : id)
    merged.push(...queue)
    const order = [...new Set(merged)]
    writePinOrder(order)
    set((state) => ({
      pinOrder: order,
      entries: state.tab === 'pinned' ? applyPinnedOrder(state.entries, order) : state.entries
    }))
  }
}))
