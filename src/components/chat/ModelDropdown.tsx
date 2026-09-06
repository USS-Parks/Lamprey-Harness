import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { useModelStore } from '@/stores/model-store'
import { canUseProvider, useProvidersStore } from '@/stores/providers-store'
import { PopoverMenu } from '@/components/ui/PopoverMenu'
import { toast } from '@/stores/toast-store'

export function ModelDropdown({ onRequestKey }: { onRequestKey: (providerId: string) => void }) {
  const modelMenuRequest = useUiStore(s => s.modelMenuRequest)
  const handledRequest = useRef(modelMenuRequest)
  const activeModel = useChatStore(s => s.activeModel)
  const setModel = useChatStore(s => s.setModel)
  const models = useModelStore(s => s.models)
  const loadModels = useModelStore(s => s.loadModels)
  const providers = useProvidersStore(s => s.providers)
  const loaded = useProvidersStore(s => s.loaded)
  const refreshProviders = useProvidersStore(s => s.refresh)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [readyOnly, setReadyOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const busy = useRef(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (modelMenuRequest === handledRequest.current) return
    handledRequest.current = modelMenuRequest
    setQuery(''); setOpen(true)
  }, [modelMenuRequest])
  const close = useCallback(() => setOpen(false), [])
  const active = models.find(model => model.id === activeModel)
  useEffect(() => {
    if (!open) return
    void refreshProviders()
  }, [open, refreshProviders])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    void loadModels().catch(cause => { if (!cancelled) setError(String(cause)) })
    search.current?.focus()
    return () => { cancelled = true }
  }, [open, loadModels])
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[data-active-model="true"]')?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [open, activeModel, models, readyOnly, query])
  const filtered = models.filter(model => {
    const provider = providers.find(item => item.id === model.provider)
    const matches = `${model.name} ${model.id} ${model.provider ?? ''} ${provider?.label ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
    return matches && (!readyOnly || canUseProvider(providers, model.provider))
  }).sort((a, b) => Number(canUseProvider(providers, b.provider)) - Number(canUseProvider(providers, a.provider)))
  const choose = async (id: string) => {
    if (busy.current || !loaded) return
    const model = models.find(item => item.id === id)
    if (!model) return
    if (!canUseProvider(providers, model.provider)) {
      close()
      if (model.provider) onRequestKey(model.provider)
      else toast.error('This model has no configured provider.')
      return
    }
    busy.current = true
    setSelecting(true)
    try { await setModel(id); close(); anchor.current?.focus() }
    finally { busy.current = false; setSelecting(false) }
  }
  return <>
    <button ref={anchor} type="button" title="Switch model" aria-label={`Model: ${active?.name ?? activeModel}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setQuery(''); setOpen(!open) }} className="flex min-h-8 min-w-0 items-center gap-1 rounded px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">
      <span className="max-w-40 truncate font-medium">{active?.name ?? activeModel}</span><span aria-hidden>⌄</span>
    </button>
    <PopoverMenu open={open} onClose={close} anchorRef={anchor} align="top-start" width="min(360px, calc(100vw - 16px))" role="menu" ariaLabel="Models" autoFocus={false}>
      <div className="space-y-2 p-2">
        <input ref={search} type="search" aria-label="Search models" placeholder="Search models or providers" value={query} onChange={event => setQuery(event.target.value)} className="min-h-8 w-full rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)]" />
        <button type="button" aria-pressed={readyOnly} onClick={() => setReadyOnly(!readyOnly)} className="min-h-8 rounded px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">{readyOnly ? 'Ready to use only' : 'All models'} · {filtered.length}</button>
        {error && <p role="alert" className="text-xs text-[var(--error)]">{error}</p>}
        {!loaded && <p role="status" className="text-xs text-[var(--text-muted)]">Checking provider setup…</p>}
      </div>
      <div ref={list} className="max-h-[min(70vh,36rem)] overflow-y-auto overscroll-contain">
        {filtered.map(m => {
          const provider = providers.find(item => item.id === m.provider)
          const ready = canUseProvider(providers, m.provider)
          return <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === activeModel} data-model-id={m.id} data-active-model={m.id === activeModel ? 'true' : undefined} disabled={!loaded || selecting} title={`${m.name}\n${m.id}\n${provider?.label ?? m.provider ?? 'No provider'}`} onClick={() => void choose(m.id)} className={`flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-tertiary)] disabled:opacity-50 ${m.id === activeModel ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
            <span className="min-w-0"><span className="block truncate font-medium">{m.name}</span><span className="block truncate text-[var(--text-muted)]">{provider?.label ?? m.provider ?? 'No provider'}</span></span>
            <span className={`shrink-0 text-[10px] ${ready ? 'text-[var(--text-muted)]' : 'text-[var(--warning)]'}`}>{!loaded ? 'Checking' : !ready ? 'Add key' : provider?.keyOptional ? 'No key needed' : 'Key stored'}{m.id === activeModel ? ' ✓' : ''}</span>
          </button>
        })}
        {filtered.length === 0 && <p role="status" className="p-3 text-xs text-[var(--text-muted)]">{models.length ? 'No matching models.' : 'No models loaded.'}</p>}
      </div>
      <button type="button" className="min-h-9 w-full border-t border-[var(--panel-border)] px-3 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]" onClick={() => { close(); useUiStore.getState().openSettings('models') }}>Model settings</button>
    </PopoverMenu>
  </>
}
