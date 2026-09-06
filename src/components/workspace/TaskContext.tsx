import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useUiStore, type ToolId } from '@/stores/ui-store'
import { useEnvironment } from '@/hooks/useEnvironment'
import { useEnvironmentGitAction } from '@/hooks/useEnvironmentGitAction'
import { PopoverMenu } from '@/components/ui/PopoverMenu'
import { BranchPickerPopover } from './BranchPickerPopover'
import { toast } from '@/stores/toast-store'

export function TaskContext() {
  const owner = useChatStore(s => s.activeConversationId)
  const task = useChatStore(s => s.conversations.find(item => item.id === owner))
  const running = useChatStore(s => s.isStreaming)
  const projects = useProjectsStore(s => s.projects)
  const { snapshot, loading, error, refresh } = useEnvironment()
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState(false)
  const [busy, setBusy] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const git = useEnvironmentGitAction(snapshot, refresh, !loading && !error)
  const fixedLocation = !!(task?.worktreePath || projects.find(p => p.id === task?.projectId)?.path)
  const project = projects.find(p => p.id === task?.projectId)
  useEffect(() => { void useProjectsStore.getState().loadProjects() }, [])
  useEffect(() => { setOpen(false); setBranches(false) }, [owner])
  const navigate = (tool: ToolId) => { setOpen(false); useUiStore.getState().setActiveTool(tool) }
  const action = async (run: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try { await run() } catch (failure) { toast.error(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  const changeFolder = (reset = false) => action(async () => {
    if (running || fixedLocation) return
    if (reset) {
      const result = await window.api.files.clearWorkdir()
      if (!result.success) throw new Error(result.error ?? 'Could not reset working folder')
    } else {
      const picked = await window.api.files.pickWorkdir()
      if (!picked.success) throw new Error(picked.error ?? 'Folder picker failed')
      if (!picked.data) return
      const saved = await window.api.files.setWorkdir(picked.data.path)
      if (!saved.success) throw new Error(saved.error ?? 'Could not save working folder')
    }
    useUiStore.getState().refreshWorkspaceContext()
  })
  const assignProject = (projectId: string) => action(async () => {
    if (!owner || running) return
    const result = await window.api.projects.assignConversation(owner, projectId || null)
    if (!result.success) throw new Error(result.error ?? 'Could not change task project')
    await useChatStore.getState().loadConversations()
    useUiStore.getState().refreshWorkspaceContext()
  })
  const buttonClass = 'min-h-8 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-tertiary)] disabled:opacity-40'
  const folder = snapshot.cwd.split(/[\\/]/).filter(Boolean).at(-1)
  return <>
    <button ref={anchor} type="button" aria-label="Task context" aria-expanded={open} aria-haspopup="dialog" title={snapshot.cwd || 'Task location'} onClick={() => { setOpen(!open); if (!open) void refresh() }} className="flex min-h-8 min-w-0 items-center gap-1 rounded px-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">
      <span className="max-w-40 truncate">{project?.name || folder || (loading ? 'Loading context…' : 'Location unavailable')}</span>
      <span>· {task?.worktreePath ? 'Worktree' : 'Local'}</span>
      {snapshot.branch && <span className="max-w-32 truncate">· {snapshot.branch}</span>}
      <span aria-hidden>⌄</span>
    </button>
    <PopoverMenu open={open} onClose={() => setOpen(false)} anchorRef={anchor} align="top-start" role="dialog" ariaLabel="Task context details" width={360}>
      <div className="max-h-[65vh] space-y-2 overflow-y-auto p-3 text-xs text-[var(--text-primary)]">
        <p className="break-all" data-task-workspace>{snapshot.cwd || 'Location unavailable'}</p>
        {error && <p role="alert" className="text-[var(--warning)]">Repository status unavailable. {error}</p>}
        <label className="flex items-center gap-2">Project
          <select aria-label="Task project" disabled={!owner || running || busy} value={task?.projectId ?? ''} onChange={event => void assignProject(event.target.value)} className="min-h-8 min-w-0 flex-1 rounded bg-[var(--bg-tertiary)] px-2">
            <option value="">No project</option>
            {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1">
          <button className={buttonClass} disabled={!snapshot.cwd || busy} onClick={() => void action(async () => { const result = await window.api.clipboard.writeText(snapshot.cwd); if (!result.success) throw new Error(result.error ?? 'Could not copy path'); toast.success('Path copied') })}>Copy path</button>
          <button className={buttonClass} disabled={!snapshot.cwd || busy} onClick={() => void action(async () => { const result = await window.api.files.openInExplorer({ conversationId: owner }); if (!result.success) throw new Error(result.error ?? 'Could not reveal folder') })}>Reveal folder</button>
          <button className={buttonClass} onClick={() => navigate('files')}>Files</button>
          <button className={buttonClass} onClick={() => navigate('review')}>Review changes</button>
          <button className={buttonClass} disabled={loading || !!error || running} onClick={() => { setOpen(false); setBranches(true) }}>Switch or create branch</button>
          <button className={buttonClass} disabled={git.commitDisabled || git.committing || running} onClick={() => { git.handleCommitOrPush(); setOpen(false) }}>{git.commitLabel}</button>
          <button className={buttonClass} onClick={() => { setOpen(false); useUiStore.getState().openWorktreeModal() }}>Worktree manager</button>
          <button className={buttonClass} onClick={() => navigate('plan')}>Plan details</button>
          <button className={buttonClass} onClick={() => navigate('sources')}>Sources</button>
          <button className={buttonClass} onClick={() => navigate('environment')}>Environment details</button>
          <button className={buttonClass} disabled={running || fixedLocation || busy} onClick={() => void changeFolder()}>Change working folder</button>
          <button className={buttonClass} disabled={running || fixedLocation || busy} onClick={() => void changeFolder(true)}>Use launch folder</button>
        </div>
        {fixedLocation && <p className="text-[var(--text-muted)]">This task uses its {task?.worktreePath ? 'worktree' : 'project'} folder.</p>}
      </div>
    </PopoverMenu>
    <BranchPickerPopover open={branches} onClose={() => setBranches(false)} anchorRef={anchor} cwd={snapshot.cwd} onChanged={() => void refresh()} />
    {git.commitDialog}
  </>
}
