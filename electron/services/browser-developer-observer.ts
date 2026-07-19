import { attachBrowserDeveloperSession } from './browser-manager'
import {
  browserCdpSessions,
  type BrowserCdpSessionSnapshot,
  type CdpMessageListener
} from './browser-cdp-session'
import { readSettings } from './settings-helper'

const ENTRY_CAP = 500
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 200
const DEFAULT_BODY_BYTES = 16_384
const MAX_BODY_BYTES = 65_536
const MAX_HEADERS = 64
const MAX_HEADER_VALUE = 1_000
const MAX_CONSOLE_TEXT = 8_192

const SENSITIVE_NAME = /(?:authorization|proxy-authorization|cookie|set-cookie|token|api[-_]?key|secret|password|passwd|session|credential)/i
const TEXT_MIME = /^(?:text\/|application\/(?:json|ld\+json|xml|xhtml\+xml|javascript|x-javascript|graphql|x-www-form-urlencoded))/i

export interface BrowserDeveloperCdpAdapter {
  attach(tabId?: string, signal?: AbortSignal): BrowserCdpSessionSnapshot
  subscribe(targetId: string, listener: CdpMessageListener): () => void
  sendCommand(
    targetId: string,
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<unknown>
}

export const browserDeveloperCdpAdapter: BrowserDeveloperCdpAdapter = {
  attach: (tabId, signal) => attachBrowserDeveloperSession(tabId, signal),
  subscribe: (targetId, listener) => browserCdpSessions.subscribe(targetId, listener),
  sendCommand: (targetId, method, params, options) =>
    browserCdpSessions.sendCommand(targetId, method, params, options)
}

export interface BrowserConsoleObservation {
  cursor: string
  targetId: string
  navigationId: number
  at: number
  level: 'log' | 'warning' | 'error' | 'info' | 'debug'
  source: 'console' | 'exception' | 'log'
  text: string
  url?: string
  line?: number
  column?: number
}

export interface BrowserNetworkObservation {
  cursor: string
  targetId: string
  navigationId: number
  at: number
  requestId: string
  url: string
  method: string
  resourceType?: string
  requestHeaders: Record<string, string>
  status?: number
  statusText?: string
  mimeType?: string
  protocol?: string
  responseHeaders?: Record<string, string>
  encodedDataLength?: number
  finishedAt?: number
  failed?: boolean
  cancelled?: boolean
  errorText?: string
}

interface TargetState {
  targetId: string
  navigationId: number
  sequence: number
  console: BrowserConsoleObservation[]
  network: BrowserNetworkObservation[]
  unsubscribe: () => void
}

export interface BrowserObservationPage<T> {
  targetId: string
  navigationId: number
  count: number
  entries: T[]
  nextCursor: string | null
}

export interface ConsoleObservationArgs {
  tab_id?: string
  action?: 'list' | 'clear'
  after_cursor?: string
  limit?: number
  level?: BrowserConsoleObservation['level']
  source?: BrowserConsoleObservation['source']
  text?: string
  navigation_id?: number
}

export interface NetworkObservationArgs {
  tab_id?: string
  action?: 'list' | 'clear'
  after_cursor?: string
  limit?: number
  url?: string
  method?: string
  status_min?: number
  status_max?: number
  mime_type?: string
  navigation_id?: number
}

export interface NetworkBodyArgs {
  request_id: string
  tab_id?: string
  max_bytes?: number
}

function developerModeEnabled(): boolean {
  return readSettings().browserDeveloperModeEnabled === true
}

function clampPageSize(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(value!)))
}

function clampBodyBytes(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BODY_BYTES
  return Math.max(256, Math.min(MAX_BODY_BYTES, Math.floor(value!)))
}

