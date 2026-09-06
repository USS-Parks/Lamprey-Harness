import { useProvidersStore } from '@/stores/providers-store'
import { useUiStore } from '@/stores/ui-store'
import { useEffect, useState } from 'react'
import type { ProviderInfo } from '@/lib/types'
import { ensurePlaintextConsentIfNeeded } from '@/lib/keychain-consent'

interface ApiKeyModalProps {
  onComplete: () => void | Promise<void>
  onDismiss?: () => void
  defaultProvider?: string
  required?: boolean
  onUseLocal?: () => void
}

interface ProviderEntry extends ProviderInfo {
  hasKey: boolean
}

export function ApiKeyModal({ onComplete, onDismiss, defaultProvider, required = true, onUseLocal }: ApiKeyModalProps) {
  const [providers, setProviders] = useState<ProviderEntry[]>([])
  const [selected, setSelected] = useState<string>(defaultProvider ?? 'deepseek')
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // SEC-10: when safeStorage is unavailable the key persists as plaintext.
  // null = still checking; false = MUST confirm before save.
  const [encrypted, setEncrypted] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    setEncrypted(null)
    setLoadError('')
    void (async () => {
      try {
        if (!window.api?.settings) throw new Error('Open Lamprey desktop to connect a provider. The desktop bridge is unavailable.')
        const [list, enc] = await Promise.all([
          window.api.settings.listProviderKeys(),
          window.api.settings.isEncryptionAvailable()
        ])
        if (cancelled) return
        if (!list.success) throw new Error(list.error || 'Could not load providers.')
        if (!enc.success) throw new Error(enc.error || 'Could not check key storage.')
        const items = list.data as ProviderEntry[]
        setProviders(items)
        if (defaultProvider && items.some((p) => p.id === defaultProvider)) {
          setSelected(defaultProvider)
        } else {
          const firstMissing = items.find((p) => !p.hasKey)
          if (firstMissing) setSelected(firstMissing.id)
        }
        setEncrypted(Boolean(enc.data))
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Could not load provider settings. Try again.')
      }
    })()
    return () => { cancelled = true }
  }, [defaultProvider, attempt])

  const finishSetup = async () => {
    const refreshed = await window.api.settings.listProviderKeys()
    if (!refreshed.success) throw new Error(refreshed.error || 'The key was validated, but provider status could not refresh. Try again.')
    useProvidersStore.getState().setProviders(refreshed.data as ProviderEntry[])
    await onComplete()
  }

  const handleSubmit = async () => {
    if (!key.trim() || testing || encrypted === null || loadError) return
    // SEC-10: shared consent gate. Confirms once per session when encryption
    // is unavailable and records consent in the main process so background
    // callers (mcp-manager token refresh, etc.) inherit the decision.
    setTesting(true)
    setError('')

    try {
      const ok = await ensurePlaintextConsentIfNeeded()
      if (!ok) return
      const save = await window.api.settings.saveProviderKey(selected, key.trim())
      if (!save.success) {
        setError(save.error || 'Failed to save key.')
        return
      }
      const result = await window.api.settings.testProviderKey(selected)
      const data = result.success
        ? (result.data as { ok: boolean; reason?: string } | boolean | undefined)
        : undefined
      if (typeof data === 'object' && data !== null) {
        if (data.ok) {
          await finishSetup()
        } else {
          setError(data.reason || 'Provider rejected the key.')
        }
      } else if (typeof data === 'boolean') {
        if (data) await finishSetup()
        else setError('Provider rejected the key.')
      } else {
        setError(result.success ? 'No response from provider.' : (result.error || 'Unknown error.'))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connection failed. Check your network and try again.')
    } finally {
      setTesting(false)
    }
  }

  const currentProvider = providers.find((p) => p.id === selected)
  const scoped = !!defaultProvider

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div role="dialog" aria-modal="true" aria-labelledby="api-key-heading" className="relative w-[460px] rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)] p-6">
        {!required && onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Close"
            title="Close"
            className="absolute right-3 top-3 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <h2 id="api-key-heading" className="font-mono text-lg font-semibold text-[var(--text-primary)]">
          {scoped && currentProvider ? `Add a ${currentProvider.label} API key` : 'Welcome to the Lamprey Harness'}
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Bring your own key for any supported provider. Paste a real key from that provider's
          dashboard; we authenticate against the provider's published API endpoint before unlocking
          its models.
        </p>

        {loadError && <div role="alert" className="mt-3 text-sm text-[var(--error)]">
          <p>{loadError}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 underline">Retry loading providers</button>
        </div>}

        {encrypted === false && (
          <div
            role="alert"
            className="mt-3 rounded border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-2 text-[12px] leading-relaxed text-[var(--warning)]"
          >
            <strong className="font-mono uppercase tracking-wider">Plaintext storage</strong>
            <span className="ml-2 text-[var(--text-secondary)]">
              Encryption is unavailable on this system. The key will be stored as plaintext in
              userData/keys.json. You will be asked to confirm before saving.
            </span>
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-[12px] uppercase tracking-wider text-[var(--text-muted)]">Provider</span>
          <select
            disabled={testing || encrypted === null}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.hasKey ? ' (key stored)' : ''}
              </option>
            ))}
          </select>
        </label>

        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.repeat) { e.preventDefault(); void handleSubmit() } }}
          placeholder={selected === 'deepseek' ? 'sk-...' : 'API key'}
          className="mt-3 w-full rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          autoFocus
        />

        {currentProvider && (
          <a
            href={currentProvider.docsUrl}
            onClick={async (e) => {
              e.preventDefault()
              try {
                const result = await window.api?.artifact?.openExternal?.(currentProvider.docsUrl)
                if (!result?.success) setError(result?.error || 'Could not open the provider website.')
              } catch {
                setError('Could not open the provider website. Try again.')
              }
            }}
            className="mt-2 inline-block font-mono text-[12px] text-[var(--accent)] hover:underline"
          >
            Get a {currentProvider.label} key →
          </a>
        )}

        {error && <p role="alert" className="mt-2 text-xs text-[var(--error)]">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!key.trim() || testing || encrypted === null || !!loadError || !currentProvider}
          className="mt-4 w-full rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {testing ? 'Validating...' : 'Connect'}
        </button>
        {!required && onDismiss && <button type="button" disabled={testing} className="mt-2 min-h-8 w-full text-sm text-[var(--accent)]" onClick={() => { onDismiss(); useUiStore.getState().openSettings('api') }}>Provider settings</button>}
        {onUseLocal && <button onClick={onUseLocal} disabled={testing} className="mt-3 w-full text-sm text-[var(--accent)]">Set up a local model</button>}

        <p className="mt-3 text-[12px] text-[var(--text-muted)]">
          {encrypted === null ? 'Key storage has not been checked. Saving is disabled until the check succeeds.' : encrypted === false
            ? 'Keys are written to a 0600-mode file in your userData directory. Without OS-level encryption available, they are stored as plaintext. They never leave this device except to call the provider\'s own API.'
            : 'Keys are encrypted with OS-level storage (Electron safeStorage) and never leave this device except to call the provider\'s own API.'}
        </p>
      </div>
    </div>
  )
}
