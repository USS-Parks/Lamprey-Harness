import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useUiStore, SIDEBAR_BOUNDS } from '@/stores/ui-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useNavHistoryStore } from '@/stores/nav-history-store'
import { useMediaQuery, NARROW_VIEWPORT_QUERY } from '@/hooks/useMediaQuery'
import { useResizeDrag } from '@/hooks/useResizeDrag'
import { PopoverMenu } from '@/components/ui/PopoverMenu'
import { ActivityDashboard } from '@/components/activity/ActivityDashboard'
import { SessionsSidebar } from './SessionsSidebar'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
import type { Project } from '@/lib/types'
import newChatIcon from '@assets/Lamprey New Chat Icon.png'
import pluginsIcon from '@assets/Lamprey Plugins Icon.png'
import settingsIcon from '@assets/Lamprey Settings Icon.png'
import automationsIcon from '@assets/Lamprey Project History Icon Light View.png'

const control = 'min-h-8 rounded px-2 text-xs hover:bg-[var(--bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
function ProjectShortcut({ project }: { project: Project }) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(project.name)
  const anchor = useRef<HTMLButtonElement>(null)
  const active = useProjectsStore(s => s.activeProjectId)
  const rename = async () => {
    if (!name.trim()) return
    await useProjectsStore.getState().renameProject(project.id, name.trim())
    if (useProjectsStore.getState().projects.find(row => row.id === project.id)?.name === name.trim()) setRenaming(false)
  }
  const newTask = async () => {
    const id = await useChatStore.getState().createConversation()
    if (!id) return
    await useProjectsStore.getState().assignConversation(id, project.id)
    await useChatStore.getState().loadConversations()
  }
  const action = (label: string, fn: () => void, disabled = false) => <button key={label} role="menuitem" disabled={disabled} className={`${control} block w-full text-left disabled:opacity-50`} onClick={() => { setOpen(false); fn() }}>{label}</button>
  return <div className="flex min-w-0 items-center gap-1" data-project-id={project.id}>
    {renaming ? <form className="flex min-w-0 flex-1" onSubmit={event => { event.preventDefault(); void rename() }}>
      <input autoFocus aria-label="Rename project" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false) }} className="min-w-0 flex-1 rounded bg-[var(--bg-primary)] px-2 text-xs" />
      <button className={control} type="submit">Save</button><button className={control} type="button" onClick={() => setRenaming(false)}>Cancel</button>
    </form> : <button type="button" title={project.name || 'Untitled project'} className={`${control} min-w-0 flex-1 truncate text-left ${active === project.id ? 'bg-[var(--bg-tertiary)]' : ''}`} onClick={() => useUiStore.getState().openProjectView(project.id)}>{project.pinned ? '★ ' : ''}{project.name || 'Untitled project'}</button>}
    <button ref={anchor} type="button" aria-label={`Project actions: ${project.name}`} className={control} onClick={() => setOpen(value => !value)}>⋯</button>
    <PopoverMenu open={open} onClose={() => setOpen(false)} anchorRef={anchor} ariaLabel="Project actions" minWidth={190}>
      {action('New task in project', () => void newTask())}
      {action('Rename project', () => { setName(project.name); setRenaming(true) })}
      {action(project.pinned ? 'Unpin project' : 'Pin project', () => void useProjectsStore.getState().pinProject(project.id, !project.pinned))}
      {action('Open folder', () => void useProjectsStore.getState().openFolder(project.id), !project.path)}
      {action('Copy path', () => void useProjectsStore.getState().copyPath(project.id), !project.path)}
      {action('Manage worktrees', () => useUiStore.getState().openWorktreeModal(project.id), !project.path)}
      {action('Archive project', () => { if (confirm(`Archive "${project.name}"? Tasks are retained.`)) void useProjectsStore.getState().archiveProject(project.id, true) })}
    </PopoverMenu>
  </div>
}

