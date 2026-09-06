import { containDialogTab, useDialogFocus } from '@/hooks/useDialogFocus'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { useProjectsStore } from '@/stores/projects-store'
import { toast } from '@/stores/toast-store'

interface Worktree {
  path: string
  branch: string | null
  head: string | null
}

export function WorktreeManagerModal() {
  const dialog = useRef<HTMLDivElement>(null)
  const visible = useUiStore((s) => s.worktreeModalOpen)
  const projectId = useUiStore(s => s.worktreeModalProjectId)
  const projectPath = useProjectsStore(s => s.projects.find(project => project.id === projectId)?.path)
  const close = useUiStore((s) => s.closeWorktreeModal)
  const [list, setList] = useState<Worktree[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const busy = useRef(false)
  const requests = useRef(0)
  const [newBranch, setNewBranch] = useState('')
  const [newPath, setNewPath] = useState('')
  const owner = useChatStore(s => s.activeConversationId)
  const contextRevision = useUiStore(s => s.workspaceContextRevision)
  const [cwd, setCwd] = useState<string | null>(null)

  const context = JSON.stringify([visible, owner, contextRevision, projectId, projectPath])
  const currentContext = useRef(context)
  currentContext.current = context
  const refresh = useCallback(async (preserveError = false) => {
    const request = ++requests.current
    const current = () => request === requests.current && currentContext.current === context
    if (!preserveError) setError(null)
    setCwd(null); setList([])
    try {
      if (!window.api?.worktree) throw new Error('Worktree API unavailable.')
      const folder = projectId
        ? { success: !!projectPath, data: projectPath ? { path: projectPath } : undefined, error: 'Project folder unavailable' }
        : await window.api.files.getWorkdir(owner)
      if (!current()) return
      if (!folder.success || !folder.data) throw new Error(folder.error ?? 'Task folder unavailable')
      const result = await window.api.worktree.list({ cwd: folder.data.path })
      if (!current()) return
      if (!result.success) throw new Error(result.error ?? 'Could not list worktrees')
      setCwd(folder.data.path); setList(result.data as Worktree[])
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [context, owner, projectId, projectPath])

  useEffect(() => {
    busy.current = false; setCreating(false); setRemoving(null)
    if (visible) void refresh()
    return () => { requests.current++ }
  }, [visible, refresh])
  useDialogFocus(dialog, visible)

  if (!visible) return null

  const handleCreate = async () => {
    if (busy.current) return
    if (!cwd || !newBranch.trim() || !newPath.trim()) { setError('Branch and path are required'); return }
    const request = requests.current
    const current = () => request === requests.current && currentContext.current === context
    busy.current = true; setCreating(true); setError(null)
    let completed = false
    try {
      const res = await window.api.worktree.create({ cwd, branch: newBranch.trim(), path: newPath.trim() })
      if (!current()) return
      if (!res.success) throw new Error(res.error ?? 'Could not create worktree')
      completed = true
      const data = res.data as { path: string; branch: string }
      toast.success(`Worktree created at ${data.path}`)
      setNewBranch(''); setNewPath('')
      if (confirm(`Create a new thread for worktree '${data.branch}'?`)) {
        const conv = await window.api.conversation.create(useChatStore.getState().activeModel, { kind: 'worktree', worktreePath: data.path })
        if (!conv.success) throw new Error(conv.error ?? 'Could not create worktree task')
        if (projectId) await useProjectsStore.getState().assignConversation(conv.data.id, projectId)
        await useChatStore.getState().loadConversations()
        if (!current()) return
        await useChatStore.getState().selectConversation(conv.data.id)
        close()
      }
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (current()) { busy.current = false; setCreating(false) }
    }
    if (completed && current()) void refresh(true)
  }

  const handleRemove = async (path: string) => {
    if (busy.current || !cwd || !confirm(`Remove worktree at ${path}?`)) return
    const request = requests.current
    const current = () => request === requests.current && currentContext.current === context
    busy.current = true; setRemoving(path); setError(null)
    let removed = false
    try {
      const result = await window.api.worktree.remove({ path, cwd })
      if (!current()) return
      if (!result.success) throw new Error(result.error ?? 'Could not remove worktree')
      removed = true; toast.success('Worktree removed')
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (current()) { busy.current = false; setRemoving(null) }
    }
    if (removed && current()) void refresh()
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div ref={dialog} role="dialog" aria-label="Worktrees" aria-modal="true" tabIndex={-1} onKeyDown={event => { containDialogTab(event); if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close() } }} className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-y-auto rounded-lg border border-[var(--panel-border)] bg-[var(--bg-primary)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--panel-border)] px-4 py-3">
          <h2 className="text-[14px] font-medium text-[var(--text-primary)]">Worktrees</h2>
          <button
            onClick={close}
            className="min-h-8 min-w-8 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="border-b border-[var(--panel-border)] p-4">
          <h3 className="mb-2 text-[12px] uppercase tracking-wider text-[var(--text-muted)]">
            New worktree
          </h3>
          <div className="flex flex-col gap-2 text-[13px]">
            <input
              type="text"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              aria-label="Worktree branch" placeholder="branch name (e.g. feature-x)"
              className="w-full rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              aria-label="Worktree path" placeholder="path (relative resolves next to repo, or absolute)"
              className="w-full rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-2 py-1 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || removing !== null || !cwd}
                className="min-h-8 rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-3 py-1 text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create worktree'}
              </button>
            </div>
            {error && <div role="alert" className="text-xs text-[var(--error)]">{error}<button type="button" disabled={creating || removing !== null} onClick={() => void refresh()} className="min-h-8 px-2 underline">Retry worktree list</button></div>}
          </div>
        </div>

        <div className="max-h-[40vh] overflow-y-auto p-4">
          <h3 className="mb-2 text-[12px] uppercase tracking-wider text-[var(--text-muted)]">
            Existing ({list.length})
          </h3>
          {list.length === 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">None.</p>
          )}
          {list.map((wt, i) => (
            <div
              key={wt.path}
              className="mb-2 flex items-center justify-between gap-2 rounded border border-[var(--panel-border)] bg-[var(--bg-secondary)] px-3 py-2 text-[12px]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12px] text-[var(--text-primary)]" title={wt.path}>
                  {wt.path}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                  {wt.branch ? `branch: ${wt.branch}` : '(detached)'}
                  {wt.head && ` · ${wt.head.slice(0, 8)}`}
                </div>
              </div>
              {i > 0 && (
                <button
                  disabled={creating || removing !== null}
                  onClick={() => void handleRemove(wt.path)}
                  className="min-h-8 shrink-0 rounded px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)]"
                >
                  {removing === wt.path ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
