import { ipcMain } from 'electron'
import { listDocumentsForConversation } from '../services/conversation-store'

export function registerDocumentsHandlers(): void {
  ipcMain.handle('documents:list', async (_event, conversationId: string) => {
    try {
      if (typeof conversationId !== 'string' || !conversationId) {
        return { success: false, error: 'documents:list requires a conversationId string' }
      }
      return { success: true, data: listDocumentsForConversation(conversationId) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })
}
