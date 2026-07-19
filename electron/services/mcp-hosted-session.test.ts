import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  keys: new Map<string, string>(),
  openExternal: vi.fn(),
  ask: vi.fn(),
  getAskUserRuntime: vi.fn()
}))

vi.mock('electron', () => ({ shell: { openExternal: mocks.openExternal } }))
vi.mock('./keychain', () => ({
  getKey: (name: string) => mocks.keys.get(name) ?? null,
  setKey: (name: string, value: string) => mocks.keys.set(name, value),
  deleteKey: (name: string) => mocks.keys.delete(name)
}))
vi.mock('./ask-user-runtime', () => ({ getAskUserRuntime: mocks.getAskUserRuntime }))

import {
  MCP_OAUTH_CALLBACK_URL,
  McpHostedOAuthProvider,
  requestMcpUrlElicitationConsent
} from './mcp-hosted-session'

beforeEach(() => {
  mocks.keys.clear()
  vi.clearAllMocks()
  mocks.getAskUserRuntime.mockReturnValue({ ask: mocks.ask })
})

describe('MR-3 hosted MCP OAuth provider', () => {
  it('uses a loopback callback and public-client authorization-code metadata', () => {
    const provider = new McpHostedOAuthProvider('hosted')
    expect(provider.redirectUrl).toBe(MCP_OAUTH_CALLBACK_URL)
    expect(provider.clientMetadata).toMatchObject({
      client_name: 'Lamprey Harness',
      redirect_uris: [MCP_OAUTH_CALLBACK_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  })

  it('stores client registration, PKCE verifier, and tokens only through keychain keys', () => {
    const provider = new McpHostedOAuthProvider('hosted')
    provider.saveClientInformation({ client_id: 'client-1', client_secret: 'secret-1' })
    provider.saveCodeVerifier('verifier-1')
    provider.saveTokens({
      access_token: 'access-1',
      token_type: 'bearer',
      refresh_token: 'refresh-1',
      expires_in: 60
    })

    expect(provider.clientInformation()).toMatchObject({ client_id: 'client-1' })
    expect(provider.codeVerifier()).toBe('verifier-1')
    expect(provider.tokens()).toMatchObject({ access_token: 'access-1', refresh_token: 'refresh-1' })
    expect([...mocks.keys.keys()]).toEqual([
      'mcp-oauth:hosted:client',
      'mcp-oauth:hosted:verifier',
      'mcp-oauth:hosted:tokens'
    ])
  })

  it('tracks expiry and removes token material on reauthorization', () => {
    const now = Date.now()
    const provider = new McpHostedOAuthProvider('hosted')
    provider.saveTokens({ access_token: 'access-1', token_type: 'bearer', expires_in: 1 })

    expect(provider.hasTokens()).toBe(true)
    expect(provider.tokensExpired(now)).toBe(false)
    expect(provider.tokensExpired(now + 2_000)).toBe(true)
    provider.invalidateCredentials('tokens')
    expect(provider.hasTokens()).toBe(false)
  })

  it('binds authorization callback state and rejects stale or missing state', () => {
    const provider = new McpHostedOAuthProvider('hosted')
    const state = provider.state()
    provider.redirectToAuthorization(new URL(`https://auth.example/authorize?state=${state}`))
    expect(provider.takeAuthorizationRequest()).toEqual({
      authorizationUrl: `https://auth.example/authorize?state=${state}`,
      state
    })
    expect(() => provider.validateCallbackState('wrong')).toThrow(/state mismatch/)
    provider.validateCallbackState(state)
    expect(() => provider.validateCallbackState(state)).toThrow(/state mismatch/)
  })
})

describe('MR-3 hosted MCP URL elicitation consent', () => {
  it('opens an HTTP(S) URL only after an explicit Open URL answer', async () => {
    mocks.ask.mockResolvedValueOnce({ kind: 'single', label: 'Open URL', header: 'MCP consent' })
    await expect(
      requestMcpUrlElicitationConsent({
        serverId: 'hosted',
        url: 'https://example.com/consent',
        message: 'Finish connecting.'
      })
    ).resolves.toBe('accept')
    expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/consent')
  })

  it('declines without navigation and includes only bounded server context in the ask', async () => {
    mocks.ask.mockResolvedValueOnce({ kind: 'single', label: 'Decline', header: 'MCP consent' })
    const message = 'x'.repeat(1_000)
    await expect(
      requestMcpUrlElicitationConsent({
        serverId: 'hosted',
        url: 'https://example.com/consent',
        message
      })
    ).resolves.toBe('decline')
    expect(mocks.openExternal).not.toHaveBeenCalled()
    expect(mocks.ask.mock.calls[0][0].question.length).toBeLessThan(600)
  })

  it('rejects non-HTTP URLs and cancels when no renderer runtime exists', async () => {
    await expect(
      requestMcpUrlElicitationConsent({
        serverId: 'hosted',
        url: 'file:///secret',
        message: 'Open it.'
      })
    ).resolves.toBe('decline')
    mocks.getAskUserRuntime.mockReturnValueOnce(null)
    await expect(
      requestMcpUrlElicitationConsent({
        serverId: 'hosted',
        url: 'https://example.com',
        message: 'Open it.'
      })
    ).resolves.toBe('cancel')
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })
})
