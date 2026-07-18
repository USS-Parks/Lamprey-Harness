import { ipcMain } from 'electron'
import * as artifactSandbox from '../services/artifact-sandbox'
import { mirrorEphemeralArtifact } from '../services/artifact-store'

export function registerArtifactHandlers(): void {
  ipcMain.handle('artifact:render', async (_event, type: string, content: string) => {
    try {
      // VA-1 — preserve the old two-argument preview surface while migrating
      // its process-local source into the durable artifact ledger. Rendering
      // remains available if persistence is temporarily unavailable.
      try {
        mirrorEphemeralArtifact(type, content)
      } catch (err) {
        console.warn('[artifact] failed to mirror ephemeral source:', err)
      }
      artifactSandbox.render(type, content)
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('artifact:hide', async () => {
    try {
      artifactSandbox.hide()
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'artifact:resize',
    async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
      try {
        artifactSandbox.setBounds(bounds)
        return { success: true, data: null }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('artifact:openInWindow', async (_event, type: string, content: string) => {
    try {
      artifactSandbox.openInWindow(type, content)
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('artifact:getSource', async () => {
    try {
      return { success: true, data: artifactSandbox.getSource() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('artifact:getType', async () => {
    try {
      return { success: true, data: artifactSandbox.getType() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
