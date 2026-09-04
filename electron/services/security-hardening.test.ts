import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// JM-19/JM-20 (July 2026 Maintenance) — the Electron shell + IPC hardening is
// wiring across main.ts / artifact-sandbox / files IPC / mcp IPC. These are
// source-reading contract locks (WC-8 pattern): the behaviours need a live
// Electron shell to exercise, so we pin the load-bearing guard lines.

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('JM-19 main-window navigation + open guards', () => {
  const main = read('electron/main.ts')

  it('setWindowOpenHandler forwards only http(s) to shell.openExternal', () => {
    expect(main).toMatch(/setWindowOpenHandler\(\(details\) => \{[\s\S]*?\/\^https\?:\\\/\\\/\/i\.test\(details\.url\)/)
  })

  it('the main window has a will-navigate guard gated on isAppNavigationUrl', () => {
    expect(main).toMatch(/on\('will-navigate'[\s\S]*?isAppNavigationUrl\(url\)/)
    expect(main).toMatch(/function isAppNavigationUrl/)
  })

  it('webview attachment is denied app-wide', () => {
    expect(main).toMatch(/will-attach-webview[\s\S]*?preventDefault/)
  })

  it('ping and shell:openExternal use the harness success/error envelope', () => {
    const ping = main.slice(
      main.indexOf("ipcMain.handle('ping'"),
      main.indexOf("ipcMain.handle('shell:openExternal'")
    )
    expect(ping).toMatch(/\{ success: true, data: 'pong' \}/)
    expect(ping).not.toMatch(/=> 'pong'/)

    const openExternal = main.slice(
      main.indexOf("ipcMain.handle('shell:openExternal'"),
      main.indexOf("ipcMain.handle('update:restart'")
    )
    expect(openExternal).toMatch(/return \{ success: true, data: null \}/)
    expect(openExternal).toMatch(/return \{ success: false, error: 'Only http\(s\) URLs are allowed' \}/)
    expect(openExternal).toMatch(/return \{ success: false, error: e\?\.message \?\? 'openExternal failed' \}/)
    expect(openExternal).toMatch(/await shell\.openExternal\(url\)/)
  })
})

describe('JM-19 artifact sandbox lockdown', () => {
  const art = read('electron/services/artifact-sandbox.ts')

  it('CSP carries form-action none', () => {
    expect(art).toMatch(/form-action 'none'/)
  })

  it('both artifact surfaces deny window-open and navigation', () => {
    expect(art).toMatch(/function lockDownArtifactContents/)
    expect(art).toMatch(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/)
    expect(art).toMatch(/will-navigate', \(event\) => event\.preventDefault\(\)/)
    // Wired into the docked view AND the popped-out window.
    expect((art.match(/lockDownArtifactContents\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('JM-20 file-read confinement + MCP spawn approval', () => {
  it('the file-read IPCs confine paths to the active workspace', () => {
    const files = read('electron/ipc/files.ts')
    expect(files).toMatch(/function confineToWorkspace/)
    // All three read/list/walk handlers gate on it.
    expect((files.match(/confineToWorkspace\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(files).toMatch(/OUTSIDE_WORKSPACE_ERROR/)
    // The actual read uses the confined path, not the raw input.
    expect(files).toMatch(/fs\.readFile\(safeFile\)/)
    expect(files).not.toMatch(/fs\.readFile\(filePath\)/)
  })

  it('files:process, openInVSCode, openInExplorer, and app:openPath reuse confineToWorkspace', () => {
    const files = read('electron/ipc/files.ts')
    const main = read('electron/main.ts')

    const processHandler = files.slice(
      files.indexOf("'files:process'"),
      files.indexOf("'files:getWorkdir'")
    )
    expect(processHandler).toMatch(/confineToWorkspace\(/)
    expect(processHandler).toMatch(/processFiles\(safePaths\)/)
    expect(processHandler).not.toMatch(/processFiles\(paths\)/)

    const vsHandler = files.slice(
      files.indexOf("'files:openInVSCode'"),
      files.indexOf("'files:openInExplorer'")
    )
    expect(vsHandler).toMatch(/confineToWorkspace\(/)
    expect(vsHandler).toMatch(/args\?\.targetPath \|\| getActiveWorkspace\(\)/)
    expect(vsHandler).not.toMatch(/process\.cwd\(\)/)
    expect(vsHandler).toMatch(/buildVSCodeLaunchPlan\(codePath, target\)/)

    const explorerHandler = files.slice(files.indexOf("'files:openInExplorer'"))
    expect(explorerHandler).toMatch(/confineToWorkspace\(/)
    expect(explorerHandler).toMatch(/args\?\.targetPath \|\| getActiveWorkspace\(\)/)
    expect(explorerHandler).not.toMatch(/process\.cwd\(\)/)
    expect(explorerHandler).toMatch(/shell\.openPath\(target\)/)

    const openPathHandler = main.slice(main.indexOf("'app:openPath'"))
    expect(openPathHandler).toMatch(/confineToWorkspace\(/)
    expect(openPathHandler).toMatch(/shell\.openPath\(safe\)/)
    expect(openPathHandler).not.toMatch(/shell\.openPath\(p\)/)
  })

  it('adding a stdio MCP connector requires an approval dialog before spawn', () => {
    const mcp = read('electron/ipc/mcp.ts')
    const handler = mcp.slice(mcp.indexOf("'mcp:addServer'"))
    const dialogIdx = handler.indexOf('showMessageBox')
    const addIdx = handler.indexOf('addServerIfMissing')
    expect(dialogIdx).toBeGreaterThan(-1)
    expect(addIdx).toBeGreaterThan(dialogIdx)
    expect(handler).toMatch(/parsed\.transport === 'stdio'/)
  })

  it('the signing path is documented and env-gated in electron-builder.yml', () => {
    const yml = read('electron-builder.yml')
    expect(yml).toMatch(/WIN_CSC_LINK/)
    expect(yml).toMatch(/SEC-6/)
  })
})
