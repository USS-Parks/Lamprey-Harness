import { describe, it, expect, beforeEach, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({ auth: vi.fn() }))

// Mock electron's app so the module loads under vitest's node environment.
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/lamprey-test-userdata-nonexistent'
  },
  BrowserWindow: { getAllWindows: () => [] }
}))

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  auth: authMocks.auth,
  UnauthorizedError: class UnauthorizedError extends Error {}
}))

// Stub the SDK transports so importing the manager doesn't try to open a
// stdio child / SSE socket.
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class {}
}))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {}
}))

// We need the real ErrorCode + McpError for the manager's instanceof check to
// match what the mocked Client throws.
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class FakeClient {
    public capturedTimeout: number | undefined
    private static maybeFail(opts?: { signal?: AbortSignal }) {
      if (opts?.signal?.aborted) {
        const error = new Error('aborted')
        error.name = 'AbortError'
        throw error
      }
      if (FakeClient.resourceBehaviour === 'timeout') {
        throw new McpError(ErrorCode.RequestTimeout, 'request timeout')
      }
    }
    async callTool(_params: unknown, _schema: unknown, opts?: { timeout?: number }) {
      // Record what the manager passed so the test can assert on it.
      FakeClient.lastTimeoutMs = opts?.timeout
      if (FakeClient.behaviour === 'timeout') {
        throw new McpError(ErrorCode.RequestTimeout, 'request timeout')
      }
      if (FakeClient.behaviour === 'generic-error') {
        throw new Error('boom')
      }
      return { isError: false, content: [{ type: 'text', text: 'ok' }] }
    }
    getServerCapabilities() {
      return FakeClient.capabilities
    }
    async listResources(params?: { cursor?: string }, opts?: { signal?: AbortSignal }) {
      FakeClient.maybeFail(opts)
      FakeClient.lastCursor = params?.cursor
      return FakeClient.resourcesResult
    }
    async listResourceTemplates(params?: { cursor?: string }, opts?: { signal?: AbortSignal }) {
      FakeClient.maybeFail(opts)
      FakeClient.lastCursor = params?.cursor
      return FakeClient.templatesResult
    }
    async readResource(params: { uri: string }, opts?: { signal?: AbortSignal }) {
      FakeClient.maybeFail(opts)
      FakeClient.lastUri = params.uri
      return FakeClient.readResult
    }
    async subscribeResource(params: { uri: string }, opts?: { signal?: AbortSignal }) {
      FakeClient.maybeFail(opts)
      FakeClient.lastUri = params.uri
      return {}
    }
    async unsubscribeResource(params: { uri: string }, opts?: { signal?: AbortSignal }) {
      FakeClient.maybeFail(opts)
      FakeClient.lastUri = params.uri
      return {}
    }
    setNotificationHandler(_schema: unknown, handler: (notification: any) => void) {
      FakeClient.notificationHandlers.push(handler)
    }
    static lastTimeoutMs: number | undefined
    static behaviour: 'ok' | 'timeout' | 'generic-error' = 'ok'
    static resourceBehaviour: 'ok' | 'timeout' = 'ok'
    static capabilities: Record<string, unknown> = {
      tools: {},
      resources: { subscribe: true, listChanged: true }
    }
    static resourcesResult: Record<string, unknown> = {
      resources: [{ uri: 'test://server/readme', name: 'README' }]
    }
    static templatesResult: Record<string, unknown> = {
      resourceTemplates: [{ uriTemplate: 'test://server/{name}', name: 'By name' }]
    }
    static readResult: Record<string, unknown> = {
      contents: [{ uri: 'test://server/readme', mimeType: 'text/plain', text: 'hello' }]
    }
    static lastCursor: string | undefined
    static lastUri: string | undefined
    static notificationHandlers: ((notification: any) => void)[] = []
  }
}))

// keychain is incidental; stub to be safe.
vi.mock('./keychain', () => ({
  getKey: () => null,
  hasKey: () => false,
  setKey: () => undefined
}))

