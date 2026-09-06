import { useEffect, useRef, useState } from 'react'
import { EMPTY_WORKSPACE, workspaceKey } from '@/lib/workspace-state'
import { RightPanelHome } from '@/components/artifacts/RightPanelHome'
import { useUiStore, type ToolId } from '@/stores/ui-store'
import { FilesPanel } from './panels/FilesPanel'
import { SideChatPanel } from './panels/SideChatPanel'
import { BrowserPanel } from './panels/BrowserPanel'
import { ReviewPanel } from './panels/ReviewPanel'
import { TerminalPanel } from './panels/TerminalPanel'
import { PlanToolPanel } from './panels/PlanToolPanel'
import { BackgroundTasksPanel } from './panels/BackgroundTasksPanel'
import { AfterActionPanel } from './panels/AfterActionPanel'
import { LoopsPanel } from './panels/LoopsPanel'
import { AgentsPanel } from './panels/AgentsPanel'
import { EnvironmentPanel } from '@/components/workspace/EnvironmentPanel'
import { SourcesPanel } from '@/components/workspace/SourcesPanel'
import { ArtifactsPanel } from '@/components/workspace/ArtifactsPanel'

const TOOL_LABELS: Record<ToolId, string> = {
  files: 'Files',
  sidechat: 'Side chat',
  browser: 'Browser',
  review: 'Review',
  terminal: 'Terminal',
  environment: 'Environment',
  sources: 'Sources',
  artifacts: 'Artifacts',
  plan: 'Plan',
  background: 'Background tasks',
  afterAction: 'After action',
  loop: 'Loops',
  agents: 'Agents'
}

function renderToolBody(tool: ToolId): React.ReactElement {
  switch (tool) {
    case 'files':
      return <FilesPanel />
    case 'sidechat':
      return <SideChatPanel />
    case 'browser':
      return <BrowserPanel />
    case 'review':
      return <ReviewPanel />
    case 'terminal':
      return <TerminalPanel />
    case 'environment':
      return <EnvironmentPanel />
    case 'sources':
      return <SourcesPanel />
    case 'artifacts':
      return <ArtifactsPanel />
    case 'plan':
      return <PlanToolPanel />
    case 'background':
      return <BackgroundTasksPanel />
    case 'afterAction':
      return <AfterActionPanel />
    case 'loop':
      return <LoopsPanel />
    case 'agents':
      return <AgentsPanel />
  }
}

interface ToolsPanelProps {
  onCollapse: () => void
}

export function ToolsPanel({ onCollapse }: ToolsPanelProps) {
  const activeTool = useUiStore(s => s.activeTool)
  const taskId = useUiStore(s => s.activeRightPanelConvId)
  const workspace = useUiStore(s => s.workspaces[workspaceKey(s.activeRightPanelConvId)] ?? EMPTY_WORKSPACE)
  const select = useUiStore(s => s.selectWorkspaceResource)
  const close = useUiStore(s => s.closeWorkspaceResource)
  const open = useUiStore(s => s.setActiveTool)
  const focusRequested = useUiStore(s => s.workspaceFocusRequested)
  const consumeFocus = useUiStore(s => s.consumeWorkspaceFocus)
  const [adding, setAdding] = useState(false)
  const content = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const add = useRef<HTMLButtonElement>(null)
  const active = workspace.tabs.find(tab => tab.id === workspace.activeId)

  useEffect(() => {
    if (!focusRequested) return
    content.current?.focus({ preventScroll: true })
    consumeFocus()
  }, [focusRequested, consumeFocus])

  const focusTab = (id: string | null) => {
    requestAnimationFrame(() => {
      const tabs = strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      const target = Array.from(tabs ?? []).find(tab => tab.dataset.resourceId === id)
      ;(target ?? add.current)?.focus()
    })
  }
  const closeTab = (id: string) => {
    close(id)
    const next = useUiStore.getState().workspaces[workspaceKey(taskId)]
    focusTab(next?.activeId ?? null)
  }

  return (
    <>
      <div className="flex min-h-10 shrink-0 items-center border-b border-[var(--panel-border)] px-1">
        <div ref={strip} role="tablist" aria-label="Workspace resources" className="flex min-w-0 flex-1 overflow-x-auto">
          {workspace.tabs.map((tab, index) => (
            <div key={tab.id} className="flex shrink-0 items-center">
              <button role="tab" id={`workspace-tab-${index}`} aria-controls="workspace-content"
                aria-selected={tab.id === workspace.activeId} tabIndex={tab.id === workspace.activeId ? 0 : -1}
                data-resource-id={tab.id} title={tab.ref} onClick={() => select(tab.id)}
                onKeyDown={event => {
                  let next: number
                  if (event.key === 'ArrowRight') next = (index + 1) % workspace.tabs.length
                  else if (event.key === 'ArrowLeft') next = (index - 1 + workspace.tabs.length) % workspace.tabs.length
                  else if (event.key === 'Home') next = 0
                  else if (event.key === 'End') next = workspace.tabs.length - 1
                  else if (event.key === 'Delete') { event.preventDefault(); closeTab(tab.id); return }
                  else return
                  event.preventDefault()
                  select(workspace.tabs[next].id)
                  focusTab(workspace.tabs[next].id)
                }}
                className={`min-h-8 max-w-40 truncate rounded px-2 text-xs ${tab.id === workspace.activeId ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}>
                {tab.kind === 'file' || tab.kind === 'artifact' ? tab.title : TOOL_LABELS[tab.kind]}
              </button>
              <button aria-label={`Close ${tab.kind === 'file' || tab.kind === 'artifact' ? tab.title : TOOL_LABELS[tab.kind]} tab`}
                onClick={() => closeTab(tab.id)} className="h-8 w-6 shrink-0 rounded text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">×</button>
            </div>
          ))}
        </div>
        <button ref={add} aria-label="Add workspace tab" aria-expanded={adding} onClick={() => setAdding(!adding)} className="h-8 w-8 shrink-0 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">+</button>
        <button onClick={onCollapse} aria-label="Collapse panel" title="Collapse panel" className="h-8 w-8 shrink-0 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">›</button>
      </div>
      {adding && <div role="group" aria-label="Add workspace resource" onKeyDown={event => { if (event.key === 'Escape') { setAdding(false); add.current?.focus() } }} className="flex shrink-0 flex-wrap gap-1 border-b border-[var(--panel-border)] p-2">
        {(Object.keys(TOOL_LABELS) as ToolId[]).map(tool => <button key={tool} className="min-h-8 rounded px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]" onClick={() => { open(tool); setAdding(false) }}>{TOOL_LABELS[tool]}</button>)}
      </div>}
      <div ref={content} id="workspace-content" role={active ? 'tabpanel' : 'region'} aria-label={active ? undefined : 'Workspace'} aria-labelledby={active ? `workspace-tab-${workspace.tabs.indexOf(active)}` : undefined} tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none">
        {activeTool ? <div key={`${taskId}:${active?.id ?? activeTool}`} className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderToolBody(activeTool)}</div> : <>
          <p className="px-3 pt-3 text-xs text-[var(--text-muted)]">Open a file or add a workspace tab.</p>
          <RightPanelHome onCollapse={onCollapse} />
        </>}
      </div>
    </>
  )
}
