import { ipcMain } from 'electron'

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:list', async () => {
    return { success: true, data: null }
  })

  ipcMain.handle('mcp:getStatus', async (_event, _id) => {
    return { success: true, data: null }
  })

  ipcMain.handle('mcp:reconnect', async (_event, _id) => {
    return { success: true, data: null }
  })

  ipcMain.handle('mcp:setupGoogleOAuth', async () => {
    return { success: true, data: null }
  })

  // mcp:approveToolCall is registered in chat.ts (handles confirmation flow)
}