export function Sidebar() {
  const collapsed = useUiStore(s => s.sidebarCollapsed)
  const setCollapsed = useUiStore(s => s.setSidebarCollapsed)
  const width = useUiStore(s => s.sidebarWidth)
  const setWidth = useUiStore(s => s.setSidebarWidth)
  const searchToken = useUiStore(s => s.searchFocusToken)
  const projects = useProjectsStore(s => s.projects)
  const loadProjects = useProjectsStore(s => s.loadProjects)
  const stack = useNavHistoryStore(s => s.stack)
  const index = useNavHistoryStore(s => s.index)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const narrow = useMediaQuery(NARROW_VIEWPORT_QUERY)
  const { dragging, onResizeStart } = useResizeDrag(width, setWidth, SIDEBAR_BOUNDS)
  useEffect(() => { void loadProjects() }, [loadProjects])
  useEffect(() => {
    if (!searchToken) return
    setCollapsed(false)
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [searchToken, setCollapsed])
  const navigate = async (direction: 'back' | 'forward') => {
    const history = useNavHistoryStore.getState()
    history.startReplay()
    try {
      const id = direction === 'back' ? history.goBack() : history.goForward()
      if (id) await useChatStore.getState().selectConversation(id)
    } finally { history.endReplay() }
  }
  const newTask = async () => {
    if (creating) return
    setCreating(true)
    try {
      useUiStore.getState().closeProjectView(); useUiStore.getState().closeCustomize()
      await useChatStore.getState().createConversation()
      if (narrow) setCollapsed(true)
    } finally { setCreating(false) }
  }
  const footer = <div className={`mt-auto flex shrink-0 gap-1 border-t border-[var(--panel-border)] p-2 ${collapsed ? 'flex-col' : 'flex-wrap'}`}>
    {[
      { label: 'Customize', icon: pluginsIcon, action: () => useUiStore.getState().openCustomize() },
      { label: 'Automations', icon: automationsIcon, action: () => useUiStore.getState().openSettings('automations') },
      { label: 'Settings', icon: settingsIcon, action: () => useUiStore.getState().openSettings() }
    ].map(item => <button key={item.label} type="button" aria-label={item.label} title={item.label} onClick={item.action} className={`${control} flex items-center justify-center gap-1 px-1`}><img src={item.icon} alt="" className="icon-asset themed-variant-light h-5 w-5" />{!collapsed && item.label}</button>)}
  </div>
  const body = collapsed ? <>
    <button className={control} aria-label="Expand sidebar" title="Expand sidebar (Ctrl+B)" onClick={() => setCollapsed(false)}>›</button>
    <button className={control} aria-label="New task" title="New task (Ctrl+N)" disabled={creating} onClick={() => void newTask()}><img src={newChatIcon} alt="" className="icon-asset themed-variant-light h-6 w-6" /></button>
    <button className={control} aria-label="Search" title="Search tasks" onClick={() => useUiStore.getState().requestSearchFocus()}>⌕</button>
    {footer}
  </> : <>
    <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
      <button className={control} aria-label="Collapse sidebar" title="Collapse sidebar (Ctrl+B)" onClick={() => setCollapsed(true)}>‹</button>
      <button className={control} aria-label="Back" title="Back" disabled={index <= 0} onClick={() => void navigate('back')}>←</button>
      <button className={control} aria-label="Forward" title="Forward" disabled={index < 0 || index >= stack.length - 1} onClick={() => void navigate('forward')}>→</button>
      <button className={`${control} ml-auto flex items-center gap-1`} aria-label="New task" title="New task (Ctrl+N)" disabled={creating} onClick={() => void newTask()}><img src={newChatIcon} alt="" className="icon-asset themed-variant-light h-5 w-5" />New task</button>
    </div>
    <ActivityDashboard />
    <section aria-label="Projects" className="max-h-[22%] shrink-0 overflow-y-auto px-2 py-1">
      <div className="flex items-center justify-between"><span className="px-2 text-xs text-[var(--text-muted)]">Projects</span><button className={control} aria-label="New project" title="New project" onClick={() => setNewProjectOpen(true)}>+</button></div>
      {projects.filter(project => !project.archived).map(project => <ProjectShortcut key={project.id} project={project} />)}
      {projects.length === 0 && <p className="px-2 text-xs text-[var(--text-muted)]">Add a project to group your work.</p>}
    </section>
    <div className="min-h-0 flex-1"><SessionsSidebar embedded searchRef={searchRef} onSelected={() => { if (narrow) setCollapsed(true) }} /></div>
    {footer}
  </>
  return <>
    {narrow && !collapsed && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-black/40" onClick={() => setCollapsed(true)} />}
    <aside aria-label="Task sidebar" className={`panel-shadow flex shrink-0 flex-col overflow-hidden bg-[var(--panel-bg)] ${narrow && !collapsed ? 'fixed bottom-0 left-0 top-0 z-30 rounded-r-[var(--panel-radius)]' : 'relative h-full rounded-[var(--panel-radius)]'}`} style={{ width: collapsed ? 48 : narrow ? `min(${width}px, calc(100vw - 48px))` : width }}>
      {body}
      {!collapsed && !narrow && <div onMouseDown={onResizeStart} className={`resize-handle-v resize-handle-v-right ${dragging ? 'dragging' : ''}`} />}
    </aside>
    <NewProjectModal open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
  </>
}
