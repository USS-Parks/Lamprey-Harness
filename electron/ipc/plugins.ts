import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { PluginManifest } from '../services/plugin-loader'
import {
  listPlugins,
  getPlugin,
  setPluginEnabled,
  removePlugin,
  installFromDirectory,
  installFromManifest,
  installBundled,
  bundledPluginsNotInstalled
} from '../services/plugin-loader'

export function registerPluginsHandlers(): void {
  ipcMain.handle('plugins:list', async () => {
    try {
      return { success: true, data: listPlugins() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:get', async (_event, id: string) => {
    try {
      const plugin = getPlugin(id)
      if (!plugin) return { success: false, error: `Plugin not found: ${id}` }
      return { success: true, data: plugin }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:enable', async (_event, id: string) => {
    try {
      const ok = setPluginEnabled(id, true)
      if (!ok) return { success: false, error: `Plugin not found: ${id}` }
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:disable', async (_event, id: string) => {
    try {
      const ok = setPluginEnabled(id, false)
      if (!ok) return { success: false, error: `Plugin not found: ${id}` }
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:remove', async (_event, id: string) => {
    try {
      const ok = removePlugin(id)
      if (!ok) return { success: false, error: `Plugin not found or could not be removed: ${id}` }
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:installFromDirectory', async (_event, srcPath: string) => {
    try {
      if (typeof srcPath !== 'string' || !srcPath.trim()) {
        return { success: false, error: 'srcPath is required' }
      }
      const result = installFromDirectory(srcPath.trim())
      if (!result.ok) return { success: false, error: result.error }
      return { success: true, data: { id: result.id } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:installFromUrl', async (_event, _url: string) => {
    // Deferred: archive extraction (.zip / .tar.gz) needs a parser dep that
    // isn't currently in production deps. The flow ships with the other
    // three install paths (directory, manifest paste, bundled catalog);
    // URL fetch + extract is a follow-up. See LAMPREY_CUSTOMIZE_PLAN.md C10.
    return {
      success: false,
      error:
        'URL install is not yet available. Use "From directory" or "Paste manifest" instead.'
    }
  })

  ipcMain.handle(
    'plugins:installFromManifest',
    async (_event, manifest: PluginManifest, files?: Record<string, string>) => {
      try {
        if (!manifest || typeof manifest !== 'object') {
          return { success: false, error: 'Manifest object is required' }
        }
        const result = installFromManifest(manifest, files)
        if (!result.ok) return { success: false, error: result.error }
        return { success: true, data: { id: result.id } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('plugins:listBundledAvailable', async () => {
    try {
      return { success: true, data: bundledPluginsNotInstalled() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:installBundled', async (_event, id: string) => {
    try {
      const result = installBundled(id)
      if (!result.ok) return { success: false, error: result.error }
      return { success: true, data: { id: result.id } }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:pickDirectory', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const opts = {
        title: 'Select plugin directory',
        properties: ['openDirectory'] as Array<'openDirectory'>
      }
      const res = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts)
      if (res.canceled || res.filePaths.length === 0) {
        return { success: true, data: null }
      }
      return { success: true, data: res.filePaths[0] }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
