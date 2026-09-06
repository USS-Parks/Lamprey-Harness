import { useToastStore } from '@/stores/toast-store'
import { useEffect, useMemo, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useActivityStore } from '@/stores/activity-store'
import { useInlineApprovalsStore } from '@/stores/inline-approvals-store'
import { useUiStore } from '@/stores/ui-store'
import { taskAttention, type AttentionItem } from '@/lib/task-attention'
export function TaskAttention() {
  const noticeHistory = useToastStore(s => s.history)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | AttentionItem['kind']>('all')
  const [error, setError] = useState<string | null>(null)
  const approvals = useInlineApprovalsStore(s => s.queue)
  const modal = useInlineApprovalsStore(s => s.modalQueue)
  const turns = useChatStore(s => s.turnControlByConversation)
  const conversations = useChatStore(s => s.conversations)
  const agents = useActivityStore(s => s.agentRuns)
  const wakeups = useActivityStore(s => s.wakeups)
  const activityError = useActivityStore(s => s.error)
  const readIds = useActivityStore(s => s.readIds)
  const markRead = useActivityStore(s => s.markRead)
  const items = useMemo(() => taskAttention({ approvals: [...modal, ...approvals], turns, agents, wakeups, readIds }), [modal, approvals, turns, agents, wakeups, readIds])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      for (const conversation of conversations) {
        if (cancelled) return
        await useChatStore.getState().hydrateTurnControl(conversation.id)
      }
    })()
    return () => { cancelled = true }
  }, [open, conversations])
  const visit = async (item: AttentionItem) => {
    setError(null)
    try {
      if (item.owner) {
        useUiStore.getState().closeCustomize()
        useUiStore.getState().closeProjectView()
        await useChatStore.getState().selectConversation(item.owner)
      }
      if (item.destination) useUiStore.getState().setActiveTool(item.destination)
      if (item.kind === 'completion') markRead(item.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open task') }
  }
  const filtered = items.filter(item => filter === 'all' || item.kind === filter)
  return <section aria-label="Task attention" className="mx-3 mt-2 border-b border-[var(--panel-border)] pb-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex min-h-8 w-full items-center justify-between rounded px-2 text-sm hover:bg-[var(--bg-tertiary)]">
      <span>Needs attention</span><span data-attention-count>{items.length}</span>
    </button>
    {open && <div>
      <div className="flex flex-wrap gap-1" aria-label="Attention filters">
        {(['all', 'approval', 'failure', 'completion'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className="min-h-8 rounded px-2 text-xs aria-pressed:bg-[var(--bg-tertiary)]">{value === 'all' ? 'All' : value === 'approval' ? 'Approvals' : value === 'failure' ? 'Failures' : 'Unread'}</button>)}
      </div>
      {activityError && <p role="alert" className="text-xs text-[var(--error)]">{activityError} <button className="min-h-8 underline" onClick={() => void useActivityStore.getState().refresh()}>Retry activity</button></p>}
      {error && <p role="alert" className="text-xs text-[var(--error)]">{error}</p>}
      {Object.values(turns).some(state => state.hydrationError) && <p role="status" className="text-xs text-[var(--warning)]">Some task statuses are unavailable. Open the task to retry.</p>}
      <div className="max-h-64 overflow-y-auto">
        {filtered.map(item => <button key={item.id} data-attention-id={item.id} type="button" onClick={() => void visit(item)} className="block min-h-8 w-full rounded p-2 text-left hover:bg-[var(--bg-tertiary)]">
          <span className="block truncate text-xs font-medium">{item.title}</span>
          <span className="block truncate text-xs text-[var(--text-muted)]">{conversations.find(task => task.id === item.owner)?.title ?? 'Background work'} · {item.detail}</span>
        </button>)}
        {filtered.length === 0 && <p className="p-2 text-xs text-[var(--text-muted)]">Nothing in this view.</p>}
      </div>
      {noticeHistory.length > 0 && <details><summary className="min-h-8 cursor-pointer text-xs">Recent notices</summary><ol className="max-h-48 overflow-auto text-xs">{noticeHistory.map(notice => <li key={notice.id} className="border-b border-[var(--panel-border)] py-2">{notice.type}: {notice.message}</li>)}</ol></details>}
      <div className="flex flex-wrap gap-1">{(['background', 'loop', 'agents'] as const).map(tool => <button key={tool} type="button" onClick={() => useUiStore.getState().setActiveTool(tool)} className="min-h-8 rounded px-2 text-xs underline">{tool === 'background' ? 'Background' : tool === 'loop' ? 'Loops' : 'Agents'}</button>)}</div>
    </div>}
  </section>
}
