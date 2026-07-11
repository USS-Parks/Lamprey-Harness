import { useEffect, useState, useCallback } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useSettingsStore } from '@/stores/settings-store'
import { toast } from '@/stores/toast-store'

// Agentic Orchestration Phase AO-10 — the Agents inventory + kill surface. Lists
// the orchestration identities scoped to the active conversation with their
// type, grants (granted vs refused), status, live spend vs ceiling, and a Revoke
// action. Reads window.api.agents.* (gated main-side on the master toggle, so
// the list is empty when orchestration is off). Follows the LoopsPanel pattern.

interface Identity {
  id: string
  label: string
  agentType: string
  scopeKind: string
  requestedTools: string[]
  grantedTools: string[]
  status: 'pending' | 'active' | 'revoked'
  tokensCeiling: number
  wallMsCeiling: number
  tokensSpent: number
  wallMsSpent: number
  createdAt: number
  revokedAt: number | null
}

const STATUS_TONE: Record<string, string> = {
  pending: 'text-[var(--warning)]',
  active: 'text-[var(--accent)]',
  revoked: 'text-[var(--text-muted)]'
}

const BTN_DANGER =
  'rounded-md border border-[var(--panel-border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]'

function pct(spent: number, ceiling: number): number | null {
  if (!ceiling || ceiling <= 0) return null
  return Math.min(100, Math.round((spent / ceiling) * 100))
}

export function AgentsPanel(): React.ReactElement {
  const conversationId = useChatStore((s) => s.activeConversationId)
  const orchestrationEnabled = useSettingsStore((s) => s.settings.orchestrationEnabled ?? false)
  const [identities, setIdentities] = useState<Identity[]>([])

  const refresh = useCallback(async () => {
    if (!window.api?.agents || !conversationId) {
      setIdentities([])
      return
    }
    const res = await window.api.agents.list(conversationId)
    if (res.success) setIdentities((res.data as Identity[]) ?? [])
  }, [conversationId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const revoke = async (id: string): Promise<void> => {
    if (!window.api?.agents) return
    if (
      !confirm('Revoke this agent identity? Its in-flight run is aborted and it can use no tools.')
    )
      return
    const res = await window.api.agents.revoke(id)
    if (res.success) {
      toast.success('Identity revoked')
      await refresh()
    } else {
      toast.error(`Revoke failed: ${res.error}`)
    }
  }

  if (!orchestrationEnabled) {
    return (
      <div className="p-4 text-[13px] leading-relaxed text-[var(--text-muted)]">
        Orchestration is off. Enable it in{' '}
        <span className="font-mono text-[var(--text-secondary)]">Settings → Orchestration</span> to
        give sub-agents their own identities with tool grants and budgets. This panel then lists
        each agent, what it was granted, and its spend — with a revoke/kill switch.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-semibold text-[var(--text-primary)]">Agents</h3>
        <button
          onClick={() => void refresh()}
          className="rounded-md border border-[var(--panel-border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
        >
          Refresh
        </button>
      </div>

      {identities.length === 0 && (
        <p className="text-[12px] text-[var(--text-muted)]">
          No agent identities yet this conversation. Run a strategy (fan-out, critique) or a
          multi-agent turn and its agents appear here.
        </p>
      )}

      {identities.map((it) => {
        const refused = it.requestedTools.filter((t) => !it.grantedTools.includes(t))
        const tokPct = pct(it.tokensSpent, it.tokensCeiling)
        return (
          <div
            key={it.id}
            className="space-y-1 rounded-lg border border-[var(--panel-border)] bg-[var(--bg-primary)] p-2.5 text-[12px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[var(--text-primary)]">{it.label}</span>
              <span className={`font-mono text-[11px] uppercase ${STATUS_TONE[it.status] ?? ''}`}>
                {it.status}
              </span>
            </div>
            <div className="font-mono text-[11px] text-[var(--text-muted)]">
              {it.agentType} · scope {it.scopeKind}
            </div>
            {it.grantedTools.length > 0 && (
              <div className="text-[11px] text-[var(--text-secondary)]">
                granted: <span className="font-mono">{it.grantedTools.join(', ')}</span>
              </div>
            )}
            {refused.length > 0 && (
              <div className="text-[11px] text-[var(--danger)]">
                refused: <span className="font-mono">{refused.join(', ')}</span>
              </div>
            )}
            <div className="text-[11px] text-[var(--text-muted)]">
              spend: {it.tokensSpent.toLocaleString()} tok
              {tokPct != null && ` (${tokPct}% of ${it.tokensCeiling.toLocaleString()})`} ·{' '}
              {Math.round(it.wallMsSpent / 1000)}s
            </div>
            {it.status !== 'revoked' && (
              <div className="pt-0.5">
                <button onClick={() => void revoke(it.id)} className={BTN_DANGER}>
                  Revoke / kill
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
