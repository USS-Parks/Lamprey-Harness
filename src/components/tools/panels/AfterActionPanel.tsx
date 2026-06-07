import { useEffect, useMemo, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type {
  AfterActionCauseSeverity,
  AfterActionReport,
  AfterActionTimelineItem,
  AfterActionToolItem
} from '@/lib/types'

interface IpcEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number') return ''
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  const rem = Math.round(seconds % 60)
  return `${minutes}m ${rem}s`
}

function SeverityDot({ severity }: { severity: AfterActionCauseSeverity | string }) {
  const tone =
    severity === 'error'
      ? 'bg-[var(--error)]'
      : severity === 'warning'
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--accent)]'
  return <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${tone}`} />
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1">
      <div className="font-mono text-[15px] text-[var(--text-primary)]">{value}</div>
      <div className="truncate text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
    </div>
  )
}

function TimelineRow({ item }: { item: AfterActionTimelineItem }) {
  return (
    <li className="flex gap-2 border-b border-[var(--panel-border)] px-3 py-2 last:border-b-0">
      <SeverityDot severity={item.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {formatTime(item.at)}
          </span>
          <span className="truncate font-mono text-[10px] text-[var(--text-secondary)]">
            {item.type}
          </span>
        </div>
        <div className="mt-0.5 break-words text-[12px] leading-snug text-[var(--text-secondary)]">
          {item.summary}
        </div>
      </div>
    </li>
  )
}

function ToolRow({ tool }: { tool: AfterActionToolItem }) {
  const statusTone =
    tool.status === 'error'
      ? 'text-[var(--error)]'
      : tool.status === 'denied'
        ? 'text-[var(--warning)]'
        : 'text-[var(--success)]'
  return (
    <li className="border-b border-[var(--panel-border)] px-3 py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
          {tool.name}
        </span>
        <span className={`ml-auto shrink-0 font-mono text-[10px] ${statusTone}`}>
          {tool.status}
        </span>
        {tool.durationMs !== undefined && (
          <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
            {formatDuration(tool.durationMs)}
          </span>
        )}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]">
        {tool.argsPreview || '{}'}
      </div>
      {(tool.errorPreview || tool.resultPreview) && (
        <div
          className={`mt-1 line-clamp-2 text-[11px] leading-snug ${
            tool.errorPreview ? 'text-[var(--error)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          {tool.errorPreview || tool.resultPreview}
        </div>
      )}
    </li>
  )
}

export function AfterActionPanel(): React.ReactElement {
  const conversationId = useChatStore((s) => s.activeConversationId)
  const [report, setReport] = useState<AfterActionReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!conversationId) {
      setReport(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = (await window.api.afterAction.get(
        conversationId
      )) as IpcEnvelope<AfterActionReport>
      if (result.success && result.data) {
        setReport(result.data)
      } else {
        setReport(null)
        setError(result.error ?? 'Could not build after-action report')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [conversationId])

  const counts = report?.counts
  const countRows = useMemo(
    () =>
      counts
        ? [
            ['Messages', counts.messages],
            ['Prompts', counts.userPrompts],
            ['Assistant', counts.assistantTurns],
            ['Empty', counts.emptyAssistantTurns],
            ['Tool turns', counts.toolRequestTurns],
            ['Tool errors', counts.toolErrors],
            ['Chat errors', counts.chatErrors],
            ['Events', counts.events]
          ] as Array<[string, number]>
        : [],
    [counts]
  )

  if (!conversationId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-[var(--text-muted)]">
        Open a conversation to view its after-action report.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--panel-border)] px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
          {report?.title ?? 'After-action report'}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {error && (
          <div className="rounded-md border border-[var(--error)]/40 bg-[var(--bg-primary)] px-3 py-2 text-[12px] text-[var(--error)]">
            {error}
          </div>
        )}

        {!report && !error && (
          <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--text-muted)]">
            {loading ? 'Building report...' : 'No report available.'}
          </div>
        )}

        {report && (
          <>
            <section>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Signals
              </div>
              <ul className="overflow-hidden rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)]">
                {report.causes.map((cause) => (
                  <li
                    key={`${cause.title}-${cause.detail}`}
                    className="flex gap-2 border-b border-[var(--panel-border)] px-3 py-2 last:border-b-0"
                  >
                    <SeverityDot severity={cause.severity} />
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-[var(--text-primary)]">
                        {cause.title}
                      </div>
                      <div className="mt-0.5 text-[12px] leading-snug text-[var(--text-secondary)]">
                        {cause.detail}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Counts
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {countRows.map(([label, value]) => (
                  <CountPill key={label} label={label} value={value} />
                ))}
              </div>
            </section>

            {(report.latestUserPrompt || report.latestAssistantText) && (
              <section>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  Last visible context
                </div>
                <div className="space-y-1.5">
                  {report.latestUserPrompt && (
                    <div className="rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] px-3 py-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        User
                      </div>
                      <div className="mt-1 text-[12px] leading-snug text-[var(--text-secondary)]">
                        {report.latestUserPrompt}
                      </div>
                    </div>
                  )}
                  {report.latestAssistantText && (
                    <div className="rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)] px-3 py-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        Assistant
                      </div>
                      <div className="mt-1 text-[12px] leading-snug text-[var(--text-secondary)]">
                        {report.latestAssistantText}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {report.recentTools.length > 0 && (
              <section>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  Recent tools
                </div>
                <ul className="overflow-hidden rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)]">
                  {report.recentTools.slice(0, 16).map((tool) => (
                    <ToolRow key={tool.id} tool={tool} />
                  ))}
                </ul>
              </section>
            )}

            {report.timeline.length > 0 && (
              <section>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  Timeline
                </div>
                <ul className="overflow-hidden rounded-md border border-[var(--panel-border)] bg-[var(--bg-primary)]">
                  {report.timeline.slice(-40).map((item) => (
                    <TimelineRow key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
