import { app, BrowserWindow } from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { auth, UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import {
  ElicitRequestSchema,
  ElicitationCompleteNotificationSchema,
  McpError,
  ErrorCode,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import * as keychain from './keychain'
import { trace } from './debug-trace'
import {
  McpHostedOAuthProvider,
  requestMcpUrlElicitationConsent
} from './mcp-hosted-session'

// T2 — Per-call MCP timeout. The SDK has built-in `RequestOptions.timeout`
// support (it throws McpError with code RequestTimeout on expiry). We pass
// it on every callTool so a hung remote server (Ahrefs slow query, browser
// MCP waiting on a dead tab, stalled stdio child) can never block the chat
// turn indefinitely. The threshold is read from settings.json each call so
// the user can tune it without a restart.
export class MCPTimeoutError extends Error {
  constructor(public readonly serverId: string, public readonly toolName: string, public readonly timeoutMs: number) {
    super(
      `MCP tool '${serverId}__${toolName}' did not respond within ${Math.round(timeoutMs / 1000)}s — the server is likely stalled or the operation is too slow.`
    )
    this.name = 'MCPTimeoutError'
  }
}

export class MCPRequestTimeoutError extends Error {
  constructor(
    public readonly serverId: string,
    public readonly operation: string,
    public readonly timeoutMs: number
  ) {
    super(
      `MCP request '${operation}' on '${serverId}' did not respond within ${Math.round(timeoutMs / 1000)}s.`
    )
    this.name = 'MCPRequestTimeoutError'
  }
}

export class McpResourceCapabilityError extends Error {
  constructor(public readonly serverId: string) {
    super(`MCP server '${serverId}' does not advertise resource support`)
    this.name = 'McpResourceCapabilityError'
  }
}

export class McpResourceBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpResourceBoundsError'
  }
}

const DEFAULT_MCP_CALL_TIMEOUT_MS = 120_000
const MIN_MCP_CALL_TIMEOUT_MS = 5_000

let mcpCallTimeoutOverrideMs: number | null = null
export function __setMcpCallTimeoutForTesting(ms: number | null): void {
  mcpCallTimeoutOverrideMs = ms
}

