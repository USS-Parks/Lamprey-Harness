import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useUiStore, type ShellKind } from '@/stores/ui-store'
import { toast } from '@/stores/toast-store'

interface Snapshot {
  id: string
  cwd: string
  conversationId: string | null
  buffer: string
  sequence: number
  running: boolean
}
const pendingStarts = new Map<string, Promise<Snapshot>>()

async function attachSession(id: string, conversationId: string | null, shellKind: ShellKind, restart: boolean): Promise<Snapshot> {
  const pending = pendingStarts.get(id)
  if (pending) return pending
  const promise = (async () => {
    const previous = await window.api.terminal.snapshot({ id })
    if (!previous.success) throw new Error(previous.error)
    if (previous.data && !restart) return previous.data as Snapshot
    if (previous.data?.running) await window.api.terminal.kill({ id })
    const created = await window.api.terminal.spawn({ id, conversationId, shellKind })
    if (!created.success) throw new Error(created.error)
    const snapshot = await window.api.terminal.snapshot({ id })
    if (!snapshot.success || !snapshot.data) throw new Error(snapshot.error ?? 'Terminal exited before it could attach.')
    return snapshot.data as Snapshot
  })()
  pendingStarts.set(id, promise)
  try { return await promise } finally { if (pendingStarts.get(id) === promise) pendingStarts.delete(id) }
}

export function TerminalPanel() {
  const container = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const restartRequested = useRef(false)
  const [restartCount, setRestartCount] = useState(0)
  const [status, setStatus] = useState('Starting')
  const [cwd, setCwd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const owner = useUiStore(s => s.activeRightPanelConvId)
  const shell = useUiStore(s => s.activeShell)
  const setShell = useUiStore(s => s.setActiveShell)
  const hide = useUiStore(s => s.setTerminalOpen)
  const focusRequested = useUiStore(s => s.terminalFocusRequested)
  const consumeFocus = useUiStore(s => s.consumeTerminalFocus)
  const id = `lamprey-task:${encodeURIComponent(owner ?? 'home')}:${shell}`

  useEffect(() => {
    if (!container.current) return
    let disposed = false
    let sequence = -1
    let exited = false
    const queued: Array<{ chunk: string; sequence: number }> = []
    const term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'Consolas, monospace', convertEol: true, scrollback: 5000, theme: { background: '#000000', foreground: '#e8e8e8' } })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container.current)
    fit.fit()
    terminal.current = term
    setStatus('Starting')
    setError(null)
    const accept = (event: { chunk: string; sequence: number }) => {
      if (event.sequence > sequence) { sequence = event.sequence; term.write(event.chunk) }
    }
    const offData = window.api.terminal.onData(event => {
      if (event.id !== id || disposed) return
      if (sequence < 0) queued.push(event)
      else accept(event)
    })
    const offExit = window.api.terminal.onExit(event => { if (event.id === id && !disposed) { exited = true; setStatus('Exited') } })
    const input = term.onData(data => {
      void window.api.terminal.write({ id, data }).then(result => { if (!result.success && !disposed) setError('The shell is not running. Restart it to continue.') })
    })
    const restart = restartRequested.current
    restartRequested.current = false
    void attachSession(id, owner, shell, restart).then(snapshot => {
      if (disposed) return
      if (snapshot.conversationId !== owner) throw new Error('Terminal ownership does not match this task.')
      term.write(snapshot.buffer)
      sequence = snapshot.sequence
      for (const event of queued) accept(event)
      queued.length = 0
      setCwd(snapshot.cwd)
      setStatus(snapshot.running && !exited ? 'Running' : 'Exited')
    }).catch(failure => { if (!disposed) { setError(String(failure)); setStatus('Unavailable') } })
    const observer = new ResizeObserver(() => { try { fit.fit() } catch { /* Hidden during layout transition. */ } })
    observer.observe(container.current)
    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      offData()
      offExit()
      term.dispose()
      terminal.current = null
    }
  }, [id, owner, shell, restartCount])

  useEffect(() => {
    if (!focusRequested) return
    terminal.current?.focus()
    consumeFocus()
  }, [focusRequested, consumeFocus])

  return <div className="flex min-h-0 flex-1 flex-col bg-black" data-terminal-id={id}>
    <div className="flex min-h-10 shrink-0 items-center gap-2 bg-[var(--panel-bg)] px-2 text-xs text-[var(--text-secondary)]">
      <span>Terminal</span>
      <select aria-label="Terminal shell" value={shell} onChange={event => setShell(event.target.value as ShellKind)} className="min-h-8 rounded bg-[var(--bg-primary)] px-1">
        <option value="powershell">PowerShell</option><option value="cmd">Command Prompt</option><option value="git-bash">Git Bash</option><option value="wsl">WSL</option>
      </select>
      <span className="min-w-0 flex-1 truncate" title={cwd}>{cwd}</span>
      <span role="status">{status}</span>
      <button className="min-h-8 rounded px-1 hover:bg-[var(--bg-tertiary)]" onClick={() => void navigator.clipboard.writeText(terminal.current?.getSelection() ?? '').catch(failure => toast.error(String(failure)))}>Copy</button>
      <button className="min-h-8 rounded px-1 hover:bg-[var(--bg-tertiary)]" onClick={() => void navigator.clipboard.readText().then(text => terminal.current?.paste(text), failure => toast.error(String(failure)))}>Paste</button>
      <button aria-label="Terminate shell" disabled={status !== 'Running'} className="min-h-8 rounded px-1 hover:bg-[var(--bg-tertiary)] disabled:opacity-40" onClick={() => void window.api.terminal.kill({ id }).then(result => { if (!result.success) setError('The shell could not be terminated.') })}>Terminate</button>
      <button className="min-h-8 rounded px-1 hover:bg-[var(--bg-tertiary)]" onClick={() => { restartRequested.current = true; setRestartCount(value => value + 1) }}>Restart</button>
      <button aria-label="Hide terminal" className="h-8 w-8 rounded hover:bg-[var(--bg-tertiary)]" onClick={() => hide(false)}>×</button>
    </div>
    {error && <p role="alert" className="px-2 text-xs text-red-400">{error}</p>}
    <div ref={container} className="min-h-0 flex-1" />
  </div>
}