function redactUrl(raw: string): string {
  try {
    const parsed = new URL(raw)
    if (parsed.username) parsed.username = '[REDACTED]'
    if (parsed.password) parsed.password = '[REDACTED]'
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_NAME.test(key)) parsed.searchParams.set(key, '[REDACTED]')
    }
    return parsed.toString()
  } catch {
    return redactSensitiveText(raw)
  }
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(
      /(["']?(?:authorization|cookie|token|api[-_]?key|secret|password|passwd|session|credential)["']?\s*[:=]\s*)(["']?)[^\s,;}&"']+\2/gi,
      '$1[REDACTED]'
    )
}

export function sanitizeHeaders(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const output: Record<string, string> = {}
  for (const [name, rawValue] of Object.entries(input).slice(0, MAX_HEADERS)) {
    const value = String(rawValue ?? '')
    output[name] = SENSITIVE_NAME.test(name)
      ? '[REDACTED]'
      : redactSensitiveText(value).slice(0, MAX_HEADER_VALUE)
  }
  return output
}

function remoteValueText(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '')
  const remote = value as { value?: unknown; description?: unknown; type?: string }
  if (typeof remote.value === 'string') return remote.value
  if (typeof remote.value === 'number' || typeof remote.value === 'boolean') {
    return String(remote.value)
  }
  if (typeof remote.description === 'string') return remote.description
  return remote.type ?? 'value'
}

function cursorSequence(targetId: string, cursor?: string): number {
  if (!cursor) return 0
  const separator = cursor.lastIndexOf(':')
  if (separator < 1 || cursor.slice(0, separator) !== targetId) {
    throw new Error(`Cursor does not belong to browser target ${targetId}`)
  }
  const sequence = Number(cursor.slice(separator + 1))
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('Invalid browser cursor')
  return sequence
}

function page<T extends { cursor: string }>(
  state: TargetState,
  entries: T[],
  afterCursor: string | undefined,
  limitValue: number | undefined
): BrowserObservationPage<T> {
  const after = cursorSequence(state.targetId, afterCursor)
  const limit = clampPageSize(limitValue)
  const remaining = entries.filter((entry) => Number(entry.cursor.slice(entry.cursor.lastIndexOf(':') + 1)) > after)
  const selected = remaining.slice(0, limit)
  return {
    targetId: state.targetId,
    navigationId: state.navigationId,
    count: selected.length,
    entries: selected,
    nextCursor:
      remaining.length > selected.length && selected.length > 0
        ? selected[selected.length - 1]!.cursor
        : null
  }
}

function trim<T>(entries: T[]): void {
  if (entries.length > ENTRY_CAP) entries.splice(0, entries.length - ENTRY_CAP)
}

export class BrowserDeveloperObserver {
  private readonly targets = new Map<string, TargetState>()

  constructor(
    private readonly adapter: BrowserDeveloperCdpAdapter = browserDeveloperCdpAdapter,
    private readonly isEnabled = developerModeEnabled,
    private readonly now = () => Date.now()
  ) {}

  async observeConsole(args: ConsoleObservationArgs = {}, signal?: AbortSignal): Promise<BrowserObservationPage<BrowserConsoleObservation>> {
    const state = await this.ensure(args.tab_id, signal)
    if ((args.action ?? 'list') === 'clear') {
      state.console = []
      return page(state, state.console, undefined, args.limit)
    }
    const needle = args.text?.trim().toLowerCase()
    const filtered = state.console.filter((entry) =>
      (!args.level || entry.level === args.level) &&
      (!args.source || entry.source === args.source) &&
      (args.navigation_id === undefined || entry.navigationId === args.navigation_id) &&
      (!needle || entry.text.toLowerCase().includes(needle))
    )
    return page(state, filtered, args.after_cursor, args.limit)
  }

