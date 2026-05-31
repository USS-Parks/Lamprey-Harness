import { ipcMain } from 'electron'
import * as store from '../services/hooks-store'

export function registerHooksHandlers(): void {
  ipcMain.handle('hooks:list', async () => {
    try {
      return { success: true, data: store.listHooks() }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'list failed' }
    }
  })

  ipcMain.handle(
    'hooks:create',
    async (_e, input: { event: store.HookEvent; label: string; command: string }) => {
      try {
        if (!input?.event || !input?.label || !input?.command) {
          return { success: false, error: 'event, label, command required' }
        }
        return { success: true, data: store.createHook(input) }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'create failed' }
      }
    }
  )

  ipcMain.handle(
    'hooks:update',
    async (
      _e,
      id: string,
      patch: Partial<{ event: store.HookEvent; label: string; command: string; enabled: boolean }>
    ) => {
      try {
        store.updateHook(id, patch)
        return { success: true, data: true }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'update failed' }
      }
    }
  )

  ipcMain.handle('hooks:delete', async (_e, id: string) => {
    try {
      store.deleteHook(id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'delete failed' }
    }
  })
}
