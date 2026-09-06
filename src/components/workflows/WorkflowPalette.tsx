import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { APP_COMMANDS, executeCommand, shortcutHint, validateCommands, workflowCommands, type AppCommand } from '@/lib/app-commands'
import { searchCommands, type CommandFilter } from '@/lib/command-search'
import { rankWorkspaceFiles } from '@/lib/file-search'
import { reconcileTaskRows } from '@/lib/task-navigation'
import { useUiStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { useSessionsStore } from '@/stores/sessions-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useWorkflowsStore } from '@/stores/workflows-store'
import type { Conversation } from '@/lib/types'
import { WorkflowEditor } from './WorkflowEditor'

const FILTERS: { id: CommandFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'command', label: 'Commands' }, { id: 'task', label: 'Tasks' }, { id: 'file', label: 'Files' }, { id: 'settings', label: 'Settings' }, { id: 'workflow', label: 'Workflows' }]
interface FileIndex { revision: number; owner: string | null; root: string; files: string[]; truncated: boolean }

export function WorkflowPalette() {
  const visible = useUiStore(s => s.workflowPaletteVisible)
  const close = useUiStore(s => s.closeWorkflowPalette)
  const owner = useChatStore(s => s.activeConversationId)
  const conversations = useChatStore(s => s.conversations)
  const contextRevision = useUiStore(s => s.workspaceContextRevision)
  const projects = useProjectsStore(s => s.projects)
  const projectId = owner ? conversations.find(task => task.id === owner)?.projectId ?? null : undefined
  const projectLabel = projectId ? projects.find(project => project.id === projectId)?.name ?? 'Current project' : owner ? 'Unassigned tasks' : 'All projects'
  const library = useWorkflowsStore(s => s.library)
  const libraryError = useWorkflowsStore(s => s.libraryError)
  const libraryLoading = useWorkflowsStore(s => s.libraryLoading)
  const refreshLibrary = useWorkflowsStore(s => s.refreshLibrary)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CommandFilter>('all')
  const [active, setActive] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const [files, setFiles] = useState<FileIndex | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [taskSnapshot, setTaskSnapshot] = useState<{ query: string; projectId: string | null | undefined; rows: Conversation[] } | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!visible) return
    const previous = document.activeElement as HTMLElement | null
    setQuery(''); setFilter('all'); setActive(0); setEditorOpen(false)
    input.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [visible])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setWorkflowError(null)
    void refreshLibrary().catch(error => { if (!cancelled) setWorkflowError(String(error)) })
    return () => { cancelled = true }
  }, [visible, retry, refreshLibrary])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setFiles(null); setFileError(null); setFileLoading(true)
    void (async () => {
      try {
        const folder = await window.api.files.getWorkdir(owner)
        if (!folder.success || !folder.data) throw new Error(folder.error ?? 'No task folder')
        const result = await window.api.files.walkProject(folder.data.path, owner)
        if (!result.success) throw new Error(result.error ?? 'Could not index files')
        if (!cancelled) setFiles({ revision: contextRevision, owner, root: folder.data.path, files: result.data.files, truncated: result.data.truncated })
      } catch (error) { if (!cancelled) setFileError(String(error)) }
      finally { if (!cancelled) setFileLoading(false) }
    })()
    return () => { cancelled = true }
  }, [visible, owner, contextRevision, retry])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setTaskSnapshot(null); setTaskError(null); setTaskLoading(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const results = await Promise.all((['recent', 'pinned', 'archived'] as const).map(tab => window.api.sessions.list({ tab, projectId, query: query.trim() || undefined, limit: 30 })))
          const failed = results.find(result => !result.success)
          if (failed) throw new Error(failed.error ?? 'Task history search unavailable')
          if (!cancelled) setTaskSnapshot({ query, projectId, rows: reconcileTaskRows(results.flatMap(result => result.data as Conversation[])) })
        } catch (error) { if (!cancelled) setTaskError(String(error)) }
        finally { if (!cancelled) setTaskLoading(false) }
      })()
    }, 180)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [visible, projectId, query, retry])

  const matches = useMemo(() => {
    if (!visible) return []
    const tasks = taskSnapshot?.query === query && taskSnapshot.projectId === projectId ? taskSnapshot.rows : []
    const taskCommands: AppCommand[] = reconcileTaskRows([...tasks, ...conversations.filter(task => (projectId === undefined || (task.projectId ?? null) === projectId) && (task.title ?? '').toLowerCase().includes(query.toLowerCase().trim()))]).map(task => ({
      id: `task.${task.id}`, label: task.title || 'Untitled task', aliases: [task.archived ? 'Archived' : '', task.pinnedAt ? 'Pinned' : ''], kind: 'task', run: async () => {
        const sessions = useSessionsStore.getState()
        sessions.setQuery(''); sessions.setProject(task.projectId ?? undefined); sessions.setTab(task.archived ? 'archived' : task.pinnedAt ? 'pinned' : 'recent')
        useUiStore.getState().closeProjectView(); useUiStore.getState().closeCustomize(); useUiStore.getState().setSidebarCollapsed(false)
        await useChatStore.getState().selectConversation(task.id)
      }
    }))
    const fileCommands: AppCommand[] = files?.owner === owner && files.revision === contextRevision ? rankWorkspaceFiles(query, files.files).map(file => ({
      id: `file.${file}`, label: file, kind: 'file', unavailable: () => useChatStore.getState().activeConversationId === owner ? null : 'Task changed; search again', run: () => useUiStore.getState().requestOpenFile(files.root.replace(/[\\/]$/, '') + '/' + file)
    })) : []
    const commands = [...APP_COMMANDS.filter(command => command.id !== 'app.commands'), ...workflowCommands(library)]
    validateCommands([...commands, ...taskCommands, ...fileCommands])
    return [...searchCommands(commands, query, filter), ...searchCommands([...taskCommands, ...fileCommands], '', filter)].slice(0, 120)
  }, [visible, taskSnapshot, conversations, files, owner, contextRevision, projectId, query, filter, library])
  useEffect(() => { setActive(0) }, [query, filter, owner])
  useEffect(() => { setActive(index => Math.min(index, Math.max(0, matches.length - 1))) }, [matches.length])
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-command-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])
  const choose = (command: AppCommand) => {
    if (command.unavailable?.()) { void executeCommand(command); return }
    close()
    void executeCommand(command)
  }
  if (!visible) return null
  const errors = [fileError && `Files: ${fileError}`, taskError && `Task history: ${taskError}`, (workflowError || libraryError) && `Workflows: ${workflowError || libraryError}`].filter(Boolean)
  return <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/35 px-2 pt-[8vh]" onMouseDown={event => { if (event.target === event.currentTarget) close() }} data-testid="workflow-palette">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Command menu" className={`flex max-h-[84vh] w-full ${editorOpen ? 'max-w-4xl' : 'max-w-2xl'} flex-col overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-primary)] shadow-xl`} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (editorOpen) { setEditorOpen(false); requestAnimationFrame(() => input.current?.focus()) } else close(); return }
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex]')).filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length)
        const first = controls[0]; const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
      if (editorOpen) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))) }
      if (event.key === 'Enter' && (event.target === input.current || (event.target as HTMLElement).dataset.commandIndex)) { event.preventDefault(); event.stopPropagation(); if (matches[active]) choose(matches[active]) }
    }}>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--panel-border)] px-3 py-2">
        {editorOpen ? <button className="min-h-8 px-2 text-sm" onClick={() => { setEditorOpen(false); requestAnimationFrame(() => input.current?.focus()) }}>Back to commands</button> : <input ref={input} role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={matches[active] ? `command-result-${active}` : undefined} aria-label="Search commands, tasks and files" placeholder="Search commands, tasks and files…" value={query} onChange={event => setQuery(event.target.value)} className="min-h-9 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" />}
        <button className="ml-auto min-h-8 min-w-8 rounded hover:bg-[var(--bg-tertiary)]" aria-label="Close command menu" onClick={close}>×</button>
      </div>
      {editorOpen ? <WorkflowEditor onSaved={() => { setEditorOpen(false); void refreshLibrary(); requestAnimationFrame(() => input.current?.focus()) }} /> : <>
        <div className="flex shrink-0 flex-wrap gap-1 px-3 py-2">{FILTERS.map(item => <button key={item.id} aria-pressed={filter === item.id} className={`min-h-8 rounded px-2 text-xs ${filter === item.id ? 'bg-[var(--bg-tertiary)]' : ''}`} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 text-xs text-[var(--text-muted)]"><span className="truncate" title={projectLabel}>Tasks: {projectLabel}</span><button className="min-h-8 shrink-0 px-2" onClick={() => setEditorOpen(true)}>New workflow</button></div>
        {(fileLoading || taskLoading || libraryLoading) && <p role="status" className="px-4 py-1 text-xs text-[var(--text-muted)]">Loading {[(taskLoading ? 'task history' : ''), (fileLoading ? 'files' : ''), (libraryLoading ? 'workflows' : '')].filter(Boolean).join(', ')}…</p>}
        {errors.length > 0 && <div role="alert" className="px-4 py-2 text-xs text-[var(--error)]">{errors.map(error => <p key={String(error)}>{error}</p>)}<button className="min-h-8 underline" onClick={() => setRetry(value => value + 1)}>Retry command sources</button></div>}
        <div ref={list} id="command-results" role="listbox" aria-label="Command results" className="min-h-0 flex-1 overflow-y-auto py-1">
          {matches.map((command, index) => <button key={command.id} id={`command-result-${index}`} role="option" aria-selected={index === active} aria-disabled={!!command.unavailable?.()} data-command-id={command.id} data-command-index={index} tabIndex={-1} className={`flex min-h-10 w-full items-center gap-3 px-4 py-2 text-left text-sm ${index === active ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'}`} onMouseEnter={() => setActive(index)} onClick={() => choose(command)}>
            <span className="min-w-0 flex-1"><span className="block truncate" title={command.label}>{command.label}</span>{command.kind === 'task' && <span className="block text-xs text-[var(--text-muted)]">{command.aliases?.filter(Boolean).join(' · ')}</span>}{command.unavailable?.() && <span className="block text-xs text-[var(--text-muted)]">{command.unavailable?.()}</span>}</span><span className="shrink-0 text-xs text-[var(--text-muted)]">{command.kind}</span>{shortcutHint(command) && <kbd className="shrink-0 text-xs text-[var(--text-muted)]">{shortcutHint(command)}</kbd>}
          </button>)}
          {!matches.length && !taskLoading && !fileLoading && !libraryLoading && <p className="px-4 py-4 text-sm text-[var(--text-muted)]">No matching commands, tasks or files.</p>}
        </div>
        {files?.truncated && <p className="px-4 py-2 text-xs text-[var(--text-muted)]">File index limited to 5,000 files.</p>}
      </>}
    </div>
  </div>
}