  async observeNetwork(args: NetworkObservationArgs = {}, signal?: AbortSignal): Promise<BrowserObservationPage<BrowserNetworkObservation>> {
    const state = await this.ensure(args.tab_id, signal)
    if ((args.action ?? 'list') === 'clear') {
      state.network = []
      return page(state, state.network, undefined, args.limit)
    }
    const url = args.url?.trim().toLowerCase()
    const method = args.method?.trim().toUpperCase()
    const mime = args.mime_type?.trim().toLowerCase()
    const filtered = state.network.filter((entry) =>
      (!url || entry.url.toLowerCase().includes(url)) &&
      (!method || entry.method === method) &&
      (args.status_min === undefined || (entry.status ?? 0) >= args.status_min) &&
      (args.status_max === undefined || (entry.status ?? Number.POSITIVE_INFINITY) <= args.status_max) &&
      (!mime || (entry.mimeType ?? '').toLowerCase().includes(mime)) &&
      (args.navigation_id === undefined || entry.navigationId === args.navigation_id)
    )
    return page(state, filtered, args.after_cursor, args.limit)
  }

  async readNetworkBody(args: NetworkBodyArgs, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const requestId = args.request_id?.trim()
    if (!requestId) throw new Error('request_id is required')
    const state = await this.ensure(args.tab_id, signal)
    const observation = state.network.find((entry) => entry.requestId === requestId)
    if (!observation) throw new Error(`Unknown request_id ${requestId} for target ${state.targetId}`)
    const mimeType = observation.mimeType ?? ''
    if (!TEXT_MIME.test(mimeType)) {
      throw new Error(`Response body MIME type is not text-safe: ${mimeType || 'unknown'}`)
    }

    const result = await this.adapter.sendCommand(
      state.targetId,
      'Network.getResponseBody',
      { requestId },
      { signal }
    ) as { body?: unknown; base64Encoded?: unknown }
    const encoded = result?.base64Encoded === true
    const raw = typeof result?.body === 'string' ? result.body : ''
    const decoded = encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw
    const maxBytes = clampBodyBytes(args.max_bytes)
    const bytes = Buffer.byteLength(decoded, 'utf8')
    const bounded = Buffer.from(decoded, 'utf8').subarray(0, maxBytes).toString('utf8')
    return {
      targetId: state.targetId,
      requestId,
      url: observation.url,
      mimeType,
      bytes,
      truncated: bytes > maxBytes,
      body: redactSensitiveText(bounded)
    }
  }

  clearTarget(targetId: string): void {
    const state = this.targets.get(targetId)
    if (!state) return
    state.unsubscribe()
    this.targets.delete(targetId)
  }

  clearAll(): void {
    for (const targetId of [...this.targets.keys()]) this.clearTarget(targetId)
  }

  private async ensure(tabId?: string, signal?: AbortSignal): Promise<TargetState> {
    if (!this.isEnabled()) throw new Error('Browser Developer Mode is disabled')
    const session = this.adapter.attach(tabId, signal)
    const existing = this.targets.get(session.targetId)
    if (existing) return existing

    const state: TargetState = {
      targetId: session.targetId,
      navigationId: 0,
      sequence: 0,
      console: [],
      network: [],
      unsubscribe: () => undefined
    }
    state.unsubscribe = this.adapter.subscribe(session.targetId, (_event, method, params) => {
      this.onMessage(state, method, params)
    })
    this.targets.set(session.targetId, state)
    try {
      await Promise.all([
        this.adapter.sendCommand(session.targetId, 'Page.enable', undefined, { signal }),
        this.adapter.sendCommand(session.targetId, 'Runtime.enable', undefined, { signal }),
        this.adapter.sendCommand(session.targetId, 'Log.enable', undefined, { signal }),
        this.adapter.sendCommand(session.targetId, 'Network.enable', undefined, { signal })
      ])
    } catch (error) {
      this.clearTarget(session.targetId)
      throw error
    }
    return state
  }

  private nextCursor(state: TargetState): string {
    state.sequence += 1
    return `${state.targetId}:${state.sequence}`
  }

