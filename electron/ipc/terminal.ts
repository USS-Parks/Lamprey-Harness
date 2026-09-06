import { getConversation } from '../services/conversation-store'
import { getProject } from '../services/projects-store'
import { getActiveWorkspace } from '../services/workspace-state'
import { ipcMain, BrowserWindow } from 'electron'
import { ptySpawn, ptyWrite, ptyResize, ptyKill, ptySnapshot, type ShellKind } from '../services/pty-manager'

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:snapshot', (_event, args: { id: string }) => typeof args?.id === 'string' ? { success: true, data: ptySnapshot(args.id) } : { success: false, error: 'id required' })
  ipcMain.handle(
    'terminal:spawn',
    async (event, args: { id: string; cwd?: string; shellKind?: ShellKind; conversationId?: string | null }) => {
      try {
        if (!args?.id || typeof args.id !== 'string') {
          return { success: false, error: 'id required' }
        }
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return { success: false, error: 'no window' }
        const conversation = args.conversationId ? getConversation(args.conversationId) : null
        if (args.conversationId && !conversation) throw new Error('The terminal task no longer exists.')
        const project = conversation?.projectId ? getProject(conversation.projectId) : null
        const cwd = conversation?.worktreePath || project?.path || args.cwd || getActiveWorkspace()
        const info = ptySpawn(args.id, win, { cwd, shellKind: args.shellKind, conversationId: args.conversationId ?? null })
        return { success: true, data: info }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'spawn failed' }
      }
    }
  )

  ipcMain.handle('terminal:write', async (_event, args: { id: string; data: string }) => {
    try {
      if (!args?.id || typeof args.data !== 'string') {
        return { success: false, error: 'id and data required' }
      }
      const ok = ptyWrite(args.id, args.data)
      return { success: ok, data: ok }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'write failed' }
    }
  })

  ipcMain.handle(
    'terminal:resize',
    async (_event, args: { id: string; cols: number; rows: number }) => {
      try {
        const ok = ptyResize(args.id, args.cols, args.rows)
        return { success: true, data: ok }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'resize failed' }
      }
    }
  )

  ipcMain.handle('terminal:kill', async (_event, args: { id: string }) => {
    try {
      const ok = ptyKill(args.id)
      return { success: ok, data: ok }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'kill failed' }
    }
  })
}
