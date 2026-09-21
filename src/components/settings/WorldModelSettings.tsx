import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings-store'

// Workspace World Model Phase WM-13 — the Settings UI for the GAVEL-style
// verify/repair/follow-through layer. These values are read fresh by
// world-model-config.ts on every tool dispatch and at turn start, so no IPC
// patch is needed beyond settings:set. The layer ships ON ('full') as a
// deliberate extension past the Opus 4.5 era target; 'off' restores the
// pre-phase dispatch exactly.

type Mode = 'off' | 'verify' | 'repair' | 'full'

const MODE_OPTIONS: { value: Mode; label: string; blurb: string }[] = [
  { value: 'off', label: 'Off', blurb: 'Tool calls dispatch exactly as they did before this feature. No checks.' },
  { value: 'verify', label: 'Verify', blurb: 'Check each tool call against the workspace first; return a structured explanation instead of running a doomed one.' },
  { value: 'repair', label: 'Repair', blurb: 'Verify, plus fix mechanical mistakes (a wrong path, a whitespace-only patch mismatch) without spending a model turn.' },
  { value: 'full', label: 'Full', blurb: 'Repair, plus extract the goals of a coding request and keep working until they are met or a ceiling is hit.' }
]

interface NumberRowProps {
  id: string
  label: string
  hint: string
  value: number
  onCommit: (n: number) => void
  defaultValue: number
  min: number
  unit: string
}

function NumberRow({ id, label, hint, value, onCommit, defaultValue, min, unit }: NumberRowProps) {
  const [draft, setDraft] = useState<string>(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = (): void => {
    const raw = Number(draft)
    if (!Number.isFinite(raw)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.max(min, Math.round(raw))
    setDraft(String(clamped))
    onCommit(clamped)
  }

  return (
    <label
      htmlFor={id}
      className="flex flex-col gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-[var(--text-primary)]">{label}</span>
        <button
          type="button"
          onClick={() => {
            setDraft(String(defaultValue))
            onCommit(defaultValue)
          }}
          className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] underline-offset-2 hover:underline"
        >
          reset · {defaultValue}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={0}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          className="w-28 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        />
        <span className="font-mono text-[11px] text-[var(--text-muted)]">{unit}</span>
      </div>
      <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">{hint}</span>
    </label>
  )
}

export function WorldModelSettings() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const mode = (settings.workspaceWorldModel ?? 'full') as Mode
  const repairBudget = settings.worldModelRepairBudget ?? 5
  const followRounds = settings.worldModelFollowThroughRounds ?? 5
  const extractionModel = settings.worldModelExtractionModel ?? ''

  const showBudgets = mode === 'repair' || mode === 'full'

  return (
    <div className="space-y-5">
      <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)]">World model</h3>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        Before a tool call runs, the world model checks it against what actually exists in the
        workspace — the file being patched exists and hasn&apos;t changed under you, the patch
        still lines up, the path is real. A call that can&apos;t succeed comes back with the reason
        instead of failing blindly, mechanical mistakes get fixed without a model round trip, and in{' '}
        <span className="font-mono">full</span> mode the turn keeps working until the goals of the
        request are met. It is on by default; set it to <span className="font-mono">off</span> to
        dispatch tool calls with no checks.
      </p>

      <section className="space-y-2">
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Mode
        </h4>
        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => void updateSettings({ workspaceWorldModel: opt.value })}
              aria-pressed={active}
              className={`flex w-full items-start gap-3 rounded border p-3 text-left transition-colors ${
                active
                  ? 'border-[var(--accent)] bg-[var(--bg-tertiary)]'
                  : 'border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)]'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border ${
                  active ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--text-muted)]'
                }`}
              />
              <span className="flex flex-col">
                <span className="text-xs font-medium text-[var(--text-primary)]">{opt.label}</span>
                <span className="text-[12px] leading-relaxed text-[var(--text-muted)]">{opt.blurb}</span>
              </span>
            </button>
          )
        })}
      </section>

      <section className={`space-y-3 ${showBudgets ? '' : 'opacity-60'}`}>
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Budgets
        </h4>
        <NumberRow
          id="worldModelRepairBudget"
          label="Interventions per turn"
          hint="How many times per turn the world model may step in (a verdict returned, a repair applied, a batch rejected) before it stands aside for the rest of the turn so a stuck model can still finish. 0 turns the repair tier off."
          value={repairBudget}
          onCommit={(n) => void updateSettings({ worldModelRepairBudget: n })}
          defaultValue={5}
          min={0}
          unit="interventions (0 = no repair)"
        />
        <NumberRow
          id="worldModelFollowThroughRounds"
          label="Follow-through rounds"
          hint="Full mode only: after the model says it is done, how many extra rounds it may be asked to keep going while extracted goals are still unmet. 0 disables follow-through. The normal per-turn round cap still applies."
          value={followRounds}
          onCommit={(n) => void updateSettings({ worldModelFollowThroughRounds: n })}
          defaultValue={5}
          min={0}
          unit="rounds (0 = off)"
        />
      </section>

      <section className="space-y-2">
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Goal extraction model
        </h4>
        <label
          htmlFor="worldModelExtractionModel"
          className="flex flex-col gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]"
        >
          <input
            id="worldModelExtractionModel"
            type="text"
            value={extractionModel}
            placeholder="(use the conversation's model)"
            onChange={(e) => void updateSettings({ worldModelExtractionModel: e.target.value.trim() })}
            className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          />
          <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">
            Full mode makes one small structured call at the start of a coding turn to extract its
            goals. Leave blank to reuse the conversation&apos;s model, or name a cheaper model id to
            keep the extraction lightweight.
          </span>
        </label>
      </section>
    </div>
  )
}
