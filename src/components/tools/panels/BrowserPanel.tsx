import { useCallback, useEffect, useRef, useState } from 'react'

interface TabInfo {
  id: string
  title: string
  url: string
  loading: boolean
  canGoBack?: boolean
  canGoForward?: boolean
}

interface DeveloperEvidence {
  referenceId: string
  path: string
  bytes: number
  at: number
  annotations: Array<{ id?: string; label?: string; x?: number; y?: number }>
}

interface DeveloperStatus {
  enabled: boolean
  tabId: string | null
  url: string | null
  origin: string | null
  siteDecision: 'allow' | 'ask' | 'deny'
  session: { targetId: string; protocolVersion: string; attached: boolean } | null
  observation: {
    navigationId: number
    consoleCount: number
    networkCount: number
  } | null
  evidence: DeveloperEvidence[]
}

function BackGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
function FwdGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function ReloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15A9 9 0 1 1 18 5.3L23 10" />
    </svg>
  )
}
function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function BrowserPanel() {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [draftDirty, setDraftDirty] = useState(false)
  const [developerOpen, setDeveloperOpen] = useState(false)
  const [developerStatus, setDeveloperStatus] = useState<DeveloperStatus | null>(null)
  const [developerBusy, setDeveloperBusy] = useState(false)
  const [developerError, setDeveloperError] = useState<string | null>(null)
  const [annotationLabel, setAnnotationLabel] = useState('')
  const [annotationX, setAnnotationX] = useState('0')
  const [annotationY, setAnnotationY] = useState('0')
  const contentRef = useRef<HTMLDivElement>(null)

  const refreshDeveloperStatus = useCallback(async (id?: string | null) => {
    if (!window.api?.browser?.developerStatus) return
    const result = await window.api.browser.developerStatus(id ? { id } : undefined)
    if (result.success) {
      setDeveloperStatus(result.data as DeveloperStatus)
      setDeveloperError(null)
    } else {
      setDeveloperError(result.error ?? 'Unable to read Browser Developer status')
    }
  }, [])

  const reportBounds = useCallback(() => {
    if (!contentRef.current || !window.api?.browser) return
    const r = contentRef.current.getBoundingClientRect()
    void window.api.browser.setBounds({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    })
  }, [])

  const runDeveloperAction = useCallback(async (
    action: () => Promise<{ success: boolean; data?: unknown; error?: string }>
  ) => {
    setDeveloperBusy(true)
    setDeveloperError(null)
    try {
      const result = await action()
      if (!result.success) throw new Error(result.error ?? 'Browser Developer action failed')
      const data = result.data as { status?: DeveloperStatus } | DeveloperStatus | undefined
      const status = data && 'status' in data ? data.status : data
      if (status && 'enabled' in status) setDeveloperStatus(status)
      else await refreshDeveloperStatus(activeId)
    } catch (error) {
      setDeveloperError(error instanceof Error ? error.message : String(error))
    } finally {
      setDeveloperBusy(false)
    }
  }, [activeId, refreshDeveloperStatus])

  // Mount: hook events, show panel, ensure at least one tab.
  useEffect(() => {
    if (!window.api?.browser) return
    const api = window.api.browser

    const onUpdated = (e: TabInfo) => {
      setTabs((cur) => {
        const idx = cur.findIndex((t) => t.id === e.id)
        if (idx === -1) return [...cur, e]
        const next = [...cur]
        next[idx] = { ...next[idx], ...e }
        return next
      })
    }
    const onClosed = (e: { id: string; activeTabId: string | null }) => {
      setTabs((cur) => cur.filter((t) => t.id !== e.id))
      setActiveId(e.activeTabId)
    }
    const onActive = (e: { id: string }) => {
      setActiveId(e.id)
      setDraftDirty(false)
    }
    api.onTabUpdated(onUpdated)
    api.onTabClosed(onClosed)
    api.onActiveTab(onActive)

    void (async () => {
      const list = await api.listTabs()
      if (list.success) {
        const data = list.data as { tabs: TabInfo[]; activeTabId: string | null }
        setTabs(data.tabs)
        setActiveId(data.activeTabId)
        if (data.tabs.length === 0) {
          await api.newTab({})
        }
      }
      await api.setVisible({ visible: true })
      reportBounds()
    })()

    const ro = new ResizeObserver(reportBounds)
    if (contentRef.current) ro.observe(contentRef.current)
    const onWinResize = () => reportBounds()
    window.addEventListener('resize', onWinResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      api.offAll()
      void api.setVisible({ visible: false })
    }
  }, [reportBounds])

  useEffect(() => {
    if (!developerOpen) return
    void refreshDeveloperStatus(activeId)
    const timer = window.setInterval(() => void refreshDeveloperStatus(activeId), 1_000)
    return () => window.clearInterval(timer)
  }, [activeId, developerOpen, refreshDeveloperStatus])

  // Keep address bar synced to the active tab's URL when the user isn't typing.
  useEffect(() => {
    if (draftDirty) return
    const active = tabs.find((t) => t.id === activeId)
    setUrlDraft(active?.url ?? '')
  }, [activeId, tabs, draftDirty])

  // Re-report bounds whenever the panel chrome rearranges (tabs added etc).
  useEffect(() => {
    reportBounds()
  }, [tabs.length, developerOpen, developerStatus?.evidence.length, reportBounds])

  const active = tabs.find((t) => t.id === activeId) ?? null

  const handleNavigate = () => {
    if (!active) return
    setDraftDirty(false)
    void window.api?.browser?.navigate({ id: active.id, url: urlDraft })
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--bg-primary)]">
      {/* Tab strip */}
      <div className="flex items-stretch border-b border-[var(--panel-border)] bg-[var(--bg-secondary)]">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((t) => {
            const isActive = t.id === activeId
            return (
              <div
                key={t.id}
                className={`group flex min-w-[100px] max-w-[200px] shrink-0 items-center gap-1 border-r border-[var(--panel-border)] px-2 py-1.5 text-[12px] ${
                  isActive
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => window.api?.browser?.setActiveTab({ id: t.id })}
                  className="flex min-w-0 flex-1 items-center gap-1 text-left"
                  title={t.url}
                >
                  {t.loading && (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
                  )}
                  <span className="truncate">{t.title || t.url || 'New tab'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.api?.browser?.closeTab({ id: t.id })
                  }}
                  className="ml-1 rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] group-hover:opacity-100"
                  aria-label="Close tab"
                  title="Close tab"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => void window.api?.browser?.newTab({})}
          className="flex shrink-0 items-center justify-center border-l border-[var(--panel-border)] px-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          title="New tab"
          aria-label="New tab"
        >
          <PlusGlyph />
        </button>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-1 border-b border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1.5">
        <button
          type="button"
          disabled={!active?.canGoBack}
          onClick={() => active && window.api?.browser?.back({ id: active.id })}
          className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30"
          title="Back"
        >
          <BackGlyph />
        </button>
        <button
          type="button"
          disabled={!active?.canGoForward}
          onClick={() => active && window.api?.browser?.forward({ id: active.id })}
          className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30"
          title="Forward"
        >
          <FwdGlyph />
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => active && window.api?.browser?.reload({ id: active.id })}
          className="rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30"
          title="Reload"
        >
          <ReloadGlyph />
        </button>
        <input
          type="text"
          value={urlDraft}
          onChange={(e) => {
            setDraftDirty(true)
            setUrlDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleNavigate()
            }
            if (e.key === 'Escape') {
              setDraftDirty(false)
              setUrlDraft(active?.url ?? '')
            }
          }}
          placeholder="Search Google or type a URL"
          className="ml-1 min-w-0 flex-1 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setDeveloperOpen((open) => !open)}
          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            developerOpen
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
          }`}
          aria-expanded={developerOpen}
          title="Browser Developer Mode"
        >
          Dev
        </button>
      </div>

      {developerOpen && (
        <div className="space-y-2 border-b border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-2 text-[11px] text-[var(--text-secondary)]">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={developerStatus?.enabled === true}
                disabled={developerBusy}
                onChange={(event) => void runDeveloperAction(() =>
                  window.api.browser.developerSetEnabled({ enabled: event.target.checked })
                )}
              />
              Developer Mode
            </label>
            <span className="truncate" title={developerStatus?.url ?? undefined}>
              Target: {developerStatus?.session?.targetId ?? developerStatus?.tabId ?? 'none'}
            </span>
            <span>
              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                developerStatus?.observation ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'
              }`} />
              {developerStatus?.observation ? 'Recording' : 'Detached'}
            </span>
            {developerStatus?.session && <span>CDP {developerStatus.session.protocolVersion}</span>}
            <span>Console {developerStatus?.observation?.consoleCount ?? 0}</span>
            <span>Network {developerStatus?.observation?.networkCount ?? 0}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="max-w-[280px] truncate" title={developerStatus?.origin ?? undefined}>
              Site: {developerStatus?.origin ?? 'HTTP(S) required'}
            </span>
            <select
              value={developerStatus?.siteDecision ?? 'ask'}
              disabled={developerBusy || !active || !developerStatus?.origin}
              onChange={(event) => void runDeveloperAction(() =>
                window.api.browser.developerSetSitePolicy({
                  id: active?.id,
                  decision: event.target.value as 'allow' | 'ask' | 'deny'
                })
              )}
              className="rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-1.5 py-1 text-[var(--text-primary)]"
              aria-label="Browser Developer site policy"
            >
              <option value="ask">Ask</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </select>
            {developerStatus?.session ? (
              <button
                type="button"
                disabled={developerBusy}
                onClick={() => void runDeveloperAction(() =>
                  window.api.browser.developerDetach({ id: active?.id })
                )}
                className="rounded border border-[var(--panel-border)] px-2 py-1 hover:bg-[var(--bg-tertiary)] disabled:opacity-40"
              >
                Detach
              </button>
            ) : (
              <button
                type="button"
                disabled={developerBusy || !developerStatus?.enabled || developerStatus?.siteDecision !== 'allow'}
                onClick={() => void runDeveloperAction(() =>
                  window.api.browser.developerAttach({ id: active?.id })
                )}
                className="rounded border border-[var(--panel-border)] px-2 py-1 hover:bg-[var(--bg-tertiary)] disabled:opacity-40"
              >
                Attach + record
              </button>
            )}
            <button
              type="button"
              disabled={developerBusy || !developerStatus?.session}
              onClick={() => void runDeveloperAction(() =>
                window.api.browser.developerClear({ id: active?.id })
              )}
              className="rounded border border-[var(--panel-border)] px-2 py-1 hover:bg-[var(--bg-tertiary)] disabled:opacity-40"
            >
              Clear evidence
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={annotationLabel}
              onChange={(event) => setAnnotationLabel(event.target.value)}
              placeholder="Annotation label (optional)"
              maxLength={120}
              className="min-w-[180px] flex-1 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-primary)]"
            />
            <input
              value={annotationX}
              onChange={(event) => setAnnotationX(event.target.value)}
              inputMode="numeric"
              aria-label="Annotation x coordinate"
              className="w-14 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-1.5 py-1 text-[var(--text-primary)]"
            />
            <input
              value={annotationY}
              onChange={(event) => setAnnotationY(event.target.value)}
              inputMode="numeric"
              aria-label="Annotation y coordinate"
              className="w-14 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-1.5 py-1 text-[var(--text-primary)]"
            />
            <button
              type="button"
              disabled={developerBusy || !developerStatus?.session}
              onClick={() => {
                const label = annotationLabel.trim()
                const annotations = label
                  ? [{ label, x: Number(annotationX) || 0, y: Number(annotationY) || 0 }]
                  : []
                void runDeveloperAction(() => window.api.browser.developerCapture({
                  id: active?.id,
                  annotations
                }))
              }}
              className="rounded bg-[var(--accent)] px-2 py-1 font-medium text-white disabled:opacity-40"
            >
              Capture screenshot
            </button>
          </div>

          {developerError && <div role="alert" className="text-red-500">{developerError}</div>}
          {(developerStatus?.evidence.length ?? 0) > 0 && (
            <div className="max-h-24 space-y-1 overflow-y-auto" aria-label="Captured browser evidence">
              {[...(developerStatus?.evidence ?? [])].reverse().map((record) => (
                <div key={record.referenceId} className="rounded bg-[var(--bg-primary)] px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono" title={record.path}>{record.referenceId}</span>
                    <span className="shrink-0">{Math.ceil(record.bytes / 1024)} KiB</span>
                  </div>
                  {record.annotations.length > 0 && (
                    <div className="truncate text-[var(--text-muted)]">
                      Annotations: {record.annotations.map((annotation) =>
                        `${annotation.label ?? annotation.id ?? 'mark'} @ ${annotation.x ?? 0},${annotation.y ?? 0}`
                      ).join(' | ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content area — WebContentsView overlays this via reported bounds. */}
      <div ref={contentRef} className="min-h-0 flex-1 bg-white" />
    </div>
  )
}
