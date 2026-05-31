import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// Stable id so closing+reopening the tool reuses the same pty session for
// the lifetime of the window. Per-thread sessions can come later when we
// move threads into the Sidebar.
const TERMINAL_ID = 'lamprey-main'

let spawnPromise: Promise<boolean> | null = null

async function ensureSpawned(): Promise<boolean> {
  if (!window.api?.terminal) return false
  if (spawnPromise) return spawnPromise
  spawnPromise = (async () => {
    const wd = await window.api.files.getWorkdir()
    const cwd = wd.success && wd.data ? wd.data.path : undefined
    const res = await window.api.terminal.spawn({ id: TERMINAL_ID, cwd })
    return res.success
  })()
  return spawnPromise
}

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (!window.api?.terminal) {
      container.innerText = 'Terminal API unavailable.'
      return
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      fontSize: 13,
      theme: {
        background: '#000000',
        foreground: '#e8e8e8'
      },
      convertEol: true,
      scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Pipe keystrokes to backend.
    const inputDisposable = term.onData((data) => {
      void window.api.terminal.write({ id: TERMINAL_ID, data })
    })

    // Pipe pty data to terminal. We register a single onData listener for the
    // app lifetime, but multiple TerminalPanel mounts could clobber each other.
    // Filter by id and write to whichever term is currently mounted.
    const onData = (e: { id: string; chunk: string }) => {
      if (e.id !== TERMINAL_ID) return
      term.write(e.chunk)
    }
    const onExit = (e: { id: string; code: number | null }) => {
      if (e.id !== TERMINAL_ID) return
      term.write(`\r\n[shell exited${e.code != null ? ` (code ${e.code})` : ''}]\r\n`)
      spawnPromise = null
    }
    window.api.terminal.onData(onData)
    window.api.terminal.onExit(onExit)

    void (async () => {
      const ok = await ensureSpawned()
      if (!ok) {
        term.write('\x1b[31m[failed to spawn shell]\x1b[0m\r\n')
      }
    })()

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // container may have zero size briefly during transitions
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      inputDisposable.dispose()
      window.api?.terminal?.offAll?.()
      try {
        term.dispose()
      } catch {
        // already disposed
      }
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  return (
    <div className="flex flex-1 flex-col bg-black">
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  )
}
