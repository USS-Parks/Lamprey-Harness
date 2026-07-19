import { useEffect, useState } from 'react'
import { toast } from '@/stores/toast-store'
import type { ProviderInfo } from '@/lib/types'
import { ensurePlaintextConsentIfNeeded } from '@/lib/keychain-consent'
import { useProvidersStore } from '@/stores/providers-store'

interface ProviderEntry extends ProviderInfo {
  hasKey: boolean
}

interface SearchProviderEntry {
  id: string
  label: string
  docsUrl: string
  hasKey: boolean
}

interface TestResult {
  ok: boolean
  message: string
}

// Display grouping only — membership lives here in the renderer because the
// main process has no notion of "frontier vs host"; anything not listed
// (i.e. a user-defined custom provider) falls into the Custom endpoints
// group automatically.
const PROVIDER_GROUPS: Array<{ title: string; ids: string[] }> = [
  {
    title: 'Frontier labs',
    ids: [
      'openai',
      'anthropic',
      'xai',
      'deepseek',
      'moonshot',
      'mistral',
      'zhipu',
      'google',
      'dashscope',
      'cohere',
      'minimax'
    ]
  },
  {
    title: 'Open-source hosts & aggregators',
    ids: [
      'openrouter',
      'aihubmix',
      'groq',
      'together',
      'fireworks',
      'cerebras',
      'huggingface',
      'nvidia',
      'github-models',
      'sambanova',
      'siliconflow',
      'deepinfra',
      'hyperbolic'
    ]
  },
  {
    title: 'Regional & specialist labs',
    ids: ['reka', 'sealion', 'perplexity', 'sarvam', 'inception']
  },
  { title: 'Local runtimes & gateways', ids: ['freellmapi', 'ollama', 'lmstudio'] }
]
const GROUPED_IDS = new Set(PROVIDER_GROUPS.flatMap((g) => g.ids))

