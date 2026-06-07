import { useState } from 'react'

// Persistence & Seed Phase / PS21 — wire Pin-as-memory into the
// existing chapters store. The MessageActions button has been a
// "coming soon" toast since the Fluidity Phase; PS21 closes that
// stub so the action row reads as finished, not half-done.
//
// The pin promotes a message into a session chapter. Chapters
// surface in the sidebar TOC + inline dividers + the system-prompt
// builder's <chapters> block, so a pinned message becomes durable
// long-context the model can reference on future turns.

interface PinDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (input: { title: string; summary: string | null }) => Promise<void> | void
}

export function PinDialog({ open, onClose, onConfirm }: PinDialogProps): React.ReactElement | null {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const confirm = async (): Promise<void> => {
    if (busy) return
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm({
        title: title.trim(),
        summary: summary.trim() === '' ? null : summary.trim()
      })
      setTitle('')
      setSummary('')
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Pin failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
      <div className="w-[360px] rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)] p-4 shadow-2xl">
        <div className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Pin as memory chapter
        </div>
        <label className="mb-3 block text-xs text-[var(--text-secondary)]">
          <span className="mb-1 block">Title</span>
          <input
            type="text"
            placeholder="e.g. Schema migration plan"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs"
            autoFocus
          />
        </label>
        <label className="mb-3 block text-xs text-[var(--text-secondary)]">
          <span className="mb-1 block">Summary (optional)</span>
          <textarea
            rows={3}
            placeholder="One-line note shown on hover…"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={busy}
            className="w-full resize-none rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs"
          />
        </label>
        {error && (
          <div className="mb-3 rounded border border-[var(--error)] bg-[var(--error)]/10 px-2 py-1 text-xs text-[var(--text-primary)]">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy || !title.trim()}
            className="rounded border border-[var(--accent)] bg-[var(--accent)]/15 px-2 py-1 text-xs hover:bg-[var(--accent)]/25 disabled:opacity-40"
          >
            {busy ? 'Pinning…' : 'Pin chapter'}
          </button>
        </div>
      </div>
    </div>
  )
}
