import { useMemo, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'

interface Props {
  toolName: string
  args: Record<string, unknown>
  result?: string
}

export function PrPatchCard({ toolName, args, result }: Props) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(result ?? '{}') as Record<string, any>
    } catch {
      return {}
    }
  }, [result])
  const proposal = parsed.proposal ?? parsed
  const proposalId = String(proposal.id ?? args.proposalId ?? '')
  const status = String(proposal.status ?? (toolName === 'pr_patch_accept' ? 'accepted' : 'pending'))
  const initialPatch = String(proposal.patch ?? args.patch ?? '')
  const [editedPatch, setEditedPatch] = useState(initialPatch)

  const sendAction = async (instruction: string) => {
    await useChatStore.getState().sendMessage(instruction, [])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono text-[var(--text-muted)]">Patch {proposalId || 'proposal'}</span>
        <span className="rounded border border-[var(--panel-border)] px-1.5 py-0.5 uppercase tracking-wider text-[var(--text-secondary)]">
          {status}
        </span>
      </div>
      {initialPatch && (
        <textarea
          aria-label="Patch proposal"
          value={editedPatch}
          onChange={(event) => setEditedPatch(event.target.value)}
          rows={10}
          className="max-h-80 resize-y rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] p-2 font-mono text-[11px] text-[var(--text-primary)]"
        />
      )}
      {status === 'pending' && proposalId && (
        <div className="flex flex-wrap justify-end gap-2">
          {editedPatch !== initialPatch && (
            <button
              type="button"
              onClick={() => void sendAction(
                `Update PR patch proposal ${proposalId} to this exact patch:\n\n${editedPatch}`
              )}
              className="rounded border border-[var(--panel-border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
            >
              Send edit
            </button>
          )}
          <button
            type="button"
            onClick={() => void sendAction(`Reject PR patch proposal ${proposalId}.`)}
            className="rounded border border-[var(--panel-border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => void sendAction(`Accept PR patch proposal ${proposalId}.`)}
            className="rounded bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--bg-primary)]"
          >
            Accept…
          </button>
        </div>
      )}
    </div>
  )
}
