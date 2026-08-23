import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import { useProvidersStore } from '@/stores/providers-store'
import type { AppSettings } from '@/lib/types'

type ProviderSort = NonNullable<AppSettings['openrouterProviderSort']>

function linesToList(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    const id = line.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function listToLines(list: string[] | undefined): string {
  return (list ?? []).join('\n')
}

/**
 * TL-B4 — OpenRouter routing panel. Hidden from use until an OpenRouter key
 * is stored (opt-in; K4). Persists the same settings.json keys TL-B2/B3 read.
 */
export function OpenRouterRoutingSettings() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const hasKey = useProvidersStore((s) => s.hasKey)
  const refresh = useProvidersStore((s) => s.refresh)
  const loaded = useProvidersStore((s) => s.loaded)

  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])

  const enabled = hasKey('openrouter')
  const [fallbackDraft, setFallbackDraft] = useState(listToLines(settings.openrouterFallbacks))
  const [orderDraft, setOrderDraft] = useState(listToLines(settings.openrouterProviderOrder))
  const [ignoreDraft, setIgnoreDraft] = useState(listToLines(settings.openrouterProviderIgnore))

  useEffect(() => setFallbackDraft(listToLines(settings.openrouterFallbacks)), [settings.openrouterFallbacks])
  useEffect(() => setOrderDraft(listToLines(settings.openrouterProviderOrder)), [settings.openrouterProviderOrder])
  useEffect(() => setIgnoreDraft(listToLines(settings.openrouterProviderIgnore)), [settings.openrouterProviderIgnore])

  const sort: ProviderSort = settings.openrouterProviderSort ?? 'default'

  return (
    <div className="space-y-3 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3">
      <div>
        <h4 className="font-mono text-sm font-semibold text-[var(--text-primary)]">
          OpenRouter routing
        </h4>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Optional fallbacks and provider prefs on OpenRouter calls only. Direct providers
          (DeepSeek, Anthropic, …) are unchanged. Disabled until an OpenRouter key is stored.
          When a key is present, the model picker includes <span className="font-mono">openrouter/auto</span>.
          Auto may stick to one upstream model for the session; prompt cache can miss across swaps.
        </p>
      </div>
      {!enabled && (
        <p className="text-[12px] text-[var(--warning)]">
          Add an OpenRouter key on the API Keys tab to edit routing.
        </p>
      )}
      <label className="flex flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
        Fallback model ids (one per line)
        <textarea
          disabled={!enabled}
          value={fallbackDraft}
          onChange={(e) => setFallbackDraft(e.target.value)}
          onBlur={() => updateSettings({ openrouterFallbacks: linesToList(fallbackDraft) })}
          placeholder={'openai/gpt-4o-mini\ngoogle/gemini-flash-1.5'}
          rows={3}
          className="rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-40"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
        Provider sort
        <select
          disabled={!enabled}
          value={sort}
          onChange={(e) =>
            updateSettings({ openrouterProviderSort: e.target.value as ProviderSort })
          }
          className="rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-40"
        >
          <option value="default">default (OpenRouter chooses)</option>
          <option value="price">price</option>
          <option value="latency">latency</option>
          <option value="throughput">throughput</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
        Provider order (optional, one slug per line)
        <textarea
          disabled={!enabled}
          value={orderDraft}
          onChange={(e) => setOrderDraft(e.target.value)}
          onBlur={() => updateSettings({ openrouterProviderOrder: linesToList(orderDraft) })}
          placeholder={'Anthropic\nOpenAI'}
          rows={2}
          className="rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-40"
        />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
        Ignore providers (optional, one slug per line)
        <textarea
          disabled={!enabled}
          value={ignoreDraft}
          onChange={(e) => setIgnoreDraft(e.target.value)}
          onBlur={() => updateSettings({ openrouterProviderIgnore: linesToList(ignoreDraft) })}
          placeholder="Azure"
          rows={2}
          className="rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-40"
        />
      </label>
    </div>
  )
}
