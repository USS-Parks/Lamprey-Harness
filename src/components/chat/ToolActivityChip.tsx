import { PopoverMenu } from '@/components/ui/PopoverMenu'
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
  const owner = useChatStore(s => s.activeConversationId)
  const loading = useChatStore(s => s.toolHistoryLoading)
  const error = useChatStore(s => s.toolHistoryError)
  const refresh = useChatStore(s => s.refreshToolHistory)
  const [expansions, setExpansions] = useState<Record<string, boolean>>({})
  const changeExpansion = (id: string, expanded: boolean) => setExpansions(state => ({ ...state, [id]: expanded }))
  const toolCalls = useChatStore((s) => s.toolCalls)
  const followUps = useChatStore((s) => s.followUps)

  // Filter UX-shim tools the descriptor flagged as transcriptHidden — the
  // chip is for inspectable work calls, not modal/banner side effects.
  const visible = useMemo(() => toolCalls.filter((tc) => !tc.transcriptHidden), [toolCalls])
  const followUpActivity = useMemo(() => presentFollowUpActivity(followUps), [followUps])

  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const prevCountRef = useRef(0)

  useEffect(() => { setOpen(false); prevCountRef.current = 0 }, [owner])

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
  const unknown = loading || !!error || visible.some(tc => tc.status === 'unknown')
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
    <div className="relative ml-auto">
      <button
        ref={anchorRef}
        aria-label="Tool activity"
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
        <StatusDot running={running} errored={errored} isEmpty={isEmpty} unknown={unknown} />
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

      <PopoverMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="top-end" width={520} role="dialog" ariaLabel="Turn activity" autoFocus>
        <div className="flex max-h-[60vh] flex-col overflow-hidden">
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
          <div className="flex-1 overflow-y-auto px-2 py-1" data-tool-history-scroll>
            {loading && <p role="status" className="p-2 text-xs">Loading stored outcomes...</p>}
            {error && <p role="alert" className="p-2 text-xs text-[var(--error)]">{error} <button className="min-h-8 underline" onClick={() => void refresh()}>Retry history</button></p>}
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
                {grouped.map((item) => {
                  if (item.kind === 'group') {
                    return <ToolUseGroup key={`group:${item.items[0].callId}`} group={item} expansions={expansions} onExpansionChange={changeExpansion} />
                  }
                  const tc = item.toolCall
                  return tc.toolName === 'multi_agent_run' ? (
                    <MultiAgentRunCard key={tc.callId} toolCall={tc} />
                  ) : (
                    <ToolUseCard key={tc.callId} toolCall={tc} expansion={expansions[tc.callId]} onExpansionChange={value => changeExpansion(tc.callId, value)} />
                  )
                })}
              </>
            )}
          </div>
        </div>
      </PopoverMenu>
    </div>
  )
}

function StatusDot({
  running,
  errored,
  isEmpty,
  unknown
}: {
  running: boolean
  errored: boolean
  isEmpty: boolean
  unknown: boolean
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
  if (unknown) return <span className="inline-block h-2 w-2 rounded-full bg-[var(--text-muted)]" aria-label="tool outcomes unavailable" />
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-[var(--success)]"
      aria-label="tools succeeded"
    />
  )
}
