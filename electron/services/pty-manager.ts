// Shell-mode "PTY" using child_process. Not a real PTY — pipes only — so
// full-screen TUIs (vim, top, htop) won't render, but most everyday commands
// (git, npm, ls, node, python) work fine. Chosen over real node-pty because
// the project path contains a space, which breaks node-pty's node-gyp build
// chain on Windows; pivoting to pipes keeps install/build reliable.

import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import type { BrowserWindow } from 'electron'

interface PtySession {
  id: string
  proc: ChildProcessWithoutNullStreams
  win: BrowserWindow
  cwd: string
}

const sessions = new Map<string, PtySession>()

function defaultShell(): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    return { cmd: process.env.COMSPEC || 'cmd.exe', args: [] }
  }
  return { cmd: process.env.SHELL || '/bin/bash', args: ['-i'] }
}

export interface SpawnOptions {
  cwd?: string
}

export function ptySpawn(
  id: string,
  win: BrowserWindow,
  opts: SpawnOptions = {}
): { cwd: string; shell: string } {
  if (sessions.has(id)) {
    throw new Error(`PTY session ${id} already exists`)
  }
  const cwd = opts.cwd || process.cwd()
  const { cmd, args } = defaultShell()

  const proc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  }) as ChildProcessWithoutNullStreams

  const session: PtySession = { id, proc, win, cwd }
  sessions.set(id, session)

  const send = (channel: string, payload: unknown) => {
    try {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    } catch {
      // window may have closed
    }
  }

  proc.stdout.on('data', (buf: Buffer) => {
    send('terminal:data', { id, chunk: buf.toString('utf8') })
  })
  proc.stderr.on('data', (buf: Buffer) => {
    send('terminal:data', { id, chunk: buf.toString('utf8') })
  })
  proc.on('exit', (code, signal) => {
    sessions.delete(id)
    send('terminal:exit', { id, code, signal: signal ?? null })
  })
  proc.on('error', (err) => {
    send('terminal:data', { id, chunk: `\r\n[terminal error: ${err.message}]\r\n` })
  })

  return { cwd, shell: cmd }
}

export function ptyWrite(id: string, data: string): boolean {
  const s = sessions.get(id)
  if (!s) return false
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
  if (!s) return false
  try {
    s.proc.kill()
  } catch {
    // already dead
  }
  sessions.delete(id)
  return true
}

export function ptyKillAll(): void {
  for (const id of Array.from(sessions.keys())) {
    ptyKill(id)
  }
}
