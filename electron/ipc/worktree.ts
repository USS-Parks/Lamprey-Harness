import { ipcMain } from 'electron'
import * as path from 'path'
import { runGit } from '../services/git-runner'

interface WorktreeEntry {
  path: string
  branch: string | null
  head: string | null
}

function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = []
  let cur: Partial<WorktreeEntry> = {}
  for (const line of stdout.split('\n')) {
    if (!line.trim()) {
      if (cur.path) out.push({ path: cur.path, branch: cur.branch ?? null, head: cur.head ?? null })
      cur = {}
      continue
    }
    if (line.startsWith('worktree ')) cur.path = line.slice(9)
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5)
    else if (line.startsWith('branch ')) {
      const ref = line.slice(7)
      cur.branch = ref.replace(/^refs\/heads\//, '')
    }
  }
  if (cur.path) out.push({ path: cur.path, branch: cur.branch ?? null, head: cur.head ?? null })
  return out
}

export function registerWorktreeHandlers(): void {
  ipcMain.handle('worktree:list', async (_e, args: { cwd?: string }) => {
    try {
      const cwd = args?.cwd || process.cwd()
      const res = await runGit(['worktree', 'list', '--porcelain'], cwd)
      if (res.code !== 0) return { success: false, error: res.stderr.trim() }
      return { success: true, data: parseWorktreeList(res.stdout) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'list failed' }
    }
  })

  ipcMain.handle(
    'worktree:create',
    async (_e, args: { cwd?: string; path: string; branch: string; baseRef?: string }) => {
      try {
        const cwd = args?.cwd || process.cwd()
        if (!args?.path || !args?.branch) {
          return { success: false, error: 'path and branch required' }
        }
        // Resolve relative paths against cwd's parent so worktrees land next to the repo.
        const wtPath = path.isAbsolute(args.path) ? args.path : path.resolve(cwd, '..', args.path)
        const gitArgs = ['worktree', 'add', '-b', args.branch, wtPath]
        if (args.baseRef) gitArgs.push(args.baseRef)
        const res = await runGit(gitArgs, cwd)
        if (res.code !== 0) return { success: false, error: res.stderr.trim() }
        return { success: true, data: { path: wtPath, branch: args.branch } }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'create failed' }
      }
    }
  )

  ipcMain.handle(
    'worktree:remove',
    async (_e, args: { cwd?: string; path: string; force?: boolean }) => {
      try {
        const cwd = args?.cwd || process.cwd()
        if (!args?.path) return { success: false, error: 'path required' }
        const gitArgs = ['worktree', 'remove']
        if (args.force) gitArgs.push('--force')
        gitArgs.push(args.path)
        const res = await runGit(gitArgs, cwd)
        if (res.code !== 0) return { success: false, error: res.stderr.trim() }
        return { success: true, data: true }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'remove failed' }
      }
    }
  )
}
