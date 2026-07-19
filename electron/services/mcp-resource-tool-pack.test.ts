import { readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServers: vi.fn(),
  getResourceCapabilities: vi.fn(),
  listResources: vi.fn(),
  listResourceTemplates: vi.fn(),
  readResource: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./mcp-manager', () => ({
  mcpManager: {
    getAllTools: () => [],
    getServers: mocks.getServers,
    getResourceCapabilities: mocks.getResourceCapabilities,
    listResources: mocks.listResources,
    listResourceTemplates: mocks.listResourceTemplates,
    readResource: mocks.readResource
  }
}))

import './mcp-resource-tool-pack'
import { toolRegistry } from './tool-registry'
import { validateToolArguments } from './tool-schema-validator'

const NAMES = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServers.mockReturnValue([
    { id: 'zeta', status: 'connected' },
    { id: 'alpha', status: 'connected' },
    { id: 'offline', status: 'disconnected' }
  ])
  mocks.getResourceCapabilities.mockImplementation((id: string) => ({
    supported: id !== 'offline',
    subscribe: false,
    listChanged: false
  }))
  mocks.listResources.mockImplementation(async (server: string) => ({
    items: [{ uri: `test://${server}/readme`, name: 'README', mimeType: 'text/plain' }],
    nextCursor: `${server}-next`
  }))
  mocks.listResourceTemplates.mockImplementation(async (server: string) => ({
    items: [{ uriTemplate: `test://${server}/{name}`, name: 'By name' }]
  }))
  mocks.readResource.mockResolvedValue([
    { uri: 'test://alpha/readme', mimeType: 'text/plain', text: 'hello' }
  ])
})

describe('MR-2 MCP resource tools', () => {
  it('registers strict lazy read-only network tools', () => {
    for (const name of NAMES) {
      const descriptor = toolRegistry.getById(name)
      expect(descriptor?.lazy, name).toBe(true)
      expect(descriptor?.risks, name).toEqual(['read', 'network'])
      expect(descriptor?.requiresApproval, name).toBe(false)
      expect(descriptor?.parallelizable, name).toBe(true)
      expect(descriptor?.mutates, name).toBe(false)
      expect((descriptor?.inputSchema as { additionalProperties: boolean }).additionalProperties).toBe(
        false
      )
      expect(
        validateToolArguments(name, { extra: true }, descriptor!.inputSchema).valid,
        name
      ).toBe(false)
    }
  })

  it('lists every connected resource server in stable order with provenance', async () => {
    const raw = await toolRegistry.executeNative('list_mcp_resources', {}, {})
    const result = JSON.parse(String(raw))

    expect(result.pages.map((page: { server: string }) => page.server)).toEqual(['alpha', 'zeta'])
    expect(result.pages[0].resources[0]).toMatchObject({
      server: 'alpha',
      uri: 'test://alpha/readme'
    })
    expect(mocks.listResources).toHaveBeenCalledTimes(2)
  })

  it('binds an opaque cursor to one exact server and propagates cancellation', async () => {
    const controller = new AbortController()
    await toolRegistry.executeNative(
      'list_mcp_resource_templates',
      { server: 'alpha', cursor: 'page-2' },
      { signal: controller.signal }
    )
    expect(mocks.listResourceTemplates).toHaveBeenCalledWith(
      'alpha',
      'page-2',
      controller.signal
    )

    await expect(
      toolRegistry.executeNative('list_mcp_resources', { cursor: 'orphan' }, {})
    ).rejects.toThrow(/requires an exact server/)
  })

  it('returns text, image, audio, and generic blobs as canonical content blocks', async () => {
    mocks.readResource.mockResolvedValueOnce([
      { uri: 'test://alpha/readme', mimeType: 'text/markdown', text: '# Hello' },
      { uri: 'test://alpha/readme', mimeType: 'image/png', blob: 'AAE=' },
      { uri: 'test://alpha/readme', mimeType: 'audio/wav', blob: 'AAE=' },
      { uri: 'test://alpha/readme', mimeType: 'application/pdf', blob: 'AAE=' }
    ])

    const raw = await toolRegistry.executeNative(
      'read_mcp_resource',
      { server: 'alpha', uri: 'test://alpha/readme' },
      {}
    )
    const result = JSON.parse(String(raw))

    expect(result.server).toBe('alpha')
    expect(result.content).toEqual([
      {
        type: 'resource',
        resource: {
          uri: 'test://alpha/readme',
          mimeType: 'text/markdown',
          text: '# Hello',
          _meta: { server: 'alpha' }
        }
      },
      {
        type: 'image',
        data: 'AAE=',
        mimeType: 'image/png',
        _meta: { server: 'alpha', uri: 'test://alpha/readme' }
      },
      {
        type: 'audio',
        data: 'AAE=',
        mimeType: 'audio/wav',
        _meta: { server: 'alpha', uri: 'test://alpha/readme' }
      },
      {
        type: 'resource',
        resource: {
          uri: 'test://alpha/readme',
          mimeType: 'application/pdf',
          blob: 'AAE=',
          _meta: { server: 'alpha' }
        }
      }
    ])
  })

  it('rejects URI provenance mismatch and malformed base64', async () => {
    mocks.readResource.mockResolvedValueOnce([
      { uri: 'test://other/readme', mimeType: 'text/plain', text: 'wrong origin' }
    ])
    await expect(
      toolRegistry.executeNative(
        'read_mcp_resource',
        { server: 'alpha', uri: 'test://alpha/readme' },
        {}
      )
    ).rejects.toThrow(/returned 'test:\/\/other\/readme'/)

    mocks.readResource.mockResolvedValueOnce([
      { uri: 'test://alpha/readme', mimeType: 'image/png', blob: 'not-base64' }
    ])
    await expect(
      toolRegistry.executeNative(
        'read_mcp_resource',
        { server: 'alpha', uri: 'test://alpha/readme' },
        {}
      )
    ).rejects.toThrow(/valid base64/)
  })

  it('is discoverable lazily and uses the canonical chat spill valve', () => {
    expect(toolRegistry.resolveToolSearch('MCP resource templates').map((item) => item.name)).toEqual(
      expect.arrayContaining(NAMES)
    )

    const packs = readFileSync(join(process.cwd(), 'electron/services/tool-packs.ts'), 'utf8')
    const chat = readFileSync(join(process.cwd(), 'electron/ipc/chat.ts'), 'utf8')
    expect(packs).toContain("import './mcp-resource-tool-pack'")
    expect(chat).toContain('maybeSpillToolResult(r.result')
  })
})
