// Shell-mode "PTY" using child_process. Not a real PTY — pipes only — so
// full-screen TUIs (vim, top, htop) won't render, but most everyday commands
// (git, npm, ls, node, python) work fine. Chosen over real node-pty because
// the project path contains a space, which breaks node-pty's node-gyp build
// chain on Windows; pivoting to pipes keeps install/build reliable.

import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import type { BrowserWindow } from 'electron'

interface PtySession {
  id: string
  proc: ChildProcessWithoutNullStreams
  win: BrowserWindow
  cwd: string
  buffer: string
  lastActivity: number
  conversationId: string | null
  shellKind: ShellKind | null
  sequence: number
  running: boolean
}

const sessions = new Map<string, PtySession>()

// Rolling buffer cap. The model receives ~50 KB; we keep 200 KB so the
// user can also scroll back without exhausting memory if many sessions
// are open.
const PTY_BUFFER_CAP = 200_000
// The read_thread_terminal native tool returns at most this many bytes
// (tail end of the buffer) to the model.
export const PTY_READ_CAP = 50_000

function appendToBuffer(session: PtySession, chunk: string): void {
  if (!chunk) return
  const next = session.buffer + chunk
  session.buffer = next.length > PTY_BUFFER_CAP ? next.slice(next.length - PTY_BUFFER_CAP) : next
  session.lastActivity = Date.now()
  session.sequence++
}

export type ShellKind = 'powershell' | 'cmd' | 'git-bash' | 'wsl'

// Common Git Bash install locations (64-bit and 32-bit), Scoop, and PATH.
const GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Users\\Public\\scoop\\apps\\git\\current\\bin\\bash.exe'
]

function resolveGitBash(): string | null {
  // Synchronous existence check; falling back to PATH name lets `spawn`
  // surface ENOENT to the renderer which is fine for our error UX.
  for (const p of GIT_BASH_CANDIDATES) {
    try {
      if (existsSync(p)) return p
    } catch {
      // ignore individual probe failures
    }
  }
  return null
}

function shellForKind(kind: ShellKind | undefined): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    switch (kind) {
      case 'powershell':
        return { cmd: 'powershell.exe', args: ['-NoLogo'] }
      case 'cmd':
        return { cmd: process.env.COMSPEC || 'cmd.exe', args: [] }
      case 'git-bash': {
        const bash = resolveGitBash() ?? 'bash.exe'
        return { cmd: bash, args: ['--login', '-i'] }
      }
      case 'wsl':
        return { cmd: 'wsl.exe', args: [] }
      default:
        // PowerShell is the modern Windows default and matches what the
        // Codex tool launcher offers as the unlabeled "Terminal" entry.
        return { cmd: 'powershell.exe', args: ['-NoLogo'] }
    }
  }
  return { cmd: process.env.SHELL || '/bin/bash', args: ['-i'] }
}

export interface SpawnOptions {
  conversationId?: string | null
  cwd?: string
  shellKind?: ShellKind
}

export function ptySpawn(
  id: string,
  win: BrowserWindow,
  opts: SpawnOptions = {}
): { cwd: string; shell: string; shellKind: ShellKind | null } {
  if (sessions.get(id)?.running) {
    throw new Error(`PTY session ${id} already exists`)
  }
  const cwd = opts.cwd || process.cwd()
  const { cmd, args } = shellForKind(opts.shellKind)

  const proc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  }) as ChildProcessWithoutNullStreams

  const session: PtySession = { id, proc, win, cwd, buffer: '', lastActivity: Date.now(), conversationId: opts.conversationId ?? null, shellKind: opts.shellKind ?? null, sequence: 0, running: true }
  sessions.set(id, session)

  const send = (channel: string, payload: unknown) => {
    try {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    } catch {
      // window may have closed
    }
  }

  const output = (chunk: string) => {
    appendToBuffer(session, chunk)
    send('terminal:data', { id, chunk, sequence: session.sequence })
  }
  const finish = (code: number | null, signal: string | null) => {
    if (sessions.get(id) !== session) return
    session.running = false
    output(`\r\n[shell exited${code != null ? ` (code ${code})` : ''}]\r\n`)
    send('terminal:exit', { id, code, signal })
    // Retain bounded completed output for reattachment without another renderer cache.
    const completed = [...sessions.values()].filter(item => !item.running).sort((a, b) => b.lastActivity - a.lastActivity)
    for (const old of completed.slice(20)) sessions.delete(old.id)
  }
  proc.stdout.on('data', (buf: Buffer) => output(buf.toString('utf8')))
  proc.stderr.on('data', (buf: Buffer) => output(buf.toString('utf8')))
  proc.on('exit', (code, signal) => finish(code, signal ?? null))
  proc.on('error', err => { output(`\r\n[terminal error: ${err.message}]\r\n`); finish(null, null) })

  return { cwd, shell: cmd, shellKind: opts.shellKind ?? null }
}

export function ptyWrite(id: string, data: string): boolean {
  const s = sessions.get(id)
  if (!s?.running) return false
  try {
    s.proc.stdin.write(data)
    return true
  } catch {
    return false
  }
}

// No-op for shell-mode (no PTY to resize). Kept for API parity with future
// real-PTY swap; returns false so callers can detect.
export function ptyResize(_id: string, _cols: number, _rows: number): boolean {
  return false
}

export function ptyKill(id: string): boolean {
  const s = sessions.get(id)
  if (!s?.running) return false
  try {
    if (!s.proc.kill()) return false
  } catch {
    return false
  }
  s.running = false
  return true
}

export function ptyKillAll(): void {
  for (const id of Array.from(sessions.keys())) {
    ptyKill(id)
  }
}

/**
 * Return the rolling stdout/stderr buffer for a session, or null if none.
 * Used by the read_thread_terminal native tool to surface recent output
 * to the model. Returned text is the raw captured bytes (already capped at
 * PTY_BUFFER_CAP); callers should slice the tail before showing.
 */
export function ptyGetBuffer(id: string, conversationId?: string | null): string | null {
  const s = sessions.get(id)
  if (!s || (conversationId !== undefined && s.conversationId !== conversationId)) return null
  return s.buffer
}

/**
 * Return all currently active PTY session ids, most-recently-active first.
 * Used by read_thread_terminal so the model can call it without knowing
 * a specific id (the most-recent session is picked by default).
 */
export function ptyListSessions(conversationId?: string | null): string[] {
  return Array.from(sessions.values())
    .filter(session => session.running && (conversationId === undefined || session.conversationId === conversationId))
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .map((s) => s.id)
}


export function ptySnapshot(id: string) {
  const session = sessions.get(id)
  if (!session) return null
  return { id, cwd: session.cwd, conversationId: session.conversationId, shellKind: session.shellKind, pid: session.proc.pid ?? null, buffer: session.buffer, sequence: session.sequence, running: session.running }
}
