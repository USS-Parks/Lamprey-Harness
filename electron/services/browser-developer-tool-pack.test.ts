import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  observeConsole: vi.fn(async () => ({ entries: [] })),
  observeNetwork: vi.fn(async () => ({ entries: [] })),
  readNetworkBody: vi.fn(async () => ({ body: 'ok' }))
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./browser-developer-observer', () => ({
  browserDeveloperObserver: mocks
}))

import './browser-developer-tool-pack'
import { toolRegistry } from './tool-registry'
import { validateToolArguments } from './tool-schema-validator'

describe('BD-2 browser developer tool pack', () => {
  it('registers strict lazy metadata tools and approval-gates body capture', () => {
    const consoleTool = toolRegistry.getById('browser_console_observe')!
    const networkTool = toolRegistry.getById('browser_network_observe')!
    const bodyTool = toolRegistry.getById('browser_network_body')!

    expect(consoleTool).toMatchObject({
      lazy: true, risks: ['read'], requiresApproval: false, parallelizable: true, mutates: false
    })
    expect(networkTool).toMatchObject({
      lazy: true, risks: ['read', 'network'], requiresApproval: false, parallelizable: true, mutates: false
    })
    expect(bodyTool).toMatchObject({
      lazy: true, risks: ['read', 'network', 'secret'], requiresApproval: true,
      parallelizable: false, mutates: false
    })
    expect(validateToolArguments(
      bodyTool.id, { request_id: 'r1', extra: true }, bodyTool.inputSchema
    ).valid).toBe(false)
  })

  it('forwards cancellation and never folds body capture into metadata listing', async () => {
    const controller = new AbortController()
    await toolRegistry.executeNative(
      'browser_network_observe', { method: 'GET' }, { signal: controller.signal }
    )
    expect(mocks.observeNetwork).toHaveBeenCalledWith({ method: 'GET' }, controller.signal)
    expect(mocks.readNetworkBody).not.toHaveBeenCalled()

    await toolRegistry.executeNative(
      'browser_network_body', { request_id: 'r1' }, { signal: controller.signal }
    )
    expect(mocks.readNetworkBody).toHaveBeenCalledWith({ request_id: 'r1' }, controller.signal)
  })

  it('is discoverable through lazy tool search', () => {
    const names = toolRegistry.resolveToolSearch('browser developer console network response body')
      .map((item) => item.name)
    expect(names).toEqual(expect.arrayContaining([
      'browser_console_observe', 'browser_network_observe', 'browser_network_body'
    ]))
  })
})