import {
  McpManager,
  MCPRequestTimeoutError,
  MCPTimeoutError,
  MCP_RESOURCE_LIMITS,
  redactMcpAuthError,
  __setMcpCallTimeoutForTesting
} from './mcp-manager'
import { Client as FakeClientCtor } from '@modelcontextprotocol/sdk/client/index.js'

function seedConnectedServer(mgr: McpManager, serverId: string): any {
  // Reach into the manager's internal state map. The test bypasses the real
  // connect/handshake flow entirely — we only care that callTool wires the
  // timeout and translates RequestTimeout into MCPTimeoutError.
  const fakeClient = new (FakeClientCtor as any)()
  ;(mgr as any).servers.set(serverId, {
    config: { id: serverId, name: serverId, transport: 'stdio', auth: 'none', enabled: true },
    status: 'connected',
    client: fakeClient,
    transport: null,
    tools: [],
    restartCount: 0
  })
  return fakeClient
}

beforeEach(() => {
  __setMcpCallTimeoutForTesting(null)
  ;(FakeClientCtor as any).lastTimeoutMs = undefined
  ;(FakeClientCtor as any).behaviour = 'ok'
  ;(FakeClientCtor as any).resourceBehaviour = 'ok'
  ;(FakeClientCtor as any).capabilities = {
    tools: {},
    resources: { subscribe: true, listChanged: true }
  }
  ;(FakeClientCtor as any).resourcesResult = {
    resources: [{ uri: 'test://server/readme', name: 'README' }]
  }
  ;(FakeClientCtor as any).templatesResult = {
    resourceTemplates: [{ uriTemplate: 'test://server/{name}', name: 'By name' }]
  }
  ;(FakeClientCtor as any).readResult = {
    contents: [{ uri: 'test://server/readme', mimeType: 'text/plain', text: 'hello' }]
  }
  ;(FakeClientCtor as any).lastCursor = undefined
  ;(FakeClientCtor as any).lastUri = undefined
  ;(FakeClientCtor as any).notificationHandlers = []
  authMocks.auth.mockReset()
})

describe('mcpManager.callTool — per-call timeout (T2)', () => {
  it('passes the configured timeout to client.callTool', async () => {
    __setMcpCallTimeoutForTesting(45_000)
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'srv1')

    const result = await mgr.callTool('srv1', 'do_thing', { x: 1 })

    expect(result).toBe('ok')
    expect((FakeClientCtor as any).lastTimeoutMs).toBe(45_000)

    __setMcpCallTimeoutForTesting(null)
  })

  it('falls back to SDK default when configured timeout is 0', async () => {
    __setMcpCallTimeoutForTesting(0)
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'srv2')

    await mgr.callTool('srv2', 'do_thing', {})

    expect((FakeClientCtor as any).lastTimeoutMs).toBeUndefined()

    __setMcpCallTimeoutForTesting(null)
  })

  it('translates RequestTimeout McpError into a typed MCPTimeoutError', async () => {
    __setMcpCallTimeoutForTesting(30_000)
    ;(FakeClientCtor as any).behaviour = 'timeout'
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'srv3')

    await expect(mgr.callTool('srv3', 'slow_query', { q: 'x' })).rejects.toMatchObject({
      name: 'MCPTimeoutError',
      serverId: 'srv3',
      toolName: 'slow_query',
      timeoutMs: 30_000
    })

    __setMcpCallTimeoutForTesting(null)
  })

  it('lets non-timeout errors pass through unchanged', async () => {
    __setMcpCallTimeoutForTesting(30_000)
    ;(FakeClientCtor as any).behaviour = 'generic-error'
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'srv4')

    await expect(mgr.callTool('srv4', 'broken_tool', {})).rejects.toThrow('boom')

    __setMcpCallTimeoutForTesting(null)
  })

  it('MCPTimeoutError exposes server, tool, and threshold for logging', () => {
    const e = new MCPTimeoutError('srv', 'tool', 90_000)
    expect(e.name).toBe('MCPTimeoutError')
    expect(e.serverId).toBe('srv')
    expect(e.toolName).toBe('tool')
    expect(e.timeoutMs).toBe(90_000)
    expect(e.message).toMatch(/90s/)
  })
})

