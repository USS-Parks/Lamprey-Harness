import { AutomationsPanel } from '@/components/automations/AutomationsPanel'

export function AutomationsSettings() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[14px] font-medium text-[var(--text-primary)]">Automations</h2>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          Local one-shot reminders, schedules, named events, and monitors. Lamprey must be running
          for a trigger to fire. Disabled, blocked, retrying, completed, and bound-goal states are
          shown explicitly below.
        </p>
      </div>
      <div className="min-h-[420px] rounded border border-[var(--panel-border)] bg-[var(--bg-primary)]">
        <AutomationsPanel />
      </div>
    </div>
  )
}
