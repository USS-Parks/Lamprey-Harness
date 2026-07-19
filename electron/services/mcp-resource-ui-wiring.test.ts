import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('MR-4 MCP resource and session UI wiring', () => {
  it('locks resource inventory, preview, open, and auth lifecycle through IPC/preload', () => {
    const ipc = source('electron/ipc/mcp.ts')
    const preload = source('electron/preload.ts')
    const hook = source('src/hooks/useMcp.ts')
    for (const channel of [
      'mcp:listResources',
      'mcp:listResourceTemplates',
      'mcp:readResource',
      'mcp:openResource'
    ]) {
      expect(ipc).toContain(`ipcMain.handle('${channel}'`)
    }
    expect(ipc).toContain("url.protocol !== 'https:' && url.protocol !== 'http:'")
    expect(ipc).toContain('url.username || url.password')
    expect(ipc.indexOf('showMessageBox')).toBeLessThan(ipc.indexOf('shell.openExternal'))
    expect(preload).toContain("ipcRenderer.on('mcp:resourceChanged'")
    expect(hook).toContain('disposeResource()')
    expect(hook).toContain('disposeAuth()')
  })

  it('locks resource/template/auth surfaces and excludes executable preview HTML', () => {
    const column = source('src/components/customize/ConnectorsColumn.tsx')
    const addFlow = source('src/components/customize/AddConnectorFlow.tsx')
    expect(column).toContain('Reauthorize')
    expect(column).toContain('Resources')
    expect(column).toContain('Templates')
    expect(column).toContain('Resource preview')
    expect(column).toContain('classifyMcpResourceContent')
    expect(column).not.toContain('dangerouslySetInnerHTML')
    expect(addFlow).toContain('streamable-http')
    expect(addFlow).toContain('"auth": "oauth"')
  })

  it('keeps activity events metadata-only', () => {
    const manager = source('electron/services/mcp-manager.ts')
    const start = manager.indexOf('private setAuthStatus')
    const end = manager.indexOf('private wireResourceNotifications')
    const activity = manager.slice(start, end)
    expect(activity).toContain("type: 'mcp.session.status'")
    expect(activity).toContain("type: 'mcp.elicitation'")
    expect(activity).toContain("type: 'mcp.resource.changed'")
    for (const secretOrBody of ['access_token', 'refresh_token', 'client_secret', 'authorizationUrl', 'content.blob', 'content.text']) {
      expect(activity).not.toContain(secretOrBody)
    }
  })
})
