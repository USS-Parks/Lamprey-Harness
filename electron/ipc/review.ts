import { ipcMain } from 'electron'
import { runGit } from '../services/git-runner'

interface FileStatus {
  path: string
  indexStatus: string // ' ', M, A, D, R, C, U, ?
  workStatus: string
  staged: boolean
  unstaged: boolean
}

function parsePorcelain(stdout: string): FileStatus[] {
  const lines = stdout.split('\n')
  const out: FileStatus[] = []
  for (const raw of lines) {
    if (!raw) continue
    // Format: XY <space> path  (rename: XY <space> path -> path)
    if (raw.length < 3) continue
    const x = raw[0]
    const y = raw[1]
    const rest = raw.slice(3)
    let path = rest
    if (x === 'R' || y === 'R') {
      const arrow = rest.indexOf(' -> ')
      if (arrow >= 0) path = rest.slice(arrow + 4)
    }
    if (x === '?' && y === '?') {
      out.push({ path, indexStatus: '?', workStatus: '?', staged: false, unstaged: true })
      continue
    }
    out.push({
      path,
      indexStatus: x === ' ' ? ' ' : x,
      workStatus: y === ' ' ? ' ' : y,
      staged: x !== ' ' && x !== '?',
      unstaged: y !== ' '
    })
  }
  return out
}

export function registerReviewHandlers(): void {
  ipcMain.handle('review:status', async (_e, args: { cwd?: string }) => {
    try {
      const cwd = args?.cwd || process.cwd()
      const res = await runGit(['status', '--porcelain=v1'], cwd)
      if (res.code !== 0) {
        return { success: false, error: res.stderr.trim() || 'git status failed' }
      }
      // Also fetch branch info — best effort.
      const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
      const ahead = await runGit(['rev-list', '--count', '@{u}..HEAD'], cwd).catch(() => ({
        stdout: '0',
        code: 0,
        stderr: ''
      } as any))
      const behind = await runGit(['rev-list', '--count', 'HEAD..@{u}'], cwd).catch(() => ({
        stdout: '0',
        code: 0,
        stderr: ''
      } as any))
      return {
        success: true,
        data: {
          files: parsePorcelain(res.stdout),
          branch: branch.stdout.trim() || null,
          ahead: parseInt(ahead.stdout.trim() || '0', 10) || 0,
          behind: parseInt(behind.stdout.trim() || '0', 10) || 0,
          cwd
        }
      }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'status failed' }
    }
  })

  ipcMain.handle(
    'review:diff',
    async (_e, args: { cwd?: string; path?: string; staged?: boolean }) => {
      try {
        const cwd = args?.cwd || process.cwd()
        const gitArgs = ['diff', '--no-color']
        if (args?.staged) gitArgs.push('--cached')
        if (args?.path) gitArgs.push('--', args.path)
        const res = await runGit(gitArgs, cwd)
        if (res.code !== 0 && res.stderr) {
          return { success: false, error: res.stderr.trim() }
        }
        // For untracked files, fall back to showing the file content as additions.
        if (!res.stdout && args?.path && !args?.staged) {
          const trackedCheck = await runGit(['ls-files', '--error-unmatch', args.path], cwd)
          if (trackedCheck.code !== 0) {
            const content = await runGit(['ls-files', '-o', '--exclude-standard'], cwd) // noop, just to keep types
            void content
            // Read file directly
            const fs = await import('fs/promises')
            const path = await import('path')
            try {
              const text = await fs.readFile(path.join(cwd, args.path), 'utf8')
              const synthetic =
                `diff --git a/${args.path} b/${args.path}\n` +
                `new file\n--- /dev/null\n+++ b/${args.path}\n` +
                text
                  .split('\n')
                  .map((l) => `+${l}`)
                  .join('\n')
              return { success: true, data: { diff: synthetic, untracked: true } }
            } catch {
              return { success: true, data: { diff: '', untracked: true } }
            }
          }
        }
        return { success: true, data: { diff: res.stdout, untracked: false } }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'diff failed' }
      }
    }
  )

  ipcMain.handle('review:stage', async (_e, args: { cwd?: string; path: string }) => {
    try {
      const cwd = args?.cwd || process.cwd()
      const res = await runGit(['add', '--', args.path], cwd)
      if (res.code !== 0) return { success: false, error: res.stderr.trim() }
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'stage failed' }
    }
  })

  ipcMain.handle('review:unstage', async (_e, args: { cwd?: string; path: string }) => {
    try {
      const cwd = args?.cwd || process.cwd()
      const res = await runGit(['restore', '--staged', '--', args.path], cwd)
      if (res.code !== 0) return { success: false, error: res.stderr.trim() }
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'unstage failed' }
    }
  })

  ipcMain.handle('review:discard', async (_e, args: { cwd?: string; path: string }) => {
    try {
      const cwd = args?.cwd || process.cwd()
      const res = await runGit(['checkout', '--', args.path], cwd)
      if (res.code !== 0) return { success: false, error: res.stderr.trim() }
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'discard failed' }
    }
  })
}
