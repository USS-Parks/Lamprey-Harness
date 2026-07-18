import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { groupConsecutiveToolCalls } from '@/lib/tool-call-grouping'
import { ToolUseCard } from './ToolUseCard'
import { ToolUseGroup } from './ToolUseGroup'
import { MultiAgentRunCard } from './MultiAgentRunCard'
import { presentFollowUpActivity } from '@/lib/follow-up-activity'

// Unobtrusive consolidation of per-turn tool activity. Codex / Claude
// Code keep the transcript clean: tool calls don't stack as cards inside
// the conversation flow. Lamprey now does the same — when the model fires
// shell_command / workspace_context / etc., the chat panel stays silent,
// and this chip sits in the input pill row instead. Click it to pop the
// grouped list upward. The chip is permanent — it renders on every chat,
// every reopen, even on a fresh conversation with zero calls so far — so
// the user always has a single anchor for "what work has been done." The
// popover scrolls when the list grows past 60vh.

interface ToolActivityChipProps {
  // When true the popover auto-opens whenever a new call shows up. Off by
  // default — the whole point is unobtrusive. The setting lives one level
  // up so the parent can wire it to a preference without this component
  // owning storage.
  autoOpenOnActivity?: boolean
}

export function ToolActivityChip({ autoOpenOnActivity = false }: ToolActivityChipProps) {
  const toolCalls = useChatStore((s) => s.toolCalls)
  const followUps = useChatStore((s) => s.followUps)

  // Filter UX-shim tools the descriptor flagged as transcriptHidden — the
  // chip is for inspectable work calls, not modal/banner side effects.
  const visible = useMemo(() => toolCalls.filter((tc) => !tc.transcriptHidden), [toolCalls])
  const followUpActivity = useMemo(() => presentFollowUpActivity(followUps), [followUps])

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  // Click-outside dismiss. Inline implementation — useClickOutside lives
  // in ChatInput's file and isn't exported; keep this component self-
  // contained so the cross-file dependency stays one-way.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const el = wrapRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Auto-open on first new activity within a turn, opt-in.
  useEffect(() => {
    if (!autoOpenOnActivity) return
    if (visible.length > prevCountRef.current) setOpen(true)
    prevCountRef.current = visible.length
  }, [visible.length, autoOpenOnActivity])

  const isEmpty = visible.length === 0 && followUpActivity.length === 0
  const running =
    visible.some((tc) => tc.status === 'pending' || tc.status === 'running') ||
    followUpActivity.some((item) => item.status === 'accepted')
  const errored =
    visible.some((tc) => tc.status === 'error' || tc.status === 'denied') ||
    followUpActivity.some((item) => item.status === 'rejected' || item.status === 'recovered')
  const count = visible.length + followUpActivity.length

  const grouped = groupConsecutiveToolCalls(visible)

  const toneClass = isEmpty
    ? 'border-[var(--panel-border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-secondary)]'
    : running
      ? 'border-[var(--accent)] text-[var(--accent)]'
      : errored
        ? 'border-[var(--error)]/40 text-[var(--error)]'
        : 'border-[var(--panel-border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]'

  return (
    <div ref={wrapRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={
          isEmpty
            ? 'No turn activity yet — click to open the activity log'
            : `${count} activity item${count === 1 ? '' : 's'} this conversation — click to inspect`
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md border bg-[var(--bg-secondary)] px-2 py-1 text-[12px] transition-colors ${toneClass} ${
          open ? 'border-[var(--accent)] text-[var(--text-primary)]' : ''
        }`}
      >
        <StatusDot running={running} errored={errored} isEmpty={isEmpty} />
        <span className="font-mono tabular-nums leading-none">{count}</span>
        <span className="leading-none">activit{count === 1 ? 'y' : 'ies'}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* Caret-up (popover opens upward). */}
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Turn activity"
          className="absolute bottom-full right-0 z-30 mb-1 flex w-[min(520px,calc(100vw-2rem))] max-h-[60vh] flex-col overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)] shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--panel-border)] px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Turn activity · {count} item{count === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-1">
            {isEmpty ? (
              <div className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
                No turn activity in this conversation yet.
                <br />
                Tool calls and follow-up states show up here as work runs.
              </div>
            ) : (
              <>
                {followUpActivity.length > 0 && (
                  <section
                    aria-label="Follow-up activity"
                    className="border-b border-[var(--panel-border)] py-1"
                  >
                    {followUpActivity.map((item) => (
                      <div key={item.id} className="flex items-start gap-2 rounded px-2 py-1.5">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            item.status === 'accepted'
                              ? 'animate-pulse bg-[var(--accent)]'
                              : item.status === 'rejected' || item.status === 'recovered'
                                ? 'bg-[var(--warning)]'
                                : item.status === 'deleted' || item.status === 'cancelled'
                                  ? 'bg-[var(--text-muted)]'
                                  : 'bg-[var(--success)]'
                          }`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium text-[var(--text-primary)]">
                            {item.label}
                          </div>
                          <div className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                            {item.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </section>
                )}
                {grouped.map((item, idx) => {
                  if (item.kind === 'group') {
                    return <ToolUseGroup key={`g-${idx}-${item.items[0].callId}`} group={item} />
                  }
                  const tc = item.toolCall
                  return tc.toolName === 'multi_agent_run' ? (
                    <MultiAgentRunCard key={tc.callId} toolCall={tc} />
                  ) : (
                    <ToolUseCard key={tc.callId} toolCall={tc} />
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusDot({
  running,
  errored,
  isEmpty
}: {
  running: boolean
  errored: boolean
  isEmpty: boolean
}) {
  if (isEmpty) {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full border border-[var(--text-muted)]"
        aria-label="no tool activity"
      />
    )
  }
  if (running) {
    return (
      <span
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]"
        aria-label="tools running"
      />
    )
  }
  if (errored) {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-[var(--error)]"
        aria-label="tool error"
      />
    )
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-[var(--success)]"
      aria-label="tools succeeded"
    />
  )
}