describe('McpManager resource capability surface (MR-1)', () => {
  it('passes a resource cursor through and returns the server next cursor', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'resources')
    ;(FakeClientCtor as any).resourcesResult = {
      resources: [{ uri: 'test://server/second', name: 'Second' }],
      nextCursor: 'page-3'
    }

    await expect(mgr.listResources('resources', 'page-2')).resolves.toEqual({
      items: [{ uri: 'test://server/second', name: 'Second' }],
      nextCursor: 'page-3'
    })
    expect((FakeClientCtor as any).lastCursor).toBe('page-2')
  })

  it('lists resource templates without conflating them with concrete resources', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'templates')

    await expect(mgr.listResourceTemplates('templates')).resolves.toEqual({
      items: [{ uriTemplate: 'test://server/{name}', name: 'By name' }],
      nextCursor: undefined
    })
  })

  it('reads text and blob content while preserving MIME and URI provenance', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'reader')
    ;(FakeClientCtor as any).readResult = {
      contents: [
        { uri: 'test://server/readme', mimeType: 'text/plain', text: 'hello' },
        { uri: 'test://server/readme', mimeType: 'application/octet-stream', blob: 'AAE=' }
      ]
    }

    await expect(mgr.readResource('reader', 'test://server/readme')).resolves.toEqual(
      (FakeClientCtor as any).readResult.contents
    )
    expect((FakeClientCtor as any).lastUri).toBe('test://server/readme')
  })

  it('rejects resource operations when the server did not advertise resources', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'tools-only')
    ;(FakeClientCtor as any).capabilities = { tools: {} }

    await expect(mgr.listResources('tools-only')).rejects.toMatchObject({
      name: 'McpResourceCapabilityError',
      serverId: 'tools-only'
    })
  })

  it('rejects malformed and control-character resource URIs before SDK dispatch', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'reader')

    await expect(mgr.readResource('reader', 'relative/path')).rejects.toThrow(
      'Invalid MCP resource URI'
    )
    await expect(mgr.readResource('reader', 'test://server/readme\n')).rejects.toThrow(
      'whitespace or control characters'
    )
    expect((FakeClientCtor as any).lastUri).toBeUndefined()
  })

  it('fails closed when a server returns an oversized resource page', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'resources')
    ;(FakeClientCtor as any).resourcesResult = {
      resources: Array.from({ length: MCP_RESOURCE_LIMITS.maxPageItems + 1 }, (_, index) => ({
        uri: `test://server/${index}`,
        name: String(index)
      }))
    }

    await expect(mgr.listResources('resources')).rejects.toMatchObject({
      name: 'McpResourceBoundsError'
    })
  })

  it('fails closed when read content exceeds the byte ceiling', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'reader')
    ;(FakeClientCtor as any).readResult = {
      contents: [
        {
          uri: 'test://server/large',
          text: 'x'.repeat(MCP_RESOURCE_LIMITS.maxContentBytes + 1)
        }
      ]
    }

    await expect(mgr.readResource('reader', 'test://server/large')).rejects.toMatchObject({
      name: 'McpResourceBoundsError'
    })
  })

  it('translates SDK resource timeouts without changing callTool timeout semantics', async () => {
    __setMcpCallTimeoutForTesting(25_000)
    ;(FakeClientCtor as any).resourceBehaviour = 'timeout'
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'resources')

    await expect(mgr.listResources('resources')).rejects.toEqual(
      new MCPRequestTimeoutError('resources', 'resources/list', 25_000)
    )
  })

  it('propagates AbortSignal cancellation to the SDK request', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'resources')
    const controller = new AbortController()
    controller.abort()

    await expect(mgr.listResources('resources', undefined, controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
  })

  it('requires subscribe capability and forwards subscribe/unsubscribe URI', async () => {
    const mgr = new McpManager()
    seedConnectedServer(mgr, 'resources')

    await mgr.subscribeResource('resources', 'test://server/readme')
    await mgr.unsubscribeResource('resources', 'test://server/readme')
    expect((FakeClientCtor as any).lastUri).toBe('test://server/readme')

    ;(FakeClientCtor as any).capabilities = { resources: {} }
    await expect(mgr.subscribeResource('resources', 'test://server/readme')).rejects.toMatchObject({
      name: 'McpResourceCapabilityError'
    })
  })

  it('emits bounded list-change and resource-update notifications', () => {
    const mgr = new McpManager()
    const client = seedConnectedServer(mgr, 'resources')
    const changes: unknown[] = []
    const unsubscribe = mgr.onResourceChange((change) => changes.push(change))

    ;(mgr as any).wireResourceNotifications('resources', client)
    const handlers = (FakeClientCtor as any).notificationHandlers
    handlers[0]({ method: 'notifications/resources/list_changed' })
    handlers[1]({
      method: 'notifications/resources/updated',
      params: { uri: 'test://server/readme' }
    })
    unsubscribe()
    handlers[0]({ method: 'notifications/resources/list_changed' })

    expect(changes).toEqual([
      { serverId: 'resources', kind: 'list-changed' },
      { serverId: 'resources', kind: 'resource-updated', uri: 'test://server/readme' }
    ])
  })
})

