import { useEffect, useState } from 'react'

export function SecurityBanner() {
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [unencrypted, setUnencrypted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.api) return
    let cancelled = false
    setError(null)
    window.api.settings.isEncryptionAvailable().then((result) => {
      if (cancelled) return
      if (!result.success) setError(result.error ?? 'Secret storage status is unavailable.')
      else setUnencrypted(result.data === false)
    }).catch(() => { if (!cancelled) setError('Secret storage status is unavailable.') })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (error) return <div role="alert" className="flex items-center gap-2 border-b border-[var(--warning)] p-2 text-xs">{error} <button className="min-h-8 underline" onClick={() => setAttempt(value => value + 1)}>Retry secret storage check</button></div>
  if (!unencrypted || dismissed) return null

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--warning)] bg-[var(--warning)]/10 px-4 py-2 text-xs text-[var(--text-primary)]">
      <span>
        OS-level secret storage is unavailable — API keys and OAuth tokens fall back to plaintext on
        disk. Install <span className="font-mono">libsecret</span> (Linux) or run on a host with a
        native keychain before storing real credentials.
      </span>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
