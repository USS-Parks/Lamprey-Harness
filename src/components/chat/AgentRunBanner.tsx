import { useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useInlineApprovalsStore } from '@/stores/inline-approvals-store'
import { useUiStore } from '@/stores/ui-store'
import { currentTaskStatus } from '@/lib/current-task-status'
import type { ToolApprovalRequest } from '@/lib/types'
import { StreamStatusLine } from './StreamStatusLine'
import { TokenTicker } from './TokenTicker'
import { StatusLine } from '@/components/layout/StatusLine'

export function AgentRunBanner({ modalApprovals = [] }: { modalApprovals?: ToolApprovalRequest[] }) {
  const owner = useChatStore(s => s.activeConversationId)
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [owner])
  const state = useChatStore(s => owner ? s.turnControlByConversation[owner] : undefined)
  const sending = useChatStore(s => s.isStreaming)
  const phase = useChatStore(s => s.runPhase)
  const inline = useInlineApprovalsStore(s => s.queue)
  const approvalCount = new Set([...modalApprovals, ...inline].filter(request => request.conversationId === owner).map(request => request.callId)).size
  const status = currentTaskStatus({ owner, state, sending, phase, approvalCount })
  const color = { muted: 'var(--text-muted)', active: 'var(--accent)', attention: 'var(--warning,#b7791f)', error: 'var(--error)', success: 'var(--success)' }[status.tone]
  return <details key={owner ?? 'new'} onToggle={event => setOpen(event.currentTarget.open)} className="mb-2 text-xs text-[var(--text-secondary)]">
    <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded px-1 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span role="status" data-task-status={status.label} aria-live="polite" style={{ color }}>{status.label}</span>
      <span className="ml-auto text-[var(--text-muted)]">Details</span>
    </summary>
    {open && <div className="max-h-48 overflow-y-auto rounded border border-[var(--panel-border)] p-2">
      {state?.hydrationError && <p role="alert">{state.hydrationError} <button className="min-h-8 underline" onClick={() => { if (owner) void useChatStore.getState().hydrateTurnControl(owner) }}>Retry status</button></p>}
      <TaskDiagnostics />
      <div className="flex flex-wrap gap-2">
        <button className="min-h-8 underline" onClick={() => useUiStore.getState().setActiveTool('plan')}>Plan and progress</button>
        <button className="min-h-8 underline" onClick={() => useUiStore.getState().setActiveTool('afterAction')}>After action</button>
        <button className="min-h-8 underline" onClick={() => useUiStore.getState().setActiveTool('background')}>Background work</button>
      </div>
    </div>}
  </details>
}

function TaskDiagnostics() {
  const startedAt = useChatStore(s => s.streamStartedAt)
  const content = useChatStore(s => s.streamingContent)
  const reasoning = useChatStore(s => s.streamingReasoning)
  return <>
    <StreamStatusLine startedAt={startedAt} content={content} reasoning={reasoning} />
    <TokenTicker />
    <StatusLine />
  </>
}