describe('McpManager hosted auth lifecycle (MR-3)', () => {
  function seedHostedServer(mgr: McpManager) {
    const provider = {
      invalidateCredentials: vi.fn(),
      takeAuthorizationRequest: vi.fn(() => ({
        authorizationUrl: 'https://auth.example/authorize?state=expected',
        state: 'expected'
      })),
      validateCallbackState: vi.fn(),
      hasTokens: vi.fn(() => false),
      tokensExpired: vi.fn(() => false)
    }
    const state = {
      config: {
        id: 'hosted',
        name: 'Hosted',
        transport: 'streamable-http',
        url: 'https://mcp.example/mcp',
        auth: 'oauth',
        enabled: true
      },
      status: 'disconnected',
      client: null,
      transport: null,
      tools: [],
      restartCount: 0,
      authProvider: provider
    }
    ;(mgr as any).servers.set('hosted', state)
    return { provider, state }
  }

  it('moves signed-out sessions through explicit authorization-required state', async () => {
    authMocks.auth.mockResolvedValueOnce('REDIRECT')
    const mgr = new McpManager()
    const { provider } = seedHostedServer(mgr)
    const snapshots: unknown[] = []
    mgr.onAuthStatusChange((snapshot) => snapshots.push(snapshot))

    await expect(mgr.beginHostedAuthorization('hosted')).resolves.toEqual({
      authorizationUrl: 'https://auth.example/authorize?state=expected',
      state: 'expected'
    })
    expect(provider.invalidateCredentials).toHaveBeenCalledWith('tokens')
    expect(snapshots).toEqual([
      { serverId: 'hosted', status: 'authorizing' },
      { serverId: 'hosted', status: 'authorization-required' }
    ])
  })

  it('validates callback state, exchanges the code, and reconnects', async () => {
    authMocks.auth.mockResolvedValueOnce('AUTHORIZED')
    const mgr = new McpManager()
    const { provider, state } = seedHostedServer(mgr)
    vi.spyOn(mgr as any, 'connectServer').mockImplementation(async () => {
      state.status = 'connected'
    })

    await mgr.completeHostedAuthorization('hosted', { code: 'code-1', state: 'expected' })
    expect(provider.validateCallbackState).toHaveBeenCalledWith('expected')
    expect(authMocks.auth).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ serverUrl: 'https://mcp.example/mcp', authorizationCode: 'code-1' })
    )
    expect(mgr.getAuthStatus('hosted')).toEqual({ serverId: 'hosted', status: 'connected' })
  })

  it('redacts credential-shaped auth errors before status events', () => {
    expect(
      redactMcpAuthError(
        'Bearer secret-token https://auth.example/cb?code=abc&refresh_token=refresh&client_secret=shh'
      )
    ).toBe(
      'Bearer [REDACTED] https://auth.example/cb?code=[REDACTED]&refresh_token=[REDACTED]&client_secret=[REDACTED]'
    )
  })
})