function readMcpCallTimeoutMs(): number {
  if (mcpCallTimeoutOverrideMs !== null) return mcpCallTimeoutOverrideMs
  try {
    const path = join(app.getPath('userData'), 'settings.json')
    if (!existsSync(path)) return DEFAULT_MCP_CALL_TIMEOUT_MS
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { mcpCallTimeoutMs?: unknown }
    const ms = raw.mcpCallTimeoutMs
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return DEFAULT_MCP_CALL_TIMEOUT_MS
    if (ms <= 0) return 0 // 0 disables the per-call cap (SDK default still applies)
    return Math.max(MIN_MCP_CALL_TIMEOUT_MS, ms)
  } catch {
    return DEFAULT_MCP_CALL_TIMEOUT_MS
  }
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpResource {
  uri: string
  name: string
  title?: string
  description?: string
  mimeType?: string
  size?: number
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export interface McpResourceTemplate {
  uriTemplate: string
  name: string
  title?: string
  description?: string
  mimeType?: string
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export type McpResourceContent =
  | { uri: string; mimeType?: string; text: string; _meta?: Record<string, unknown> }
  | { uri: string; mimeType?: string; blob: string; _meta?: Record<string, unknown> }

export interface McpResourcePage<T> {
  items: T[]
  nextCursor?: string
}

export interface McpResourceCapabilities {
  supported: boolean
  subscribe: boolean
  listChanged: boolean
}

export type McpResourceChange =
  | { serverId: string; kind: 'list-changed' }
  | { serverId: string; kind: 'resource-updated'; uri: string }

export const MCP_RESOURCE_LIMITS = Object.freeze({
  maxUriBytes: 8_192,
  maxCursorBytes: 4_096,
  maxPageItems: 500,
  maxPageBytes: 512 * 1024,
  maxContentItems: 32,
  maxContentBytes: 4 * 1024 * 1024
})

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function redactMcpAuthError(message: string): string {
  return message
    .replace(/\bBearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:code|access_token|refresh_token|client_secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 1_000)
}

function validateResourceUri(uri: string): string {
  if (typeof uri !== 'string' || uri.length === 0) {
    throw new TypeError('MCP resource URI must be a non-empty string')
  }
  if (Buffer.byteLength(uri, 'utf8') > MCP_RESOURCE_LIMITS.maxUriBytes) {
    throw new McpResourceBoundsError('MCP resource URI exceeds the 8192-byte limit')
  }
  if (uri.trim() !== uri || hasControlCharacters(uri)) {
    throw new TypeError('MCP resource URI contains whitespace or control characters')
  }
  try {
    new URL(uri)
  } catch {
    throw new TypeError(`Invalid MCP resource URI: ${uri}`)
  }
  return uri
}

function validateCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined
  if (!cursor || Buffer.byteLength(cursor, 'utf8') > MCP_RESOURCE_LIMITS.maxCursorBytes) {
    throw new McpResourceBoundsError('MCP cursor must be 1 to 4096 bytes')
  }
  if (hasControlCharacters(cursor)) {
    throw new TypeError('MCP cursor contains control characters')
  }
  return cursor
}

function assertBoundedPage(kind: string, items: unknown[]): void {
  if (items.length > MCP_RESOURCE_LIMITS.maxPageItems) {
    throw new McpResourceBoundsError(
      `MCP ${kind} page returned ${items.length} items; limit is ${MCP_RESOURCE_LIMITS.maxPageItems}`
    )
  }
  const bytes = Buffer.byteLength(JSON.stringify(items), 'utf8')
  if (bytes > MCP_RESOURCE_LIMITS.maxPageBytes) {
    throw new McpResourceBoundsError(
      `MCP ${kind} page returned ${bytes} bytes; limit is ${MCP_RESOURCE_LIMITS.maxPageBytes}`
    )
  }
}

export interface McpServerConfig {
  id: string
  name: string
  transport: 'sse' | 'stdio' | 'streamable-http'
  url?: string
  command?: string
  args?: string[]
  // Optional extra env vars merged on top of `process.env` when launching a
  // stdio server. Used by the bundled Node REPL default server to set
  // ELECTRON_RUN_AS_NODE=1; ignored for SSE transports.
  env?: Record<string, string>
  auth: 'google-oauth' | 'oauth' | 'none'
  enabled: boolean
  /** Customize C11: when registered transiently by the plugin runtime,
   *  the owning plugin id. Plugin-owned servers are NEVER persisted to
   *  mcp-servers.json; they're rebuilt from the plugin's connectors.json
   *  every boot + on every plugin enable/disable. */
  pluginId?: string
}

type ServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type McpAuthStatus =
  | 'not-required'
  | 'signed-out'
  | 'authorization-required'
  | 'authorizing'
  | 'connected'
  | 'expired'
  | 'error'

export interface McpAuthStatusSnapshot {
  serverId: string
  status: McpAuthStatus
  error?: string
}

export interface McpElicitationEvent {
  serverId: string
  elicitationId: string
  status: 'awaiting-consent' | 'accepted' | 'declined' | 'cancelled' | 'completed'
  domain?: string
}

interface ServerState {
  config: McpServerConfig
  status: ServerStatus
  error?: string
  client: Client | null
  transport: SSEClientTransport | StdioClientTransport | StreamableHTTPClientTransport | null
  tools: McpTool[]
  restartCount: number
  authProvider?: McpHostedOAuthProvider
  authStatus?: McpAuthStatus
  authError?: string
}

const MAX_RESTARTS = 3
const RETRY_DELAYS = [1000, 3000, 9000]

function getConfigPath(): string {
  return join(app.getPath('userData'), 'mcp-servers.json')
}

function getDefaultConfigs(): McpServerConfig[] {
  return [
    {
      id: 'gmail',
      name: 'Gmail',
      transport: 'sse',
      url: 'https://gmail.googleapis.com/mcp/sse',
      auth: 'google-oauth',
      enabled: true
    },
    {
      id: 'drive',
      name: 'Google Drive',
      transport: 'sse',
      url: 'https://drive.googleapis.com/mcp/sse',
      auth: 'google-oauth',
      enabled: true
    },
    {
      id: 'chrome',
      name: 'Chrome (Playwright)',
      transport: 'stdio',
      command: 'npx',
      args: ['@anthropic-ai/mcp-server-playwright', '--browser', 'chromium'],
      auth: 'none',
      enabled: true
    }
  ]
}

function loadConfigs(): McpServerConfig[] {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    const defaults = getDefaultConfigs()
    writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8')
    return defaults
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    const defaults = getDefaultConfigs()
    writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8')
    return defaults
  }
}

function saveConfigs(configs: McpServerConfig[]): void {
  writeFileSync(getConfigPath(), JSON.stringify(configs, null, 2), 'utf-8')
}

export class McpManager {
  private servers = new Map<string, ServerState>()
  private statusCallbacks: ((serverId: string, status: ServerStatus, error?: string) => void)[] = []
  private resourceChangeCallbacks = new Set<(change: McpResourceChange) => void>()
  private authStatusCallbacks = new Set<(snapshot: McpAuthStatusSnapshot) => void>()
  private elicitationCallbacks = new Set<(event: McpElicitationEvent) => void>()
  private initialized = false
  // Customize C11: plugin-owned servers live in a separate Map keyed by
  // namespaced id (`<pluginId>:<connectorId>`). They're NEVER persisted
  // to mcp-servers.json — rebuilt from plugin connectors.json on every
  // plugin enable/disable.
  private pluginServers = new Map<string, ServerState>()
  private unsubscribePluginChanges: (() => void) | null = null

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    const configs = loadConfigs()
    for (const config of configs) {
      this.servers.set(config.id, {
        config,
        status: 'disconnected',
        client: null,
        transport: null,
        tools: [],
        restartCount: 0
      })
    }

    for (const [id, state] of this.servers) {
      if (state.config.enabled) {
        this.connectServer(id).catch((err) => {
          console.error(`[mcp] Failed to connect ${id}:`, err.message)
        })
      }
    }

    // Customize C11: subscribe to plugin enable/disable broadcasts so the
    // plugin-owned server set stays in sync. The lazy require avoids a
    // hard module-load order between plugin-loader and mcp-manager.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pl = require('./plugin-loader') as {
        subscribeToPluginChanges: (cb: () => void) => () => void
      }
      this.unsubscribePluginChanges = pl.subscribeToPluginChanges(() =>
        this.refreshPluginConnectors()
      )
      this.refreshPluginConnectors()
    } catch (err) {
      console.error('[mcp] plugin subscription failed:', (err as Error).message)
    }
  }

  /** Customize C11: rebuild the plugin-owned server set from the current
   *  enabled plugins. Disconnects + drops any plugin server that's no
   *  longer enabled; adds any new ones. Persisted servers are untouched. */
  private refreshPluginConnectors(): void {
    let enabledRoots: { pluginId: string; rootPath: string }[]
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pl = require('./plugin-loader') as {
        enabledPluginRoots: () => { pluginId: string; rootPath: string }[]
      }
      enabledRoots = pl.enabledPluginRoots()
    } catch {
      enabledRoots = []
    }

    const desired = new Map<string, McpServerConfig>()
    for (const { pluginId, rootPath } of enabledRoots) {
      const fp = join(rootPath, 'connectors.json')
      if (!existsSync(fp)) continue
      try {
        const parsed = JSON.parse(readFileSync(fp, 'utf-8'))
        if (!Array.isArray(parsed)) continue
        for (const raw of parsed) {
          if (!raw || typeof raw !== 'object') continue
          const obj = raw as Record<string, unknown>
          const innerId = typeof obj.id === 'string' ? obj.id : ''
          if (!innerId) continue
          const namespacedId = `${pluginId}:${innerId}`
          const transport =
            obj.transport === 'stdio' ||
            obj.transport === 'sse' ||
            obj.transport === 'streamable-http'
              ? obj.transport
              : null
          if (!transport) continue
          const cfg: McpServerConfig = {
            id: namespacedId,
            name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : namespacedId,
            transport,
            auth:
              obj.auth === 'google-oauth' || obj.auth === 'oauth' ? obj.auth : 'none',
            enabled: true,
            pluginId
          }
          if (
            (transport === 'sse' || transport === 'streamable-http') &&
            typeof obj.url === 'string'
          ) {
            cfg.url = obj.url
          }
          if (transport === 'stdio' && typeof obj.command === 'string') {
            cfg.command = obj.command
            if (Array.isArray(obj.args)) {
              cfg.args = obj.args.filter((a: unknown): a is string => typeof a === 'string')
            }
            if (obj.env && typeof obj.env === 'object' && !Array.isArray(obj.env)) {
              const env: Record<string, string> = {}
              for (const [k, v] of Object.entries(obj.env as Record<string, unknown>)) {
                if (typeof v === 'string') env[k] = v
              }
              cfg.env = env
            }
          }
          desired.set(namespacedId, cfg)
        }
      } catch (err) {
        console.error('[mcp] failed to read plugin connectors at', fp, err)
      }
    }

    // Disconnect + drop entries no longer present.
    for (const [id, state] of this.pluginServers) {
      if (!desired.has(id)) {
        void this.cleanupServer(state)
        this.pluginServers.delete(id)
      }
    }

    // Add new entries; preserve existing connections.
    for (const [id, cfg] of desired) {
      if (this.pluginServers.has(id)) continue
      const state: ServerState = {
        config: cfg,
        status: 'disconnected',
        client: null,
        transport: null,
        tools: [],
        restartCount: 0
      }
      this.pluginServers.set(id, state)
      // Attempt to connect; surface failures via the status callback.
      this.connectPluginServer(id).catch((err) => {
        console.error(`[mcp] Failed to connect plugin server ${id}:`, err?.message)
      })
    }
  }

  private async connectPluginServer(id: string): Promise<void> {
    const state = this.pluginServers.get(id)
    if (!state) return
    // Reuse the same connect path as persistent servers by temporarily
    // adopting the state into the main Map for the connect call, then
    // popping it back out. Connect mutates state in place — that's fine.
    this.servers.set(id, state)
    try {
      await this.connectServer(id)
    } finally {
      // Whether connect succeeded or not, the state lives in
      // pluginServers as the canonical home. Remove from the main Map
      // so list operations don't double-count.
      this.servers.delete(id)
    }
  }

  getServers(): (McpServerConfig & {
    status: ServerStatus
    error?: string
    authStatus: McpAuthStatus
    authError?: string
  })[] {
    const result: (McpServerConfig & {
      status: ServerStatus
      error?: string
      authStatus: McpAuthStatus
      authError?: string
    })[] = []
    for (const state of this.servers.values()) {
      result.push({
        ...state.config,
        status: state.status,
        error: state.error,
        authStatus: this.resolveAuthStatus(state),
        authError: state.authError
      })
    }
    // Customize C11: append plugin-owned servers. They carry pluginId so
    // the renderer can render a "from plugin: X" badge and lock the
    // remove affordance.
    for (const state of this.pluginServers.values()) {
      result.push({
        ...state.config,
        status: state.status,
        error: state.error,
        authStatus: this.resolveAuthStatus(state),
        authError: state.authError
      })
    }
    return result
  }

  /**
   * Append a server config if no entry with the same id already exists,
   * persist the updated list, register the in-memory state, and (if
   * enabled) start connecting. No-op when an id collision is found, so
   * user edits in mcp-servers.json take precedence over the default. Returns
   * true when the server was newly added.
   */
  async addServerIfMissing(config: McpServerConfig): Promise<boolean> {
    if (this.servers.has(config.id)) return false

    // Persist alongside the user's existing configs so the entry survives
    // restarts and shows up in the settings UI like any other server.
    const existing = loadConfigs()
    if (!existing.some((c) => c.id === config.id)) {
      saveConfigs([...existing, config])
    }

    this.servers.set(config.id, {
      config,
      status: 'disconnected',
      client: null,
      transport: null,
      tools: [],
      restartCount: 0
    })

    if (config.enabled) {
      this.connectServer(config.id).catch((err) => {
        console.error(`[mcp] Failed to connect default server ${config.id}:`, err?.message)
      })
    }

    return true
  }

  /**
   * Self-healing variant for bundled default servers. Owns specific fields
   * (`command`, `args`, `env`) and refreshes them when stale — e.g. when
   * `process.execPath` differs because the user upgraded Electron, or when
   * the bundled server.js moved between dev and packaged paths. Preserves
   * the user's `enabled` flag and `name` so toggling the default off keeps
   * sticking across restarts.
   *
   * Returns 'added' when no entry existed, 'updated' when managed fields
   * changed, 'unchanged' when the existing entry already matched.
   */
  async upsertManagedDefault(
    desired: McpServerConfig
  ): Promise<'added' | 'updated' | 'unchanged'> {
    if (!this.servers.has(desired.id)) {
      await this.addServerIfMissing(desired)
      return 'added'
    }

    const existing = this.servers.get(desired.id)!.config
    const sameCommand = existing.command === desired.command
    const sameArgs = JSON.stringify(existing.args ?? []) === JSON.stringify(desired.args ?? [])
    const sameEnv = JSON.stringify(existing.env ?? {}) === JSON.stringify(desired.env ?? {})
    if (sameCommand && sameArgs && sameEnv) return 'unchanged'

    // Build the refreshed config: managed fields from desired, user fields
    // from existing.
    const refreshed: McpServerConfig = {
      ...existing,
      command: desired.command,
      args: desired.args,
      env: desired.env
    }

    const configs = loadConfigs().map((c) => (c.id === desired.id ? refreshed : c))
    saveConfigs(configs)
    const state = this.servers.get(desired.id)!
    state.config = refreshed
    state.restartCount = 0

    if (refreshed.enabled) {
      // Drop any in-flight stale connection so the next read uses the new
      // command/args.
      void this.cleanupServer(state).then(() => {
        this.connectServer(desired.id).catch((err) => {
          console.error(`[mcp] Reconnect after default refresh failed for ${desired.id}:`, err?.message)
        })
      })
    }

    return 'updated'
  }

  async connect(id: string): Promise<void> {
    return this.connectServer(id)
  }

  async disconnect(id: string): Promise<void> {
    const state = this.servers.get(id)
    if (!state) return

    await this.cleanupServer(state)
    state.status = 'disconnected'
    state.error = undefined
    this.emitStatus(id, 'disconnected')
  }

  async reconnect(id: string): Promise<void> {
    const state = this.servers.get(id)
    if (!state) return

    await this.cleanupServer(state)
    state.restartCount = 0
    await this.connectServer(id)
  }

  listTools(id: string): McpTool[] {
    return this.servers.get(id)?.tools ?? []
  }

  getAllTools(): { serverId: string; tools: McpTool[] }[] {
    const result: { serverId: string; tools: McpTool[] }[] = []
    for (const [id, state] of this.servers) {
      if (state.status === 'connected' && state.tools.length > 0) {
        result.push({ serverId: id, tools: state.tools })
      }
    }
    return result
  }

  getResourceCapabilities(serverId: string): McpResourceCapabilities {
    const state = this.findServer(serverId)
    const resources = state?.client?.getServerCapabilities()?.resources
    return {
      supported: resources !== undefined,
      subscribe: resources?.subscribe === true,
      listChanged: resources?.listChanged === true
    }
  }

  async listResources(
    serverId: string,
    cursor?: string,
    signal?: AbortSignal
  ): Promise<McpResourcePage<McpResource>> {
    const result = await this.runResourceRequest(serverId, 'resources/list', signal, (client, options) =>
      client.listResources(cursor === undefined ? undefined : { cursor: validateCursor(cursor) }, options)
    )
    assertBoundedPage('resource', result.resources)
    for (const resource of result.resources) validateResourceUri(resource.uri)
    return { items: result.resources as McpResource[], nextCursor: result.nextCursor }
  }

  async listResourceTemplates(
    serverId: string,
    cursor?: string,
    signal?: AbortSignal
  ): Promise<McpResourcePage<McpResourceTemplate>> {
    const result = await this.runResourceRequest(
      serverId,
      'resources/templates/list',
      signal,
      (client, options) =>
        client.listResourceTemplates(
          cursor === undefined ? undefined : { cursor: validateCursor(cursor) },
          options
        )
    )
    assertBoundedPage('resource template', result.resourceTemplates)
    return {
      items: result.resourceTemplates as McpResourceTemplate[],
      nextCursor: result.nextCursor
    }
  }

  async readResource(
    serverId: string,
    uri: string,
    signal?: AbortSignal
  ): Promise<McpResourceContent[]> {
    const validatedUri = validateResourceUri(uri)
    const result = await this.runResourceRequest(serverId, 'resources/read', signal, (client, options) =>
      client.readResource({ uri: validatedUri }, options)
    )
    if (result.contents.length > MCP_RESOURCE_LIMITS.maxContentItems) {
      throw new McpResourceBoundsError(
        `MCP resource returned ${result.contents.length} content items; limit is ${MCP_RESOURCE_LIMITS.maxContentItems}`
      )
    }
    for (const content of result.contents) validateResourceUri(content.uri)
    const bytes = Buffer.byteLength(JSON.stringify(result.contents), 'utf8')
    if (bytes > MCP_RESOURCE_LIMITS.maxContentBytes) {
      throw new McpResourceBoundsError(
        `MCP resource returned ${bytes} bytes; limit is ${MCP_RESOURCE_LIMITS.maxContentBytes}`
      )
    }
    return result.contents as McpResourceContent[]
  }

  async subscribeResource(serverId: string, uri: string, signal?: AbortSignal): Promise<void> {
    const capabilities = this.getResourceCapabilities(serverId)
    if (!capabilities.subscribe) {
      throw new McpResourceCapabilityError(serverId)
    }
    await this.runResourceRequest(serverId, 'resources/subscribe', signal, (client, options) =>
      client.subscribeResource({ uri: validateResourceUri(uri) }, options)
    )
  }

  async unsubscribeResource(serverId: string, uri: string, signal?: AbortSignal): Promise<void> {
    const capabilities = this.getResourceCapabilities(serverId)
    if (!capabilities.subscribe) {
      throw new McpResourceCapabilityError(serverId)
    }
    await this.runResourceRequest(serverId, 'resources/unsubscribe', signal, (client, options) =>
      client.unsubscribeResource({ uri: validateResourceUri(uri) }, options)
    )
  }

  onResourceChange(cb: (change: McpResourceChange) => void): () => void {
    this.resourceChangeCallbacks.add(cb)
    return () => this.resourceChangeCallbacks.delete(cb)
  }

  getAuthStatus(serverId: string): McpAuthStatusSnapshot {
    const state = this.findServer(serverId)
    if (!state) throw new Error(`MCP server '${serverId}' not found`)
    return {
      serverId,
      status: this.resolveAuthStatus(state),
      ...(state.authError ? { error: state.authError } : {})
    }
  }

  async beginHostedAuthorization(
    serverId: string
  ): Promise<{ authorizationUrl: string; state: string }> {
    const state = this.requireHostedOAuthState(serverId)
    await this.cleanupServer(state)
    state.status = 'disconnected'
    state.authProvider!.invalidateCredentials('tokens')
    this.setAuthStatus(state, 'authorizing')
    try {
      const result = await auth(state.authProvider!, { serverUrl: state.config.url! })
      if (result !== 'REDIRECT') {
        throw new Error(`MCP server '${serverId}' did not request user authorization`)
      }
      const request = state.authProvider!.takeAuthorizationRequest()
      this.setAuthStatus(state, 'authorization-required')
      return request
    } catch (error) {
      const message = redactMcpAuthError(error instanceof Error ? error.message : String(error))
      this.setAuthStatus(state, 'error', message)
      throw new Error(message, { cause: error })
    }
  }

  async completeHostedAuthorization(
    serverId: string,
    input: { code: string; state: string | null }
  ): Promise<void> {
    const state = this.requireHostedOAuthState(serverId)
    state.authProvider!.validateCallbackState(input.state)
    this.setAuthStatus(state, 'authorizing')
    try {
      const result = await auth(state.authProvider!, {
        serverUrl: state.config.url!,
        authorizationCode: input.code
      })
      if (result !== 'AUTHORIZED') {
        throw new Error(`MCP server '${serverId}' authorization did not complete`)
      }
      await this.connectServer(serverId)
      if (state.status !== 'connected') {
        throw new Error(state.error ?? `MCP server '${serverId}' did not reconnect after authorization`)
      }
    } catch (error) {
      const message = redactMcpAuthError(error instanceof Error ? error.message : String(error))
      this.setAuthStatus(state, 'error', message)
      throw new Error(message, { cause: error })
    }
  }

  onAuthStatusChange(cb: (snapshot: McpAuthStatusSnapshot) => void): () => void {
    this.authStatusCallbacks.add(cb)
    return () => this.authStatusCallbacks.delete(cb)
  }

  onElicitationChange(cb: (event: McpElicitationEvent) => void): () => void {
    this.elicitationCallbacks.add(cb)
    return () => this.elicitationCallbacks.delete(cb)
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const state = this.servers.get(serverId)
    if (!state || !state.client || state.status !== 'connected') {
      throw new Error(`MCP server '${serverId}' is not connected`)
    }

    const timeoutMs = readMcpCallTimeoutMs()
    const traceId = randomUUID().slice(0, 8)
    const startedAt = Date.now()
    trace('mcp.callTool.enter', {
      traceId,
      serverId,
      toolName,
      timeoutMs,
      argsKeys: Object.keys(args ?? {}),
      argsPreview: JSON.stringify(args ?? {}).slice(0, 200)
    })
    let result
    try {
      // 3rd arg `options.timeout`: SDK throws McpError(RequestTimeout) on
      // expiry. 0 disables our per-call cap and falls back to the SDK's
      // built-in default. resetTimeoutOnProgress=true lets a long-running
      // tool keep the connection alive as long as it sends progress notes.
      result = await state.client.callTool(
        { name: toolName, arguments: args },
        undefined,
        timeoutMs > 0
          ? { timeout: timeoutMs, resetTimeoutOnProgress: true }
          : undefined
      )
      trace('mcp.callTool.complete', {
        traceId,
        serverId,
        toolName,
        durationMs: Date.now() - startedAt,
        isError: result?.isError ?? false
      })
    } catch (err: any) {
      const isTimeout = err instanceof McpError && err.code === ErrorCode.RequestTimeout
      trace('mcp.callTool.error', {
        traceId,
        serverId,
        toolName,
        durationMs: Date.now() - startedAt,
        isTimeout,
        errName: err?.name,
        errCode: err instanceof McpError ? err.code : undefined,
        errMessage: String(err?.message ?? err).slice(0, 200)
      })
      if (isTimeout) {
        throw new MCPTimeoutError(serverId, toolName, timeoutMs > 0 ? timeoutMs : 60_000)
      }
      throw err
    }

    if (result.isError) {
      const errorText = Array.isArray(result.content)
        ? result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')
        : String(result.content)
      throw new Error(errorText || 'Tool call failed')
    }

    if (Array.isArray(result.content)) {
      const texts = result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
      return texts.length === 1 ? texts[0] : texts.join('\n')
    }

    return result.content
  }

  onStatusChange(cb: (serverId: string, status: ServerStatus, error?: string) => void): void {
    this.statusCallbacks.push(cb)
  }

  async shutdown(): Promise<void> {
    for (const [, state] of this.servers) {
      await this.cleanupServer(state)
    }
    this.servers.clear()
    this.resourceChangeCallbacks.clear()
    this.authStatusCallbacks.clear()
    this.elicitationCallbacks.clear()
  }

  private findServer(id: string): ServerState | undefined {
    return this.servers.get(id) ?? this.pluginServers.get(id)
  }

  private requireHostedOAuthState(serverId: string): ServerState {
    const state = this.findServer(serverId)
    if (!state) throw new Error(`MCP server '${serverId}' not found`)
    if (state.config.auth !== 'oauth' || !state.config.url) {
      throw new Error(`MCP server '${serverId}' is not configured for hosted OAuth`)
    }
    state.authProvider ??= new McpHostedOAuthProvider(serverId)
    return state
  }

  private resolveAuthStatus(state: ServerState): McpAuthStatus {
    if (state.config.auth === 'none') return 'not-required'
    if (state.status === 'connected') return 'connected'
    if (state.authStatus) return state.authStatus
    if (state.config.auth === 'google-oauth') {
      const token = keychain.getKey('google-access-token')
      if (!token) return 'signed-out'
      const expiry = Number(keychain.getKey('google-token-expiry'))
      return Number.isFinite(expiry) && expiry <= Date.now() ? 'expired' : 'signed-out'
    }
    const provider = state.authProvider ?? new McpHostedOAuthProvider(state.config.id)
    state.authProvider = provider
    if (!provider.hasTokens()) return 'signed-out'
    return provider.tokensExpired() ? 'expired' : 'signed-out'
  }

  private setAuthStatus(state: ServerState, status: McpAuthStatus, error?: string): void {
    const safeError = error ? redactMcpAuthError(error) : undefined
    state.authStatus = status
    state.authError = safeError
    const snapshot: McpAuthStatusSnapshot = {
      serverId: state.config.id,
      status,
      ...(safeError ? { error: safeError } : {})
    }
    for (const callback of this.authStatusCallbacks) {
      try {
        callback(snapshot)
      } catch {
        // An observer cannot break the authentication state machine.
      }
    }
    const mainWindow = BrowserWindow.getAllWindows()[0]
    mainWindow?.webContents.send('mcp:authStatusChanged', snapshot)
  }

  private emitElicitation(event: McpElicitationEvent): void {
    for (const callback of this.elicitationCallbacks) {
      try {
        callback(event)
      } catch {
        // An observer cannot break the elicitation request/response.
      }
    }
    const mainWindow = BrowserWindow.getAllWindows()[0]
    mainWindow?.webContents.send('mcp:elicitationChanged', event)
  }

  private async runResourceRequest<T>(
    serverId: string,
    operation: string,
    signal: AbortSignal | undefined,
    request: (
      client: Client,
      options:
        | { timeout?: number; resetTimeoutOnProgress?: boolean; signal?: AbortSignal }
        | undefined
    ) => Promise<T>
  ): Promise<T> {
    const state = this.findServer(serverId)
    if (!state || !state.client || state.status !== 'connected') {
      throw new Error(`MCP server '${serverId}' is not connected`)
    }
    if (!state.client.getServerCapabilities()?.resources) {
      throw new McpResourceCapabilityError(serverId)
    }
    const timeoutMs = readMcpCallTimeoutMs()
    const options =
      timeoutMs > 0
        ? { timeout: timeoutMs, resetTimeoutOnProgress: true as const, ...(signal ? { signal } : {}) }
        : signal
          ? { signal }
          : undefined
    try {
      return await request(state.client, options)
    } catch (error) {
      if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
        throw new MCPRequestTimeoutError(serverId, operation, timeoutMs > 0 ? timeoutMs : 60_000)
      }
      throw error
    }
  }

  private emitResourceChange(change: McpResourceChange): void {
    for (const callback of this.resourceChangeCallbacks) {
      try {
        callback(change)
      } catch {
        // A subscriber cannot break MCP notification processing.
      }
    }
  }

  private wireResourceNotifications(serverId: string, client: Client): void {
    const capabilities = client.getServerCapabilities()?.resources
    if (capabilities?.listChanged) {
      client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
        this.emitResourceChange({ serverId, kind: 'list-changed' })
      })
    }
    if (capabilities?.subscribe) {
      client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
        this.emitResourceChange({
          serverId,
          kind: 'resource-updated',
          uri: validateResourceUri(notification.params.uri)
        })
      })
    }
  }

  private async connectServer(id: string): Promise<void> {
    const state = this.servers.get(id)
    if (!state) return

    state.status = 'connecting'
    state.error = undefined
    this.emitStatus(id, 'connecting')

    try {
      if (state.config.transport === 'sse') {
        await this.connectSSE(state)
      } else if (state.config.transport === 'streamable-http') {
        await this.connectStreamableHttp(state)
      } else {
        await this.connectStdio(state)
      }
    } catch (err: any) {
      if (err instanceof UnauthorizedError) {
        state.status = 'disconnected'
        state.error = 'Authorization required — reconnect after approving the hosted session.'
        this.setAuthStatus(state, 'authorization-required', state.error)
        this.emitStatus(id, 'disconnected', state.error)
        return
      }
      const message =
        state.config.auth === 'oauth' ? redactMcpAuthError(err.message) : String(err.message)
      state.status = 'error'
      state.error = message
      if (state.config.auth === 'oauth') this.setAuthStatus(state, 'error', message)
      this.emitStatus(id, 'error', message)
      console.error(`[mcp] Connection error for ${id}:`, message)
    }
  }

  private async connectSSE(state: ServerState): Promise<void> {
    if (state.config.auth === 'google-oauth') {
      const accessToken = keychain.getKey('google-access-token')
      if (!accessToken) {
        state.status = 'disconnected'
        state.error = 'Google OAuth not configured'
        this.emitStatus(state.config.id, 'disconnected', state.error)
        return
      }

      const expiryStr = keychain.getKey('google-token-expiry')
      const FIVE_MINUTES = 5 * 60 * 1000
      if (expiryStr && Date.now() + FIVE_MINUTES > parseInt(expiryStr, 10)) {
        const refreshed = await this.refreshGoogleToken()
        if (!refreshed) {
          state.status = 'error'
          state.error = 'Token refresh failed'
          this.emitStatus(state.config.id, 'error', state.error)
          return
        }
      }

      const token = keychain.getKey('google-access-token')!
      const url = new URL(state.config.url!)
      const transport = new SSEClientTransport(url, {
        eventSourceInit: {
          fetch: (input: string | URL | Request, init?: RequestInit) => {
            const headers = new Headers(init?.headers)
            headers.set('Authorization', `Bearer ${token}`)
            return fetch(input, { ...init, headers })
          }
        },
        requestInit: {
          headers: { Authorization: `Bearer ${token}` }
        }
      })

      const client = this.createClient(state)

      transport.onerror = (err) => {
        console.error(`[mcp] SSE error for ${state.config.id}:`, err.message)
        state.status = 'error'
        state.error = err.message
        this.emitStatus(state.config.id, 'error', err.message)
      }

      transport.onclose = () => {
        if (state.status === 'connected') {
          state.status = 'disconnected'
          this.emitStatus(state.config.id, 'disconnected')
        }
      }

      await this.connectWithRetry(state, client, transport)
    } else {
      const url = new URL(state.config.url!)
      const authProvider =
        state.config.auth === 'oauth'
          ? (state.authProvider ??= new McpHostedOAuthProvider(state.config.id))
          : undefined
      const transport = new SSEClientTransport(url, authProvider ? { authProvider } : undefined)
      const client = this.createClient(state)

      transport.onerror = (err) => {
        console.error(`[mcp] SSE error for ${state.config.id}:`, err.message)
        state.status = 'error'
        state.error = err.message
        this.emitStatus(state.config.id, 'error', err.message)
      }

      await this.connectWithRetry(state, client, transport)
    }
  }

  private async connectStreamableHttp(state: ServerState): Promise<void> {
    const authProvider =
      state.config.auth === 'oauth'
        ? (state.authProvider ??= new McpHostedOAuthProvider(state.config.id))
        : undefined
    const transport = new StreamableHTTPClientTransport(new URL(state.config.url!), {
      ...(authProvider ? { authProvider } : {}),
      reconnectionOptions: {
        initialReconnectionDelay: 1_000,
        maxReconnectionDelay: 30_000,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 2
      }
    })
    const client = this.createClient(state)

    transport.onerror = (error) => {
      const safeMessage = redactMcpAuthError(error.message)
      state.status = 'error'
      state.error = safeMessage
      if (state.config.auth === 'oauth' && /401|403|unauthor|forbidden/i.test(safeMessage)) {
        this.setAuthStatus(state, 'expired', 'Hosted MCP session expired; reauthorization required.')
      }
      this.emitStatus(state.config.id, 'error', state.error)
    }
    transport.onclose = () => {
      if (state.status === 'connected') {
        state.status = 'disconnected'
        this.emitStatus(state.config.id, 'disconnected')
      }
    }

    await this.connectWithRetry(state, client, transport)
  }

  private async connectStdio(state: ServerState): Promise<void> {
    const mergedEnv = {
      ...(process.env as Record<string, string>),
      ...(state.config.env ?? {})
    }
    const transport = new StdioClientTransport({
      command: state.config.command!,
      args: state.config.args,
      env: mergedEnv,
      stderr: 'pipe'
    })

    const client = this.createClient(state)

    transport.onerror = (err) => {
      console.error(`[mcp] stdio error for ${state.config.id}:`, err.message)
      if (state.status === 'connected') {
        state.status = 'error'
        state.error = err.message
        this.emitStatus(state.config.id, 'error', err.message)

        if (state.restartCount < MAX_RESTARTS) {
          state.restartCount++
          console.log(`[mcp] Restarting ${state.config.id} (attempt ${state.restartCount}/${MAX_RESTARTS})`)
          this.cleanupServer(state).then(() => this.connectServer(state.config.id))
        }
      }
    }

    transport.onclose = () => {
      if (state.status === 'connected') {
        state.status = 'disconnected'
        this.emitStatus(state.config.id, 'disconnected')

        if (state.restartCount < MAX_RESTARTS) {
          state.restartCount++
          console.log(`[mcp] Restarting ${state.config.id} after close (attempt ${state.restartCount}/${MAX_RESTARTS})`)
          this.connectServer(state.config.id).catch(() => {})
        }
      }
    }

    await this.connectWithRetry(state, client, transport)
  }

  private createClient(state: ServerState): Client {
    const client = new Client(
      { name: 'lamprey', version: '1.0.0' },
      { capabilities: { elicitation: { url: {} } } }
    )
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      if (request.params.mode !== 'url') return { action: 'decline' as const }
      let domain: string | undefined
      try {
        domain = new URL(request.params.url).hostname
      } catch {
        domain = undefined
      }
      const elicitationId = request.params.elicitationId
      this.emitElicitation({
        serverId: state.config.id,
        elicitationId,
        status: 'awaiting-consent',
        ...(domain ? { domain } : {})
      })
      const action = await requestMcpUrlElicitationConsent({
        serverId: state.config.id,
        url: request.params.url,
        message: request.params.message
      })
      this.emitElicitation({
        serverId: state.config.id,
        elicitationId,
        status:
          action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled',
        ...(domain ? { domain } : {})
      })
      return { action }
    })
    client.setNotificationHandler(ElicitationCompleteNotificationSchema, (notification) => {
      this.emitElicitation({
        serverId: state.config.id,
        elicitationId: notification.params.elicitationId,
        status: 'completed'
      })
    })
    return client
  }

  private async connectWithRetry(
    state: ServerState,
    client: Client,
    transport: SSEClientTransport | StdioClientTransport | StreamableHTTPClientTransport
  ): Promise<void> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      try {
        await client.connect(transport)

        this.wireResourceNotifications(state.config.id, client)

        const capabilities = client.getServerCapabilities()
        if (capabilities?.tools) {
          const toolsResult = await client.listTools()
          state.tools = toolsResult.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        } else {
          state.tools = []
        }

        state.client = client
        state.transport = transport
        state.status = 'connected'
        state.error = undefined
        state.restartCount = 0
        if (state.config.auth !== 'none') this.setAuthStatus(state, 'connected')
        this.emitStatus(state.config.id, 'connected')

        console.log(`[mcp] Connected to ${state.config.id} — ${state.tools.length} tools available`)
        return
      } catch (err: any) {
        lastError = err
        if (err instanceof UnauthorizedError) throw err
        console.warn(`[mcp] Connection attempt ${attempt + 1} for ${state.config.id} failed:`, err.message)
        if (attempt < RETRY_DELAYS.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]))
        }
      }
    }

    throw lastError || new Error('Connection failed after retries')
  }

  private async refreshGoogleToken(): Promise<boolean> {
    const refreshToken = keychain.getKey('google-refresh-token')
    const clientId = keychain.getKey('google-client-id')
    const clientSecret = keychain.getKey('google-client-secret')

    if (!refreshToken || !clientId || !clientSecret) {
      console.error('[mcp] Missing Google OAuth credentials for token refresh')
      return false
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      })

      if (!response.ok) {
        console.error('[mcp] Token refresh failed:', response.status)
        return false
      }

      const data = (await response.json()) as { access_token: string; expires_in: number }
      keychain.setKey('google-access-token', data.access_token)
      keychain.setKey('google-token-expiry', String(Date.now() + data.expires_in * 1000))
      return true
    } catch (err: any) {
      console.error('[mcp] Token refresh error:', err.message)
      return false
    }
  }

  private async cleanupServer(state: ServerState): Promise<void> {
    try {
      if (state.transport) {
        await state.transport.close()
      }
    } catch {
      // ignore cleanup errors
    }
    state.client = null
    state.transport = null
    state.tools = []
  }

  private emitStatus(serverId: string, status: ServerStatus, error?: string): void {
    for (const cb of this.statusCallbacks) {
      try {
        cb(serverId, status, error)
      } catch {
        // ignore callback errors
      }
    }

    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.webContents.send('mcp:statusChanged', { serverId, status, error })
    }
  }
}

export const mcpManager = new McpManager()
