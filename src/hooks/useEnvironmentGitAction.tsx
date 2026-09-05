import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EnvironmentSnapshot } from '@/lib/types'
import { toast } from '@/stores/toast-store'

export function useEnvironmentGitAction(
  snapshot: EnvironmentSnapshot,
  refresh: () => Promise<void>
) {
  const [committing, setCommitting] = useState(false)
  const busy = useRef(false)
  const opener = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState<{ message: string; cwd: string } | null>(null)
  const close = () => {
    setDraft(null)
    opener.current?.focus()
  }
  const run = async (action: 'commit' | 'push', cwd: string, message = '') => {
    if (busy.current) return
    if (!window.api?.review) {
      toast.error('Review API unavailable')
      return
    }
    busy.current = true
    setCommitting(true)
    try {
      const result =
        action === 'commit'
          ? await window.api.review.commit({ cwd, message: message.trim(), stageAll: true })
          : await window.api.review.push({ cwd })
      if (!result.success) {
        toast.error(result.error || `${action === 'commit' ? 'Commit' : 'Push'} failed`)
        return
      }
      close()
      toast.success(action === 'commit' ? 'Committed' : 'Pushed')
      await refresh().catch(() => toast.error('Git action succeeded, but repository status could not be refreshed.'))
    } catch {
      toast.error('Git action failed. Check the repository status before retrying.')
    } finally {
      busy.current = false
      setCommitting(false)
    }
  }
  const handleCommitOrPush = () => {
    if (busy.current) return
    if (!window.api?.review) {
      toast.error('Review API unavailable')
      return
    }
    if (snapshot.hasChanges) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setDraft({ message: '', cwd: snapshot.cwd })
    } else if (snapshot.ahead > 0) void run('push', snapshot.cwd)
  }
  const commitDialog =
    draft &&
    createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby="commit-heading"
          className="w-[440px] max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)] p-4 text-[var(--text-primary)]"
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.message.trim()) void run('commit', draft.cwd, draft.message)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              if (!committing) close()
            }
            if (event.key === 'Tab') {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'input:not(:disabled), button:not(:disabled)'
                )
              )
              const target = event.shiftKey ? controls[controls.length - 1] : controls[0]
              if (
                document.activeElement ===
                (event.shiftKey ? controls[0] : controls[controls.length - 1])
              ) {
                event.preventDefault()
                target?.focus()
              }
            }
          }}
        >
          <h2 id="commit-heading" className="mb-2 font-semibold">
            Commit changes
          </h2>
          <p className="mb-3 break-all text-xs text-[var(--text-muted)]">{draft.cwd}</p>
          <label className="block text-sm">
            Commit message
            <input
              autoFocus
              value={draft.message}
              disabled={committing}
              onChange={(event) => setDraft({ ...draft, message: event.target.value })}
              className="mt-1 w-full rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-2"
            />
          </label>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            All changed and untracked files in this repository will be staged.
          </p>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" disabled={committing} onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={committing || !draft.message.trim()}
              className="rounded bg-[var(--accent)] px-3 py-1 text-white disabled:opacity-50"
            >
              {committing ? 'Committing…' : 'Commit'}
            </button>
          </div>
        </form>
      </div>,
      document.body
    )
  return {
    committing,
    handleCommitOrPush,
    commitDialog,
    commitDisabled: !snapshot.hasChanges && snapshot.ahead === 0,
    commitLabel: snapshot.hasChanges
      ? 'Commit'
      : snapshot.ahead > 0
        ? `Push (${snapshot.ahead} ahead)`
        : 'Commit or push'
  }
}
