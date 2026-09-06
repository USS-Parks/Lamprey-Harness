import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('./chat-store', () => ({ useChatStore: { getState: () => ({ loadConversations: vi.fn(), deleteConversation: vi.fn() }) } }))
vi.mock('@/stores/toast-store', () => ({ toast: { error: vi.fn() } }))
import { useSessionsStore } from './sessions-store'
import { useNavHistoryStore } from './nav-history-store'
const row = (id: string) => ({ id, title: id, model: 'fixture', createdAt: 1, updatedAt: 1, messageCount: 0 })
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done }); return { promise, resolve } }
let list: ReturnType<typeof vi.fn>
let search: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers()
  list = vi.fn().mockResolvedValue({ success: true, data: [] })
  search = vi.fn().mockResolvedValue({ success: true, data: [] })
  vi.stubGlobal('window', { api: { sessions: { list, search } }, localStorage: { setItem: vi.fn() } })
  useSessionsStore.setState({ tab: 'recent', query: '', projectId: undefined, entries: [], hits: [], loading: false, page: 0, hasMore: true, pinOrder: [], error: null })
  useNavHistoryStore.getState().clear()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('invalidates old page results immediately when the query changes, before debounce fires', async () => {
  const old = deferred(); list.mockReturnValueOnce(old.promise)
  const pending = useSessionsStore.getState().loadFirstPage()
  useSessionsStore.getState().setQuery('new')
  old.resolve({ success: true, data: [row('old')] }); await pending
  expect(useSessionsStore.getState().entries).toEqual([])
  list.mockResolvedValue({ success: true, data: [row('new')] })
  await vi.advanceTimersByTimeAsync(180)
  expect(useSessionsStore.getState().entries.map(row => row.id)).toEqual(['new'])
})
it('drops pagination from an older tab and retains the new archive filter', async () => {
  useSessionsStore.setState({ entries: [row('first')], page: 1 })
  const old = deferred(); list.mockReturnValueOnce(old.promise)
  const pending = useSessionsStore.getState().loadMore()
  list.mockResolvedValue({ success: true, data: [row('archived')] })
  useSessionsStore.getState().setTab('archived'); await vi.runAllTimersAsync()
  old.resolve({ success: true, data: [row('wrong-tab')] }); await pending
  expect(useSessionsStore.getState().entries.map(row => row.id)).toEqual(['archived'])
})
it('shows search failure instead of stale snippets and supports retry', async () => {
  useSessionsStore.setState({ query: 'history' }); search.mockRejectedValueOnce(new Error('offline'))
  await useSessionsStore.getState().loadFirstPage()
  expect(useSessionsStore.getState().error).toContain('offline')
  expect(useSessionsStore.getState().hits).toEqual([])
  await useSessionsStore.getState().loadFirstPage()
  expect(useSessionsStore.getState().error).toBeNull()
})
it('passes project and archived filters to both list and historical search', async () => {
  useSessionsStore.setState({ tab: 'archived', query: 'needle', projectId: 'project' })
  await useSessionsStore.getState().loadFirstPage()
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ tab: 'archived', projectId: 'project' }))
  expect(search).toHaveBeenCalledWith('needle', 50, { tab: 'archived', projectId: 'project' })
})
it('keeps pins outside a filtered project when reordering its visible pins', () => {
  useSessionsStore.setState({ pinOrder: ['outside', 'a', 'b', 'last'] })
  useSessionsStore.getState().reorderPinned(['b', 'a'])
  expect(useSessionsStore.getState().pinOrder).toEqual(['outside', 'b', 'a', 'last'])
})
it('skips deleted history entries without duplicating a replayed destination', () => {
  const nav = useNavHistoryStore.getState()
  for (const id of ['a', 'deleted', 'c']) nav.push(id)
  nav.retain(['a', 'c']); nav.startReplay()
  expect(nav.goBack()).toBe('a'); nav.push('a'); nav.endReplay()
  expect(useNavHistoryStore.getState().stack).toEqual(['a', 'c'])
  expect(nav.goForward()).toBe('c')
})
