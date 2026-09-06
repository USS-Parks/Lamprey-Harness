import { useUiStore } from '@/stores/ui-store'
import { workspaceKey } from '@/lib/workspace-state'
import { useResizeDrag } from '@/hooks/useResizeDrag'
import { TerminalPanel } from './panels/TerminalPanel'

const BOUNDS = { min: 120, max: 600 }

export function TerminalDock() {
  const open = useUiStore(s => s.workspaces[workspaceKey(s.activeRightPanelConvId)]?.terminalOpen ?? false)
  const height = useUiStore(s => s.terminalHeight)
  const setHeight = useUiStore(s => s.setTerminalHeight)
  const { onResizeStart } = useResizeDrag(height, setHeight, BOUNDS, { axis: 'y', direction: -1 })
  if (!open) return null
  return <section aria-label="Terminal dock" className="panel-shadow relative mt-2 flex shrink-0 flex-col overflow-hidden rounded-[var(--panel-radius)] bg-[var(--panel-bg)]" style={{ height, maxHeight: '50vh' }}>
    <div role="separator" aria-label="Terminal height" aria-orientation="horizontal" aria-valuenow={height} aria-valuemin={BOUNDS.min} aria-valuemax={BOUNDS.max} tabIndex={0}
      onMouseDown={onResizeStart} onDoubleClick={() => setHeight(240)}
      onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setHeight(height + (event.key === 'ArrowUp' ? 20 : -20)) }
        else if (event.key === 'Home') setHeight(240)
      }} className="h-1 shrink-0 cursor-row-resize hover:bg-[var(--accent)]" />
    <TerminalPanel />
  </section>
}
