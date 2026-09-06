import { useUiStore } from '@/stores/ui-store'
import { usePlanStore } from '@/stores/plan-store'
import { TOOL_LABELS } from '@/lib/workspace-tools'

export function RightPanelHome(): React.ReactElement {
  const open = useUiStore(s => s.setActiveTool)
  const owner = useUiStore(s => s.activeRightPanelConvId)
  const plan = usePlanStore(s => s.snapshot)
  const gated = usePlanStore(s => s.planModeActive)
  const hasPlan = plan?.conversationId === owner && plan.steps.length > 0
  return <div className="space-y-3 px-4 py-5 text-sm">
    <p className="text-[var(--text-secondary)]">Open a file, page, artifact, or review beside this task.</p>
    <div className="flex flex-wrap gap-2">
      {(['files', 'browser', 'artifacts', 'review'] as const).map(tool => <button key={tool} className="min-h-8 rounded px-3 text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]" onClick={() => open(tool)}>{TOOL_LABELS[tool]}</button>)}
    </div>
    {hasPlan && <button className="min-h-8 rounded px-3 text-[var(--accent)] hover:bg-[var(--bg-tertiary)]" onClick={() => open('plan')}>
      {gated ? 'Plan awaiting approval' : `Plan: ${plan.totals.done}/${plan.totals.total} complete`}
    </button>}
    <p className="text-xs text-[var(--text-muted)]">Use + for terminal, sources, task tools, and editor access.</p>
  </div>
}
