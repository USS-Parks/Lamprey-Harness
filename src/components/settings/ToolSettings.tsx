import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'

// AC-20 / AC-24 — Settings → Tools. Surface + spill live here. Browser
// Developer Mode stays armed from the Browser panel (K7: no second toggle).

export function ToolSettings() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const setActiveTool = useUiStore((s) => s.setActiveTool)

  const surface = settings.toolSurface ?? 'full'
  const spillOn = settings.toolResultSpill !== false
  const spillBytes = settings.toolResultSpillBytes ?? 8192

  const [draftBytes, setDraftBytes] = useState(String(spillBytes))
  useEffect(() => setDraftBytes(String(spillBytes)), [spillBytes])

  const commitBytes = (): void => {
    const raw = Number(draftBytes)
    if (!Number.isFinite(raw) || raw < 0) {
      setDraftBytes(String(spillBytes))
      return
    }
    const next = Math.round(raw)
    setDraftBytes(String(next))
    void updateSettings({ toolResultSpillBytes: next })
  }

  const openBrowserPanel = (): void => {
    closeSettings()
    setActiveTool('browser')
  }

  return (
    <div className="space-y-5">
      <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)]">Tools</h3>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        How the model sees the tool catalog, and when a long tool result is
        spilled to disk instead of stuffed into the next round.
      </p>

      <section className="space-y-3">
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Tool surface
        </h4>
        <label className="flex flex-col gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Catalog sent each turn</span>
          <select
            value={surface}
            onChange={(e) =>
              void updateSettings({ toolSurface: e.target.value === 'lazy' ? 'lazy' : 'full' })
            }
            className="mt-1 w-48 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          >
            <option value="full">full — every tool, every turn</option>
            <option value="lazy">lazy — core set + tool_search unlocks</option>
          </select>
          <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">
            Era default is full. Lazy sends the small always-on CORE set plus
            tool_search; the model unlocks more tools as it needs them.
          </span>
        </label>
      </section>

      <section className="space-y-3">
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Result spill
        </h4>
        <button
          type="button"
          onClick={() => void updateSettings({ toolResultSpill: !spillOn })}
          className="flex w-full items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-left transition-colors hover:border-[var(--accent)]"
        >
          <span className="flex flex-col">
            <span className="text-xs font-medium text-[var(--text-primary)]">Spill long tool results</span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {spillOn
                ? 'On — results over the byte cap become a head/tail preview + ref.'
                : 'Off — the full result stays in the next model round.'}
            </span>
          </span>
          <span
            aria-hidden
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${spillOn ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${spillOn ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </span>
        </button>
        <label
          htmlFor="toolResultSpillBytes"
          className="flex flex-col gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]"
        >
          <span className="font-medium text-[var(--text-primary)]">Spill threshold</span>
          <div className="flex items-center gap-2">
            <input
              id="toolResultSpillBytes"
              type="number"
              min={0}
              step={1}
              value={draftBytes}
              onChange={(e) => setDraftBytes(e.target.value)}
              onBlur={commitBytes}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              className="w-28 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="font-mono text-[11px] text-[var(--text-muted)]">bytes (0 = off)</span>
          </div>
        </label>
      </section>

      <section className="space-y-2">
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Browser Developer Mode
        </h4>
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          Armed from the Browser panel, not here. No second toggle.
        </p>
        <button
          type="button"
          onClick={openBrowserPanel}
          className="font-mono text-[11px] text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Open Browser panel
        </button>
      </section>
    </div>
  )
}
