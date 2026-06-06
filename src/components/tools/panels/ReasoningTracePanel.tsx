import { useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type { Message, StageMetric } from '@/lib/types'

// RT5 — Reasoning-Trace Viewer panel (shell). Lists every assistant turn in
// the active conversation with its model + total tokens + stage count, and
// emits an `onSelect` placeholder that RT6 will hook into for per-stage
// expansion + search + filter chips. Data source: `conversation:getMessages`
// (existing IPC) + `conversation:listStageMetrics` (new in RT3) per assistant
// row. Browser-dev guard: render an empty-state hint if `window.api` is
// absent.

interface TurnRow {
  message: Message
  metrics: StageMetric[]
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '–'
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function ReasoningTracePanel(): React.ReactElement {
  const conversationId = useChatStore((s) => s.activeConversationId)
  const [rows, setRows] = useState<TurnRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!conversationId) {
      setRows([])
      return
    }
    const api = typeof window !== 'undefined' ? window.api : undefined
    if (!api?.conversation?.getMessages) {
      setRows([])
      setError('window.api unavailable')
      return
    }
    let cancelled = false
    async function load(): Promise<void> {
      const msgRes = await api!.conversation.getMessages(conversationId!)
      if (cancelled) return
      if (!msgRes?.success || !Array.isArray(msgRes.data)) {
        setError(msgRes?.error ?? 'Failed to load messages')
        setRows([])
        return
      }
      const messages = msgRes.data as Message[]
      const assistantMessages = messages.filter((m) => m.role === 'assistant')
      const enriched: TurnRow[] = []
      for (const m of assistantMessages) {
        let metrics: StageMetric[] = []
        const metricsRes = await api!.conversation.listStageMetrics(m.id)
        if (metricsRes?.success && Array.isArray(metricsRes.data)) {
          metrics = metricsRes.data as StageMetric[]
        }
        enriched.push({ message: m, metrics })
      }
      if (!cancelled) setRows(enriched)
    }
    void load().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err))
        setRows([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  if (!conversationId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-[12px] text-[var(--text-muted)]">
        Open a conversation to see its reasoning trace.
      </div>
    )
  }

  if (rows === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-[12px] text-[var(--text-muted)]">
        Loading reasoning trace…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-[var(--text-muted)]">
        No reasoning yet — start a conversation to populate this view.
        {error && (
          <div className="mt-2 text-[11px] text-[var(--danger,#ef4444)]">{error}</div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-[var(--panel-border)] px-3 py-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
        {rows.length} assistant turn{rows.length === 1 ? '' : 's'}
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        <ul className="space-y-1.5">
          {rows.map((row, idx) => {
            const totalTokens = row.metrics.reduce(
              (n, m) => n + (m.completionTokens ?? 0),
              0
            )
            const stageCount = row.metrics.length
            const isSelected = selectedId === row.message.id
            return (
              <li key={row.message.id}>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedId(isSelected ? null : row.message.id)
                  }
                  className={`w-full rounded-lg border border-[var(--panel-border)] bg-[var(--bg-primary)] p-2.5 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] ${
                    isSelected ? 'ring-1 ring-[var(--accent)]' : ''
                  }`}
                  aria-label={`Turn ${idx + 1}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      #{idx + 1}
                    </span>
                    <span className="text-[12px] text-[var(--text-primary)]">
                      {row.message.model ?? 'unknown'}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">
                      {formatTime(row.message.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span>{stageCount} stage{stageCount === 1 ? '' : 's'}</span>
                    <span aria-hidden>·</span>
                    <span>~{formatTokens(totalTokens)} tokens</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