export function ApiKeySettings() {
  const [providers, setProviders] = useState<ProviderEntry[]>([])
  // R4 — second row of provider cards for the web-search cascade. Distinct
  // namespace from AI providers so the IPC handler can refuse cross-writes.
  const [searchProviders, setSearchProviders] = useState<SearchProviderEntry[]>([])
  const [encrypted, setEncrypted] = useState<boolean | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [searchDrafts, setSearchDrafts] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [showSearchKey, setShowSearchKey] = useState<Record<string, boolean>>({})
  const [baseURLDrafts, setBaseURLDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, TestResult | null>>({})
  const [cpDraft, setCpDraft] = useState({
    id: '',
    label: '',
    baseURL: '',
    requiresKey: false
  })

  const refresh = async () => {
    if (!window.api) return
    const [list, searchList, enc] = await Promise.all([
      window.api.settings.listProviderKeys(),
      window.api.settings.listSearchProviderKeys(),
      window.api.settings.isEncryptionAvailable()
    ])
    if (list.success) {
      const entries = list.data as ProviderEntry[]
      setProviders(entries)
      useProvidersStore.getState().setProviders(entries)
      setBaseURLDrafts((current) => {
        const next = { ...current }
        for (const provider of entries) {
          if (provider.baseUrlConfigurable && next[provider.id] === undefined) {
            next[provider.id] = provider.baseURL ?? ''
          }
        }
        return next
      })
    }
    if (searchList.success) setSearchProviders(searchList.data as SearchProviderEntry[])
    setEncrypted(enc.success ? Boolean(enc.data) : false)
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleSave = async (providerId: string) => {
    const trimmed = (drafts[providerId] || '').trim()
    if (!trimmed) return
    // SEC-10: shared consent gate. Confirms once per session when
    // encryption is off and records consent on the main side so other
    // settings panels + background paths inherit the decision.
    const consent = await ensurePlaintextConsentIfNeeded()
    if (!consent) return
    setBusy(providerId)
    setTestStatus((s) => ({ ...s, [providerId]: null }))
    try {
      const save = await window.api.settings.saveProviderKey(providerId, trimmed)
      if (!save.success) {
        toast.error(`Failed to save ${providerId} key: ${save.error}`)
        return
      }
      toast.success(`${providerId} key saved`)
      setDrafts((s) => ({ ...s, [providerId]: '' }))
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async (providerId: string, label: string) => {
    setBusy(providerId)
    setTestStatus((s) => ({ ...s, [providerId]: null }))
    try {
      const result = await window.api.settings.testProviderKey(providerId)
      // The IPC handler now returns { ok, reason?, modelCount? } in `data`.
      const data = result.success
        ? (result.data as
            { ok: boolean; reason?: string; modelCount?: number } | boolean | undefined)
        : undefined
      if (typeof data === 'object' && data !== null) {
        if (data.ok) {
          const detail =
            typeof data.modelCount === 'number'
              ? `${label} authenticated (${data.modelCount} models exposed by /v1/models).`
              : `${label} authenticated.`
          setTestStatus((s) => ({ ...s, [providerId]: { ok: true, message: detail } }))
          toast.success(`${label} key valid`)
        } else {
          const reason = data.reason || 'Provider rejected the key.'
          setTestStatus((s) => ({ ...s, [providerId]: { ok: false, message: reason } }))
          toast.error(`${label} key check failed: ${reason}`)
        }
      } else if (typeof data === 'boolean') {
        const msg = data ? `${label} authenticated.` : 'Provider rejected the key.'
        setTestStatus((s) => ({ ...s, [providerId]: { ok: data, message: msg } }))
        if (data) toast.success(`${label} key valid`)
        else toast.error(`Invalid ${label} key`)
      } else {
        const reason = result.success
          ? 'No response from provider.'
          : result.error || 'Unknown error.'
        setTestStatus((s) => ({ ...s, [providerId]: { ok: false, message: reason } }))
        toast.error(`${label} test failed: ${reason}`)
      }
    } catch (err) {
      const msg = (err as Error).message ?? 'unknown error'
      setTestStatus((s) => ({ ...s, [providerId]: { ok: false, message: msg } }))
      toast.error(`${label} test failed: ${msg}`)
    }
    setBusy(null)
  }

  const handleDelete = async (providerId: string, label: string) => {
    if (!confirm(`Delete the stored ${label} API key?`)) return
    setBusy(providerId)
    try {
      const result = await window.api.settings.deleteProviderKey(providerId)
      if (!result.success) {
        toast.error(`Failed to delete ${label} key: ${result.error}`)
        return
      }
      toast.success(`${label} key deleted`)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const handleSaveBaseURL = async (providerId: string, label: string) => {
    const baseURL = (baseURLDrafts[providerId] ?? '').trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(baseURL)) {
      toast.warning('Base URL must start with http:// or https://')
      return
    }
    setBusy(`base:${providerId}`)
    try {
      const current = await window.api.settings.get()
      if (!current.success) {
        toast.error('Could not read settings')
        return
      }
      const settings = current.data as Record<string, unknown>
      const existing =
        settings.providerBaseUrlOverrides &&
        typeof settings.providerBaseUrlOverrides === 'object' &&
        !Array.isArray(settings.providerBaseUrlOverrides)
          ? (settings.providerBaseUrlOverrides as Record<string, string>)
          : {}
      const saved = await window.api.settings.set({
        providerBaseUrlOverrides: { ...existing, [providerId]: baseURL }
      })
      if (!saved.success) {
        toast.error(`Failed to save ${label} address: ${saved.error}`)
        return
      }
      toast.success(`${label} address saved`)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  // R4 — search-provider key handlers. No test endpoint: search APIs are
  // metered, so we let the next research turn act as the live validation
  // rather than burning a paid call on settings entry.
  const handleSearchSave = async (providerId: string, label: string) => {
    const trimmed = (searchDrafts[providerId] || '').trim()
    if (!trimmed) return
    const consent = await ensurePlaintextConsentIfNeeded()
    if (!consent) return
    setBusy(`search:${providerId}`)
    try {
      const save = await window.api.settings.saveSearchProviderKey(providerId, trimmed)
      if (!save.success) {
        toast.error(`Failed to save ${label} key: ${save.error}`)
        return
      }
      toast.success(`${label} key saved`)
      setSearchDrafts((s) => ({ ...s, [providerId]: '' }))
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const handleSearchDelete = async (providerId: string, label: string) => {
    setBusy(`search:${providerId}`)
    try {
      const result = await window.api.settings.deleteSearchProviderKey(providerId)
      if (!result.success) {
        toast.error(`Failed to delete ${label} key: ${result.error}`)
        return
      }
      toast.success(`${label} key deleted`)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const handleAddEndpoint = async () => {
    if (!window.api) return
    const id = cpDraft.id.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      toast.warning('Endpoint id must be lowercase letters, digits, and dashes (e.g. gpu-box)')
      return
    }
    if (!/^https?:\/\//i.test(cpDraft.baseURL.trim())) {
      toast.warning('Base URL must start with http:// or https://')
      return
    }
    const current = await window.api.settings.get()
    if (!current.success) {
      toast.error('Could not read settings')
      return
    }
    const settings = current.data as Record<string, unknown>
    const existing = Array.isArray(settings.customProviders)
      ? (settings.customProviders as Array<Record<string, unknown>>)
      : []
    if (existing.some((e) => e.id === id) || providers.some((p) => p.id === id)) {
      toast.warning(`Provider id "${id}" already exists`)
      return
    }
    const saved = await window.api.settings.set({
      customProviders: [
        ...existing,
        {
          id,
          label: cpDraft.label.trim() || id,
          baseURL: cpDraft.baseURL.trim(),
          requiresKey: cpDraft.requiresKey
        }
      ]
    })
    if (!saved.success) {
      toast.error(`Failed to save endpoint: ${saved.error}`)
      return
    }
    toast.success(`${id} added`)
    setCpDraft({ id: '', label: '', baseURL: '', requiresKey: false })
    await refresh()
  }

  const handleRemoveEndpoint = async (id: string) => {
    if (!window.api) return
    if (!confirm(`Remove custom endpoint "${id}"? Its stored key (if any) stays until deleted.`))
      return
    const current = await window.api.settings.get()
    if (!current.success) return
    const settings = current.data as Record<string, unknown>
    const existing = Array.isArray(settings.customProviders)
      ? (settings.customProviders as Array<Record<string, unknown>>)
      : []
    const saved = await window.api.settings.set({
      customProviders: existing.filter((e) => e.id !== id)
    })
    if (!saved.success) {
      toast.error(`Failed to remove endpoint: ${saved.error}`)
      return
    }
    toast.success(`${id} removed`)
    await refresh()
  }

  const renderProviderCard = (p: ProviderEntry, isCustomEndpoint = false) => {
    const draft = drafts[p.id] || ''
    const visible = showKey[p.id] || false
    const status = testStatus[p.id]
    return (
      <div
        key={p.id}
        className="space-y-2 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${
                  p.hasKey || p.keyOptional ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'
                }`}
              />
              <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                {p.label}
              </span>
              <span className="font-mono text-[12px] text-[var(--text-muted)]">
                {p.hasKey
                  ? 'Stored'
                  : p.keyOptional
                    ? isCustomEndpoint
                      ? 'No key needed'
                      : 'Local — no key needed'
                    : 'No key'}
              </span>
            </div>
            {p.docsUrl ? (
              <a
                href={p.docsUrl}
                onClick={(e) => {
                  e.preventDefault()
                  window.api?.artifact?.openExternal?.(p.docsUrl)
                }}
                className="mt-1 inline-block font-mono text-[12px] text-[var(--accent)] hover:underline"
              >
                {p.keyOptional ? 'Runtime docs →' : 'Get a key →'}
              </a>
            ) : (
              <span className="mt-1 inline-block font-mono text-[12px] text-[var(--text-muted)]">
                Custom OpenAI-compatible endpoint
              </span>
            )}
            {p.baseUrlConfigurable && (
              <div className="mt-2 flex min-w-0 gap-2">
                <input
                  type="url"
                  aria-label={`${p.label} base URL`}
                  value={baseURLDrafts[p.id] ?? p.baseURL ?? ''}
                  onChange={(e) =>
                    setBaseURLDrafts((state) => ({ ...state, [p.id]: e.target.value }))
                  }
                  className="min-w-0 flex-1 rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => handleSaveBaseURL(p.id, p.label)}
                  disabled={busy === `base:${p.id}`}
                  className="rounded border border-[var(--panel-border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Save address
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type={visible ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: e.target.value }))}
            placeholder={
              p.hasKey
                ? 'Replace key...'
                : p.keyOptional
                  ? 'Optional key (rarely needed)'
                  : (p.keyHint ?? 'Paste API key')
            }
            className="flex-1 rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => ({ ...s, [p.id]: !visible }))}
            className="rounded border border-[var(--panel-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => handleSave(p.id)}
            disabled={busy === p.id || !draft.trim()}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Save key
          </button>
          <button
            onClick={() => handleTest(p.id, p.label)}
            disabled={busy === p.id || (!p.hasKey && !p.keyOptional)}
            className="rounded border border-[var(--panel-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Test
          </button>
          <button
            onClick={() => handleDelete(p.id, p.label)}
            disabled={busy === p.id || !p.hasKey}
            className="rounded border border-[var(--panel-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--error)] transition-colors hover:bg-[var(--error)]/10 disabled:opacity-40"
          >
            Delete
          </button>
          {isCustomEndpoint && (
            <button
              onClick={() => handleRemoveEndpoint(p.id)}
              disabled={busy === p.id}
              className="rounded border border-[var(--panel-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--error)] transition-colors hover:bg-[var(--error)]/10 disabled:opacity-40"
            >
              Remove endpoint
            </button>
          )}
          {status && (
            <span
              className={`text-[13px] ${status.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}
            >
              {status.message}
            </span>
          )}
        </div>
      </div>
    )
  }

  const customEndpoints = providers.filter((p) => !GROUPED_IDS.has(p.id))

  return (
    <div className="space-y-5">
      {/* R4 — Search Providers section. Sits ABOVE AI providers because
          deep-research auto-triggers on research-shaped prompts and silently
          fails without one of these keys; users need to discover this knob
          before their first research turn ghosts. */}
      <div>
        <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)]">
          Search providers
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Deep Research needs a search API to find sources. The free zero-key path (DuckDuckGo HTML)
          is unreliable and frequently returns no results; the built-in Wikipedia adapter covers
          some queries but isn't enough for exhaustive search. Add a Brave or SerpAPI key (free
          tiers below) for reliable academic + web coverage.
        </p>
      </div>

      {searchProviders.map((p) => {
        const draft = searchDrafts[p.id] || ''
        const visible = showSearchKey[p.id] || false
        const blurb =
          p.id === 'brave'
            ? 'Free tier: 2,000 queries/month. No credit card required.'
            : p.id === 'serpapi'
              ? 'Free tier: 100 searches/month. No credit card required.'
              : p.id === 'tavily'
                ? 'Free tier: 1,000 credits/month. No credit card required.'
                : ''
        return (
          <div
            key={`search:${p.id}`}
            className="space-y-2 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-block h-2 w-2 rounded-full ${
                      p.hasKey ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'
                    }`}
                  />
                  <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                    {p.label}
                  </span>
                  <span className="font-mono text-[12px] text-[var(--text-muted)]">
                    {p.hasKey ? 'Stored' : 'No key'}
                  </span>
                </div>
                {blurb && <p className="mt-1 text-[12px] text-[var(--text-muted)]">{blurb}</p>}
                {p.docsUrl && (
                  <a
                    href={p.docsUrl}
                    onClick={(e) => {
                      e.preventDefault()
                      window.api?.artifact?.openExternal?.(p.docsUrl)
                    }}
                    className="mt-1 inline-block font-mono text-[12px] text-[var(--accent)] hover:underline"
                  >
                    Get a free key →
                  </a>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type={visible ? 'text' : 'password'}
                value={draft}
                onChange={(e) => setSearchDrafts((s) => ({ ...s, [p.id]: e.target.value }))}
                placeholder={p.hasKey ? 'Replace key...' : 'Paste API key'}
                className="flex-1 rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => setShowSearchKey((s) => ({ ...s, [p.id]: !visible }))}
                className="rounded border border-[var(--panel-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                {visible ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => handleSearchSave(p.id, p.label)}
                disabled={busy === `search:${p.id}` || !draft.trim()}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Save key
              </button>
              <button
                onClick={() => handleSearchDelete(p.id, p.label)}
                disabled={busy === `search:${p.id}` || !p.hasKey}
                className="rounded border border-[var(--panel-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--error)] transition-colors hover:bg-[var(--error)]/10 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </div>
        )
      })}

      <div>
        <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)]">
          Provider API keys
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Each model routes to a real provider over its published API endpoint. Add a key per
          provider to unlock that provider's models. Keys are encrypted with Electron safeStorage
          and stored locally in your userData directory; they are only transmitted to the provider
          they belong to.
        </p>
      </div>

      <div className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3 text-[13px]">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <span
            className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ${
              encrypted
                ? 'bg-[var(--success)]/15 text-[var(--success)]'
                : encrypted === false
                  ? 'bg-[var(--warning)]/15 text-[var(--warning)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
            }`}
          >
            {encrypted === null ? 'checking' : encrypted ? 'encrypted' : 'plaintext'}
          </span>
          <span>
            {encrypted === null
              ? 'Checking storage backend...'
              : encrypted
                ? 'Stored using OS-level encryption (Electron safeStorage), persisted to userData/keys.json.'
                : 'safeStorage is unavailable on this host. Keys are written as plaintext. Install libsecret (Linux) or run on a host with a native keychain.'}
          </span>
        </div>
      </div>

      {PROVIDER_GROUPS.map((group) => {
        const members = providers.filter((p) => group.ids.includes(p.id))
        if (members.length === 0) return null
        const storedCount = members.filter((m) => m.hasKey).length
        return (
          <details key={group.title} open className="group">
            <summary className="cursor-pointer select-none font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              {group.title}
              <span className="ml-2 text-[11px] normal-case tracking-normal">
                {storedCount}/{members.length} keyed
              </span>
            </summary>
            <div className="mt-2 space-y-3">{members.map((p) => renderProviderCard(p))}</div>
          </details>
        )
      })}

      <details open className="group">
        <summary className="cursor-pointer select-none font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Custom endpoints
          <span className="ml-2 text-[11px] normal-case tracking-normal">
            {customEndpoints.length} configured
          </span>
        </summary>
        <div className="mt-2 space-y-3">
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            Point Lamprey at any OpenAI-compatible endpoint — vLLM, llama.cpp server, a LiteLLM
            proxy, a future provider. The endpoint becomes a first-class provider: it gets a key
            slot here, appears in the model-provider picker, and its live /v1/models can be imported
            from Settings → Models.
          </p>

          {customEndpoints.map((p) => renderProviderCard(p, true))}

          <div className="space-y-2 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] uppercase tracking-wider text-[var(--text-muted)]">
                  Endpoint id
                </span>
                <input
                  type="text"
                  value={cpDraft.id}
                  onChange={(e) => setCpDraft((s) => ({ ...s, id: e.target.value }))}
                  placeholder="gpu-box"
                  className="rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] uppercase tracking-wider text-[var(--text-muted)]">
                  Display label
                </span>
                <input
                  type="text"
                  value={cpDraft.label}
                  onChange={(e) => setCpDraft((s) => ({ ...s, label: e.target.value }))}
                  placeholder="Basement GPU box"
                  className="rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] uppercase tracking-wider text-[var(--text-muted)]">
                Base URL (OpenAI-compatible, ends in /v1)
              </span>
              <input
                type="text"
                value={cpDraft.baseURL}
                onChange={(e) => setCpDraft((s) => ({ ...s, baseURL: e.target.value }))}
                placeholder="http://192.168.1.10:8000/v1"
                className="rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={cpDraft.requiresKey}
                  onChange={(e) => setCpDraft((s) => ({ ...s, requiresKey: e.target.checked }))}
                  className="h-3 w-3 accent-[var(--accent)]"
                />
                Requires an API key
              </label>
              <button
                onClick={handleAddEndpoint}
                disabled={!cpDraft.id.trim() || !cpDraft.baseURL.trim()}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Add endpoint
              </button>
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
