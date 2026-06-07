import { useSettingsStore } from '@/stores/settings-store'

export function SeedBudgetSettings() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const value = settings.safeSeedLength ?? 8192

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Seed budget</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Maximum inline fork seed length before the seed is represented as an attached document marker.
        </p>
      </div>
      <label className="block text-xs text-[var(--text-secondary)]">
        <span className="mb-1 block">Inline seed limit</span>
        <input
          type="number"
          min={1000}
          max={100000}
          step={512}
          value={value}
          onChange={(e) => {
            const next = Math.max(1000, Math.min(100000, Number(e.target.value) || 8192))
            void updateSettings({ safeSeedLength: next })
          }}
          className="w-40 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
        />
      </label>
    </div>
  )
}
