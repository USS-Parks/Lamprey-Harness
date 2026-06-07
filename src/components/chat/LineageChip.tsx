import { useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type { Conversation } from '@/lib/types'

export function LineageChip() {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const [lineage, setLineage] = useState<Conversation[] | null>(null)
  const active = conversations.find((c) => c.id === activeConversationId)
  if (!active?.forkedFromId) return null

  const source = conversations.find((c) => c.id === active.forkedFromId)
  const sourceTitle = source?.title ?? active.forkedFromId.slice(0, 8)

  const showLineage = async () => {
    if (lineage) {
      setLineage(null)
      return
    }
    const res = await window.api.conversation.lineage(active.id)
    if (res.success) setLineage(res.data as Conversation[])
  }

  return (
    <div className="border-b border-[var(--panel-border)] px-6 py-2 text-xs text-[var(--text-secondary)]">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2">
        <button
          type="button"
          onClick={() => selectConversation(active.forkedFromId!)}
          className="rounded bg-[var(--bg-tertiary)] px-2 py-1 hover:text-[var(--accent)]"
        >
          Forked from: {sourceTitle}
        </button>
        <button
          type="button"
          onClick={showLineage}
          className="rounded px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
          Lineage
        </button>
        {lineage && lineage.length > 0 && (
          <span className="truncate text-[var(--text-muted)]">
            {lineage.map((c) => c.title).join(' / ')}
          </span>
        )}
      </div>
    </div>
  )
}
