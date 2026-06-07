import { ipcMain } from 'electron'
import { buildAfterActionReport } from '../services/after-action-report'

export function registerAfterActionHandlers(): void {
  ipcMain.handle('after-action:get', async (_event, conversationId: unknown) => {
    try {
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        return { success: false, error: 'conversationId is required' }
      }
      return { success: true, data: buildAfterActionReport(conversationId) }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message ?? 'after-action:get failed'
      }
    }
  })
}
