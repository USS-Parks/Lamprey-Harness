import { randomUUID } from 'crypto'
import { shell } from 'electron'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { getAskUserRuntime } from './ask-user-runtime'
import * as keychain from './keychain'

export const MCP_OAUTH_CALLBACK_PORT = 9877
export const MCP_OAUTH_CALLBACK_URL = `http://127.0.0.1:${MCP_OAUTH_CALLBACK_PORT}/mcp/oauth/callback`

interface StoredOAuthTokens extends OAuthTokens {
  expiresAt?: number
}

function key(serverId: string, part: string): string {
  return `mcp-oauth:${serverId}:${part}`
}

function readJson<T>(serverId: string, part: string): T | undefined {
  const raw = keychain.getKey(key(serverId, part))
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function writeJson(serverId: string, part: string, value: unknown): void {
  keychain.setKey(key(serverId, part), JSON.stringify(value))
}

export class McpHostedOAuthProvider implements OAuthClientProvider {
  private pendingAuthorizationUrl: URL | null = null
  private expectedState: string | null = null

  constructor(public readonly serverId: string) {}

  get redirectUrl(): string {
    return MCP_OAUTH_CALLBACK_URL
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Lamprey Harness',
      redirect_uris: [MCP_OAUTH_CALLBACK_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    }
  }

  state(): string {
    const state = randomUUID()
    this.expectedState = state
    return state
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return readJson<OAuthClientInformationMixed>(this.serverId, 'client')
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    writeJson(this.serverId, 'client', clientInformation)
  }

  tokens(): OAuthTokens | undefined {
    const stored = readJson<StoredOAuthTokens>(this.serverId, 'tokens')
    if (!stored) return undefined
    const { expiresAt: _expiresAt, ...tokens } = stored
    return tokens
  }

  saveTokens(tokens: OAuthTokens): void {
    const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : undefined
    writeJson(this.serverId, 'tokens', {
      ...tokens,
      ...(expiresIn === undefined ? {} : { expiresAt: Date.now() + expiresIn * 1000 })
    })
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.pendingAuthorizationUrl = new URL(authorizationUrl.toString())
  }

  saveCodeVerifier(codeVerifier: string): void {
    keychain.setKey(key(this.serverId, 'verifier'), codeVerifier)
  }

  codeVerifier(): string {
    const verifier = keychain.getKey(key(this.serverId, 'verifier'))
    if (!verifier) throw new Error(`MCP OAuth verifier is missing for '${this.serverId}'`)
    return verifier
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all' || scope === 'client') keychain.deleteKey(key(this.serverId, 'client'))
    if (scope === 'all' || scope === 'tokens') keychain.deleteKey(key(this.serverId, 'tokens'))
    if (scope === 'all' || scope === 'verifier') keychain.deleteKey(key(this.serverId, 'verifier'))
    if (scope === 'all') {
      this.pendingAuthorizationUrl = null
      this.expectedState = null
    }
  }

  takeAuthorizationRequest(): { authorizationUrl: string; state: string } {
    if (!this.pendingAuthorizationUrl || !this.expectedState) {
      throw new Error(`MCP server '${this.serverId}' did not produce an authorization request`)
    }
    const request = {
      authorizationUrl: this.pendingAuthorizationUrl.toString(),
      state: this.expectedState
    }
    this.pendingAuthorizationUrl = null
    return request
  }

  validateCallbackState(actual: string | null): void {
    if (!actual || !this.expectedState || actual !== this.expectedState) {
      throw new Error('MCP OAuth callback state mismatch')
    }
    this.expectedState = null
  }

  hasTokens(): boolean {
    return readJson<StoredOAuthTokens>(this.serverId, 'tokens') !== undefined
  }

  tokensExpired(now = Date.now()): boolean {
    const stored = readJson<StoredOAuthTokens>(this.serverId, 'tokens')
    return typeof stored?.expiresAt === 'number' && stored.expiresAt <= now
  }
}

export type McpElicitationAction = 'accept' | 'decline' | 'cancel'

export async function requestMcpUrlElicitationConsent(input: {
  serverId: string
  url: string
  message: string
}): Promise<McpElicitationAction> {
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    return 'decline'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'decline'

  const runtime = getAskUserRuntime()
  if (!runtime) return 'cancel'
  const answer = await runtime.ask({
    header: 'MCP consent',
    question: `${input.serverId} wants to open ${url.hostname}. ${input.message.slice(0, 500)}`,
    options: [
      { label: 'Open URL', description: url.toString() },
      { label: 'Decline', description: 'Do not open the external site.' }
    ],
    timeoutMs: 10 * 60_000
  })
  if (answer.kind === 'single' && answer.label === 'Open URL') {
    await shell.openExternal(url.toString())
    return 'accept'
  }
  if (answer.kind === 'single' && answer.label === 'Decline') return 'decline'
  return 'cancel'
}
