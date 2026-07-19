import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import { useModelStore } from '@/stores/model-store'

// Agentic Orchestration Phase AO-1 — Settings UI for the local orchestration
// layer. Values are read fresh by the strategies + IPC (orchestration-config.ts)
// on every run, so no IPC patch beyond settings:set. A deliberate extension past
// the Opus 4.5 era-lock; ships OFF by default.
//
// ponytail: local NumberRow duplicates LoopSettings' helper rather than
// extracting a shared component — a 40-line settings helper across two panels
// is lower-risk than refactoring a shipped panel. Extract if a third reuses it.

const DEFAULTS = {
  orchMaxTokensPerRun: 400000,
  orchMaxWallclockMin: 30, // 1_800_000 ms
  orchMaxCandidates: 4,
  orchMaxDepth: 2
}

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
    const clamped = raw <= 0 && min === 0 ? 0 : Math.max(min, Math.round(raw))
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
      <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">
        {hint}
      </span>
    </label>
  )
}

export function OrchestrationSettings() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const models = useModelStore((s) => s.models)
  const loadModels = useModelStore((s) => s.loadModels)

  useEffect(() => {
    if (models.length === 0) void loadModels()
  }, [models.length, loadModels])

  const enabled = settings.orchestrationEnabled ?? false
  const maxTokens = settings.orchMaxTokensPerRun ?? DEFAULTS.orchMaxTokensPerRun
  const maxWallclockMin = Math.round((settings.orchMaxWallclockMs ?? 1_800_000) / 60_000)
  const maxCandidates = settings.orchMaxCandidates ?? DEFAULTS.orchMaxCandidates
  const maxDepth = settings.orchMaxDepth ?? DEFAULTS.orchMaxDepth
  const advisorModel = settings.orchAdvisorModel ?? ''

  return (
    <div className="space-y-5">
      <h3 className="font-mono text-sm font-semibold text-[var(--text-primary)]">Orchestration</h3>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        A light local orchestration layer: sub-agents get their own{' '}
        <span className="font-mono">identity</span> with approve/refuse tool grants, every run is
        metered against a <span className="font-mono">budget</span> with receipts, and the model can
        compose strategies — <span className="font-mono">fan-out + judge</span>,{' '}
        <span className="font-mono">generator + critic</span>,{' '}
        <span className="font-mono">advisor escalation</span>. A deliberate extension past the Opus
        4.5 era target; ships{' '}
        <span className="font-medium text-[var(--text-secondary)]">off by default</span>. When off,
        no orchestration tools reach the model and{' '}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">/fanout</code>,{' '}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">/critique</code>,{' '}
        <code className="rounded bg-[var(--bg-tertiary)] px-1">/outcome</code> are refused. Manage
        live agents in the right-panel Agents pill.
      </p>

      {/* Master toggle */}
      <button
        type="button"
        onClick={() => void updateSettings({ orchestrationEnabled: !enabled })}
        className="flex w-full items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-left transition-colors hover:border-[var(--accent)]"
      >
        <span className="flex flex-col">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            Enable orchestration
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {enabled
              ? 'On — strategy tools, slash commands, and per-agent identities are active.'
              : 'Off — no orchestration tools reach the model; slash commands are refused.'}
          </span>
        </span>
        <span
          aria-hidden
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
          />
        </span>
      </button>

      <section className={`space-y-3 ${enabled ? '' : 'opacity-60'}`}>
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Ceilings (bound every orchestrated run, enforced outside the model)
        </h4>
        <NumberRow
          id="orchMaxTokensPerRun"
          label="Token budget per run"
          hint="Hard stop: an orchestrated run (all its sub-agents combined) aborts once estimated tokens cross this. Breach is reported honestly with a partial-spend receipt. 0 = unbounded (not recommended)."
          value={maxTokens}
          onCommit={(n) => void updateSettings({ orchMaxTokensPerRun: n })}
          defaultValue={DEFAULTS.orchMaxTokensPerRun}
          min={0}
          unit="tokens (0 = off)"
        />
        <NumberRow
          id="orchMaxWallclock"
          label="Max wall-clock per run"
          hint="Hard stop: an orchestrated run aborts once this much active time has elapsed."
          value={maxWallclockMin}
          onCommit={(n) => void updateSettings({ orchMaxWallclockMs: Math.max(1, n) * 60_000 })}
          defaultValue={DEFAULTS.orchMaxWallclockMin}
          min={1}
          unit="minutes"
        />
        <NumberRow
          id="orchMaxCandidates"
          label="Max fan-out candidates"
          hint="Ceiling on N for fan-out + judge. A composite strategy multiplies token volume by the number of candidates, so this caps the multiplier."
          value={maxCandidates}
          onCommit={(n) => void updateSettings({ orchMaxCandidates: n })}
          defaultValue={DEFAULTS.orchMaxCandidates}
          min={1}
          unit="candidates"
        />
        <NumberRow
          id="orchMaxDepth"
          label="Max fork-tree depth"
          hint="How deep sub-agents may nest sub-agents. Bounds internal agent-to-agent fan-out; the default 2 allows a strategy to run its candidates but not unbounded recursion."
          value={maxDepth}
          onCommit={(n) => void updateSettings({ orchMaxDepth: n })}
          defaultValue={DEFAULTS.orchMaxDepth}
          min={1}
          unit="levels"
        />
      </section>

      <section className={`space-y-2 ${enabled ? '' : 'opacity-60'}`}>
        <h4 className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-muted)]">
          Advisor model
        </h4>
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          The smarter model a stuck sub-agent escalates one bounded question to (advisor pattern).
          Leave unset to disable the{' '}
          <code className="rounded bg-[var(--bg-tertiary)] px-1">agent_advisor</code> tool. Point it
          at a frontier model even when your generators are local — that is the provider
          substrate working for you.
        </p>
        <select
          value={advisorModel}
          onChange={(e) => void updateSettings({ orchAdvisorModel: e.target.value })}
          className="w-full rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        >
          <option value="">— none (advisor disabled) —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </section>
    </div>
  )
}