  private onMessage(state: TargetState, method: string, rawParams: unknown): void {
    const params = (rawParams ?? {}) as Record<string, any>
    if (method === 'Page.frameNavigated' && !params.frame?.parentId) {
      state.navigationId += 1
      return
    }
    if (method === 'Runtime.consoleAPICalled') {
      const level = params.type === 'warning' ? 'warning' :
        params.type === 'error' || params.type === 'assert' ? 'error' :
        params.type === 'debug' ? 'debug' : params.type === 'info' ? 'info' : 'log'
      const text = Array.isArray(params.args) ? params.args.map(remoteValueText).join(' ') : ''
      this.pushConsole(state, level, 'console', text, params.stackTrace?.callFrames?.[0])
      return
    }
    if (method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails ?? {}
      const text = detail.exception?.description ?? detail.text ?? 'Uncaught exception'
      this.pushConsole(state, 'error', 'exception', text, {
        url: detail.url,
        lineNumber: detail.lineNumber,
        columnNumber: detail.columnNumber
      })
      return
    }
    if (method === 'Log.entryAdded') {
      const entry = params.entry ?? {}
      const level = entry.level === 'warning' || entry.level === 'error' || entry.level === 'info'
        ? entry.level
        : 'log'
      this.pushConsole(state, level, 'log', entry.text ?? '', entry)
      return
    }
    if (method === 'Network.requestWillBeSent') {
      const request = params.request ?? {}
      state.network.push({
        cursor: this.nextCursor(state),
        targetId: state.targetId,
        navigationId: state.navigationId,
        at: this.now(),
        requestId: String(params.requestId ?? ''),
        url: redactUrl(String(request.url ?? '')),
        method: String(request.method ?? 'GET').toUpperCase(),
        resourceType: typeof params.type === 'string' ? params.type : undefined,
        requestHeaders: sanitizeHeaders(request.headers)
      })
      trim(state.network)
      return
    }
    const requestId = String(params.requestId ?? '')
    const existing = state.network.find((entry) => entry.requestId === requestId)
    if (!existing) return
    if (method === 'Network.responseReceived') {
      const response = params.response ?? {}
      existing.status = typeof response.status === 'number' ? response.status : undefined
      existing.statusText = typeof response.statusText === 'string' ? response.statusText : undefined
      existing.mimeType = typeof response.mimeType === 'string' ? response.mimeType : undefined
      existing.protocol = typeof response.protocol === 'string' ? response.protocol : undefined
      existing.responseHeaders = sanitizeHeaders(response.headers)
    } else if (method === 'Network.loadingFinished') {
      existing.finishedAt = this.now()
      existing.encodedDataLength = typeof params.encodedDataLength === 'number'
        ? params.encodedDataLength
        : undefined
    } else if (method === 'Network.loadingFailed') {
      existing.finishedAt = this.now()
      existing.failed = true
      existing.cancelled = params.canceled === true
      existing.errorText = redactSensitiveText(String(params.errorText ?? 'request failed'))
    }
  }

  private pushConsole(
    state: TargetState,
    level: BrowserConsoleObservation['level'],
    source: BrowserConsoleObservation['source'],
    rawText: unknown,
    location?: { url?: unknown; lineNumber?: unknown; columnNumber?: unknown }
  ): void {
    state.console.push({
      cursor: this.nextCursor(state),
      targetId: state.targetId,
      navigationId: state.navigationId,
      at: this.now(),
      level,
      source,
      text: redactSensitiveText(String(rawText ?? '')).slice(0, MAX_CONSOLE_TEXT),
      url: typeof location?.url === 'string' ? redactUrl(location.url) : undefined,
      line: typeof location?.lineNumber === 'number' ? location.lineNumber : undefined,
      column: typeof location?.columnNumber === 'number' ? location.columnNumber : undefined
    })
    trim(state.console)
  }
}

export const browserDeveloperObserver = new BrowserDeveloperObserver()
