import { useSettingsStore } from '@/stores/settings-store'

export function GeneralSettings() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  return (
    <div className="space-y-5">
      <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)]">General</h3>

      <section className="space-y-3">
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Conversation titles
        </h4>
        <label className="flex cursor-pointer items-start gap-3 rounded border border-[var(--panel-border)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]">
          <input
            type="checkbox"
            checked={settings.aiGeneratedTitles}
            onChange={(e) => updateSettings({ aiGeneratedTitles: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="flex-1">
            <span className="block font-medium text-[var(--text-primary)]">
              AI-generated titles
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-[var(--text-muted)]">
              After the first response, ask DeepSeek for a 3-5 word title. Defaults off - without it
              we use the first 40 characters of your opening message.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
            Follow-up behavior
          </h4>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
            Choose what Enter does while a turn is running. Tab uses the alternate action.
          </p>
        </div>
        <div role="radiogroup" aria-label="Follow-up behavior" className="grid grid-cols-2 gap-2">
          {(['steer', 'queue'] as const).map((mode) => {
            const selected = settings.followUpBehavior === mode
            const label = mode === 'steer' ? 'Steer' : 'Queue'
            const description =
              mode === 'steer'
                ? 'Add input to the current turn at its next safe boundary.'
                : 'Save input for the next turn without changing the current one.'
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => void updateSettings({ followUpBehavior: mode })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                    : 'border-[var(--panel-border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <span className="block text-[13px] font-medium text-[var(--text-primary)]">
                  {label}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">
                  {description}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
