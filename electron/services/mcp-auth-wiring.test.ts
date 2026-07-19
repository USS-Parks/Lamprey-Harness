import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] }
}))
vi.mock('../services/mcp-manager', () => ({ mcpManager: {} }))
vi.mock('../services/keychain', () => ({}))
vi.mock('../services/oauth-state', () => ({
  createOAuthSession: vi.fn(),
  validateOAuthCallback: vi.fn()
}))

import { sanitizeAddServerInput } from '../ipc/mcp'

describe('MR-3 hosted MCP auth wiring', () => {
  it('accepts hosted Streamable HTTP OAuth config and rejects OAuth on stdio', () => {
    expect(
      sanitizeAddServerInput({
        id: 'hosted',
        name: 'Hosted',
        transport: 'streamable-http',
        url: 'https://mcp.example/mcp',
        auth: 'oauth'
      })
    ).toEqual({
      id: 'hosted',
      name: 'Hosted',
      transport: 'streamable-http',
      url: 'https://mcp.example/mcp',
      auth: 'oauth',
      enabled: true
    })
    expect(
      sanitizeAddServerInput({
        id: 'bad',
        transport: 'stdio',
        command: 'node',
        auth: 'oauth'
      })
    ).toMatch(/does not support hosted OAuth/)
  })

  it('locks the manager, IPC, and preload lifecycle seams', () => {
    const root = process.cwd()
    const manager = readFileSync(join(root, 'electron/services/mcp-manager.ts'), 'utf8')
    const ipc = readFileSync(join(root, 'electron/ipc/mcp.ts'), 'utf8')
    const preload = readFileSync(join(root, 'electron/preload.ts'), 'utf8')

    expect(manager).toContain('new StreamableHTTPClientTransport')
    expect(manager).toContain('ElicitRequestSchema')
    expect(manager).toContain('requestMcpUrlElicitationConsent')
    expect(manager).toContain("this.setAuthStatus(state, 'expired'")
    expect(ipc).toContain("ipcMain.handle('mcp:getAuthStatus'")
    expect(ipc).toContain("ipcMain.handle('mcp:reauthorize'")
    expect(ipc.indexOf('showMessageBox')).toBeLessThan(ipc.indexOf('shell.openExternal'))
    expect(preload).toContain("ipcRenderer.invoke('mcp:reauthorize', id)")
    expect(preload).toContain("ipcRenderer.on('mcp:authStatusChanged'")
    expect(preload).toContain("ipcRenderer.on('mcp:elicitationChanged'")
  })

  it('keeps auth events metadata-only', () => {
    const manager = readFileSync(
      join(process.cwd(), 'electron/services/mcp-manager.ts'),
      'utf8'
    )
    const method = manager.slice(
      manager.indexOf('private setAuthStatus'),
      manager.indexOf('private emitElicitation')
    )
    expect(method).toContain('redactMcpAuthError')
    expect(method).not.toMatch(/access_token|refresh_token|client_secret|authorizationUrl/)
  })
})
