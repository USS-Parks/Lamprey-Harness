import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/stores/ui-store'

interface FsEntry {
  name: string
  type: 'file' | 'dir'
  path: string
  size?: number
}

interface TreeNode {
  entry: FsEntry
  expanded: boolean
  children: TreeNode[] | null // null = not loaded yet
  depth: number
}

interface OpenFile {
  path: string
  name: string
  content: string
  size: number
  error?: string
}

function makeNode(entry: FsEntry, depth: number): TreeNode {
  return { entry, expanded: false, children: null, depth }
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.entry.type === 'dir' && n.expanded && n.children) {
      out.push(...flatten(n.children))
    }
  }
  return out
}

function FileIcon({ type, expanded }: { type: 'file' | 'dir'; expanded: boolean }): React.ReactElement {
  if (type === 'dir') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {expanded ? (
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        ) : (
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        )}
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="14 3 14 9 20 9" />
    </svg>
  )
}

function Chevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded ? <polyline points="6 9 12 15 18 9" /> : <polyline points="9 6 15 12 9 18" />}
    </svg>
  )
}

export function FilesPanel({ filePath }: { filePath?: string } = {}) {
  const contextRevision = useUiStore(s => s.workspaceContextRevision)
  const owner = useUiStore(s => s.activeRightPanelConvId)
  const generation = useRef(0)
  const preview = useRef<HTMLPreElement>(null)
  const line = useUiStore(s => s.requestedOpenFileLine)
  const requestOpen = useUiStore(s => s.requestOpenFile)
  const [rootLoading, setRootLoading] = useState(true)
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [openFile, setOpenFile] = useState<OpenFile | null>(null)
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [rootError, setRootError] = useState<string | null>(null)
  const requestedOpenFilePath = useUiStore((s) => s.requestedOpenFilePath)
  const requestedOpenFileToken = useUiStore((s) => s.requestedOpenFileToken)

  // Load workspace root once on mount.
  useEffect(() => {
    let cancelled = false
    setTree([]); setRootError(null); setRootPath(null); setRootLoading(true)
    const load = async () => {
      if (!window.api) return
      const wd = await window.api.files.getWorkdir(owner)
      if (cancelled) return
      if (!wd.success || !wd.data) {
        setRootError(wd.success ? 'No workspace directory.' : (wd.error ?? 'getWorkdir failed'))
        return
      }
      setRootPath(wd.data.path)
      if (filePath) { setRootLoading(false); return }
      const ls = await window.api.files.listDir(wd.data.path, owner)
      if (cancelled) return
      if (!ls.success) {
        setRootError(ls.error ?? 'listDir failed')
        return
      }
      const entries = ls.data as FsEntry[]
      setTree(entries.map((e) => makeNode(e, 0)))
      setRootLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [filePath, owner, contextRevision])

  const toggleDir = useCallback(async (node: TreeNode) => {
    if (node.entry.type !== 'dir') return
    if (node.expanded) {
      node.expanded = false
      setTree((t) => [...t])
      return
    }
    if (node.children) {
      node.expanded = true
      setTree((t) => [...t])
      return
    }
    setLoadingPath(node.entry.path)
    const res = await window.api?.files.listDir(node.entry.path, owner)
    setLoadingPath(null)
    if (!res?.success) return
    const entries = res.data as FsEntry[]
    node.children = entries.map((e) => makeNode(e, node.depth + 1))
    node.expanded = true
    setTree((t) => [...t])
  }, [owner])

  const openFileAt = useCallback(async (entry: FsEntry) => {
    const request = ++generation.current
    setLoadingPath(entry.path)
    setOpenFile(null)
    const res = await window.api?.files.readText(entry.path, owner)
    if (request !== generation.current) return
    setLoadingPath(null)
    if (!res) return
    if (!res.success) {
      setOpenFile({ path: entry.path, name: entry.name, content: '', size: 0, error: res.error })
      return
    }
    const data = res.data as { content: string; size: number }
    setOpenFile({ path: entry.path, name: entry.name, content: data.content, size: data.size })
  }, [owner])

  useEffect(() => () => { generation.current++ }, [])

  useEffect(() => {
    if (!openFile || !line || !preview.current) return
    preview.current.scrollTop = (line - 1) * parseFloat(getComputedStyle(preview.current).lineHeight)
  }, [openFile, line, requestedOpenFileToken])

  // Handle quick-open palette selections — opens any file by absolute path.
  useEffect(() => {
    const path = filePath ?? requestedOpenFilePath
    if (!path) return
    const sepIdx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    const name = sepIdx >= 0 ? path.slice(sepIdx + 1) : path
    void openFileAt({ name, type: 'file', path })
  }, [filePath, requestedOpenFileToken, requestedOpenFilePath, openFileAt])

  const flat = flatten(tree)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {rootPath && (
        <div className="border-b border-[var(--panel-border)] px-3 py-1.5 text-[12px] text-[var(--text-muted)]" title={rootPath}>
          <span className="truncate">{rootPath}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!filePath && <div className="w-1/2 min-w-0 overflow-auto border-r border-[var(--panel-border)] py-1">
          {rootError && (
            <p className="px-3 py-2 text-[12px] text-[var(--error)]">{rootError}</p>
          )}
          {!rootError && flat.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-[var(--text-muted)]">{rootLoading ? 'Loading…' : 'No files in this directory.'}</p>
          )}
          {flat.map((node) => {
            const isOpen = openFile?.path === node.entry.path
            const isLoading = loadingPath === node.entry.path
            return (
              <button
                key={node.entry.path}
                onClick={() => {
                  if (node.entry.type === 'dir') void toggleDir(node)
                  else requestOpen(node.entry.path)
                }}
                className={`flex w-full items-center gap-1 px-2 py-0.5 text-left text-[13px] transition-colors ${
                  isOpen
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                style={{ paddingLeft: 8 + node.depth * 14 }}
                title={node.entry.path}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-muted)]">
                  {node.entry.type === 'dir' ? <Chevron expanded={node.expanded} /> : null}
                </span>
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--text-muted)]">
                  <FileIcon type={node.entry.type} expanded={node.expanded} />
                </span>
                <span className="min-w-0 flex-1 truncate">{node.entry.name}</span>
                {isLoading && (
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">…</span>
                )}
              </button>
            )
          })}
        </div>}

        <div className={`flex ${filePath ? 'w-full' : 'w-1/2'} min-w-0 flex-col`}>
          {openFile ? (
            <>
              <div className="border-b border-[var(--panel-border)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)]">
                <span className="font-medium">{openFile.name}</span>
                {line && <span className="ml-2">Line {line}</span>}
                {!openFile.error && (
                  <span className="ml-2 text-[var(--text-muted)]">
                    {(openFile.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
              {openFile.error ? (
                <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">{openFile.error}</p>
              ) : (
                <pre ref={preview} aria-label="File preview" data-line={line} className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--text-primary)]">
                  {openFile.content}
                </pre>
              )}
            </>
          ) : (
            <p className="m-auto px-3 py-3 text-[12px] text-[var(--text-muted)]">
              {loadingPath ? 'Loading file…' : 'Select a file to view.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
