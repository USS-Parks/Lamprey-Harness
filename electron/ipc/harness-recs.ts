import { ipcMain } from 'electron'
import { generateRecommendations } from '../services/harness-recommendations'

export function registerHarnessRecsHandlers(): void {
  ipcMain.handle('harness:recommendations', async (_event, conversationId: unknown) => {
    try {
      const opts: { conversationId?: string } = {}
      if (typeof conversationId === 'string' && conversationId.trim()) {
        opts.conversationId = conversationId
      }
      return { success: true, data: generateRecommendations(opts) }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message ?? 'harness:recommendations failed'
      }
    }
  })
}
