import { ipcMain } from 'electron'
import * as bm from '../services/browser-manager'

export function registerBrowserHandlers(): void {
  ipcMain.handle('browser:newTab', async (_e, args: { url?: string }) => {
    try {
      const tab = await bm.newTab(args?.url)
      return { success: true, data: { id: tab.id } }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'newTab failed' }
    }
  })

  ipcMain.handle('browser:closeTab', async (_e, args: { id: string }) => {
    try {
      bm.closeTab(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'closeTab failed' }
    }
  })

  ipcMain.handle('browser:setActiveTab', async (_e, args: { id: string }) => {
    try {
      bm.setActiveTab(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'setActiveTab failed' }
    }
  })

  ipcMain.handle('browser:navigate', async (_e, args: { id: string; url: string }) => {
    try {
      bm.navigate(args.id, args.url)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'navigate failed' }
    }
  })

  ipcMain.handle('browser:back', async (_e, args: { id: string }) => {
    try {
      bm.goBack(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'back failed' }
    }
  })

  ipcMain.handle('browser:forward', async (_e, args: { id: string }) => {
    try {
      bm.goForward(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'forward failed' }
    }
  })

  ipcMain.handle('browser:reload', async (_e, args: { id: string }) => {
    try {
      bm.reload(args.id)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'reload failed' }
    }
  })

  ipcMain.handle(
    'browser:setBounds',
    async (_e, args: { x: number; y: number; width: number; height: number }) => {
      try {
        bm.setBounds(args)
        return { success: true, data: true }
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'setBounds failed' }
      }
    }
  )

  ipcMain.handle('browser:setVisible', async (_e, args: { visible: boolean }) => {
    try {
      bm.setVisible(!!args?.visible)
      return { success: true, data: true }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'setVisible failed' }
    }
  })

  ipcMain.handle('browser:listTabs', async () => {
    try {
      return { success: true, data: { tabs: bm.listTabs(), activeTabId: bm.getActiveTabId() } }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'listTabs failed' }
    }
  })
}
