import { useChatStore } from '@/stores/chat-store'
import { useUiStore } from '@/stores/ui-store'
import { useEnvironment } from '@/hooks/useEnvironment'

export function TaskHeader() {
  const owner = useChatStore(s => s.activeConversationId)
  const title = useChatStore(s => s.conversations.find(task => task.id === owner)?.title)
  const { changedFileCount, loading, error, snapshot } = useEnvironment()
  if (!owner) return null
  return <header className="flex min-h-10 items-center justify-between gap-3 px-6 text-sm">
    <span className="min-w-0 truncate font-medium text-[var(--text-primary)]">{title ?? 'Task'}</span>
    <button className="min-h-8 shrink-0 rounded px-2 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]" aria-label="Review task changes" title={error ?? snapshot.cwd} onClick={() => useUiStore.getState().setActiveTool('review')}>
      {loading ? 'Changes…' : error ? 'Review unavailable' : `${changedFileCount} changed ${changedFileCount === 1 ? 'file' : 'files'}`}
    </button>
  </header>
}
