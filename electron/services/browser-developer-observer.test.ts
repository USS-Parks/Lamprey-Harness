import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserDeveloperObserver,
  redactSensitiveText,
  sanitizeHeaders,
  type BrowserDeveloperCdpAdapter
} from './browser-developer-observer'
import type { CdpMessageListener } from './browser-cdp-session'

function harness(enabled = true) {
  let listener: CdpMessageListener | null = null
  const sendCommand = vi.fn(async (_targetId: string, method: string) => {
    if (method === 'Network.getResponseBody') {
      return { body: '{"token":"secret-value","ok":true}', base64Encoded: false }
    }
    return {}
  })
  const adapter: BrowserDeveloperCdpAdapter = {
    attach: vi.fn(() => ({
      targetId: 'tab-1', protocolVersion: '1.3', attached: true, reattached: false
    })),
    subscribe: vi.fn((_targetId, next) => {
      listener = next
      return () => { listener = null }
    }),
    sendCommand
  }
  let now = 1_000
  const observer = new BrowserDeveloperObserver(adapter, () => enabled, () => ++now)
  return {
    adapter,
    observer,
    sendCommand,
    emit(method: string, params: unknown) {
      if (!listener) throw new Error('observer is not attached')
      listener({}, method, params)
    }
  }
}

describe('BD-2 BrowserDeveloperObserver', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses every observation path while Developer Mode is disabled', async () => {
    const h = harness(false)
    await expect(h.observer.observeConsole()).rejects.toThrow('Browser Developer Mode is disabled')
    expect(h.adapter.attach).not.toHaveBeenCalled()
  })

  it('enables bounded CDP domains once and paginates redacted console events', async () => {
    const h = harness()
    await h.observer.observeConsole()
    h.emit('Runtime.consoleAPICalled', {
      type: 'log',
      args: [{ value: 'token=plain-secret' }, { value: 'ready' }]
    })
    h.emit('Runtime.exceptionThrown', {
      exceptionDetails: { text: 'Bearer abcdefghijklmnop', url: 'https://x.test/?api_key=nope' }
    })

    const first = await h.observer.observeConsole({ limit: 1 })
    expect(first.entries).toHaveLength(1)
    expect(first.entries[0]?.text).toContain('[REDACTED]')
    expect(first.nextCursor).toBe('tab-1:1')

    const second = await h.observer.observeConsole({ after_cursor: first.nextCursor!, level: 'error' })
    expect(second.entries).toHaveLength(1)
    expect(second.entries[0]?.url).not.toContain('nope')
    expect(h.sendCommand.mock.calls.map((call) => call[1])).toEqual([
      'Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'
    ])

    const cleared = await h.observer.observeConsole({ action: 'clear' })
    expect(cleared.entries).toEqual([])
    expect(h.observer.getStatus('tab-1')).toEqual({
      targetId: 'tab-1', navigationId: 0, consoleCount: 0, networkCount: 0
    })
  })

  it('tracks navigation, filters network metadata, and redacts sensitive headers and URLs', async () => {
    const h = harness()
    await h.observer.observeNetwork()
    h.emit('Page.frameNavigated', { frame: { id: 'main' } })
    h.emit('Network.requestWillBeSent', {
      requestId: 'r1',
      type: 'Fetch',
      request: {
        url: 'https://user:pass@example.test/api?token=secret&safe=yes',
        method: 'post',
        headers: { Authorization: 'Bearer secret', Accept: 'application/json' }
      }
    })
    h.emit('Network.responseReceived', {
      requestId: 'r1',
      response: {
        status: 201,
        statusText: 'Created',
        mimeType: 'application/json',
        protocol: 'h2',
        headers: { 'Set-Cookie': 'session=secret', Server: 'test' }
      }
    })
    h.emit('Network.loadingFinished', { requestId: 'r1', encodedDataLength: 123 })

    const result = await h.observer.observeNetwork({ method: 'POST', status_min: 200, mime_type: 'json' })
    expect(result.navigationId).toBe(1)
    expect(result.entries[0]).toMatchObject({
      requestId: 'r1', method: 'POST', status: 201, mimeType: 'application/json', encodedDataLength: 123
    })
    expect(result.entries[0]?.url).not.toContain('secret')
    expect(result.entries[0]?.requestHeaders.Authorization).toBe('[REDACTED]')
    expect(result.entries[0]?.responseHeaders?.['Set-Cookie']).toBe('[REDACTED]')
    expect(h.observer.getStatus('tab-1')?.networkCount).toBe(1)
    expect(h.observer.clearObservations('tab-1')).toBe(true)
    expect(h.observer.getStatus('tab-1')?.networkCount).toBe(0)
  })

  it('reads only text-safe response bodies, caps output, and redacts secrets', async () => {
    const h = harness()
    await h.observer.observeNetwork()
    h.emit('Network.requestWillBeSent', {
      requestId: 'r1', request: { url: 'https://example.test/data', method: 'GET', headers: {} }
    })
    h.emit('Network.responseReceived', {
      requestId: 'r1', response: { status: 200, mimeType: 'application/json', headers: {} }
    })
    const body = await h.observer.readNetworkBody({ request_id: 'r1', max_bytes: 256 })
    expect(body.body).toContain('[REDACTED]')
    expect(body.body).not.toContain('secret-value')

    h.emit('Network.requestWillBeSent', {
      requestId: 'r2', request: { url: 'https://example.test/image', method: 'GET', headers: {} }
    })
    h.emit('Network.responseReceived', {
      requestId: 'r2', response: { status: 200, mimeType: 'image/png', headers: {} }
    })
    await expect(h.observer.readNetworkBody({ request_id: 'r2' })).rejects.toThrow('not text-safe')
  })

  it('rejects cursors from a different target', async () => {
    const h = harness()
    await expect(h.observer.observeNetwork({ after_cursor: 'tab-2:9' })).rejects.toThrow(
      'does not belong to browser target tab-1'
    )
  })
})

describe('BD-2 redaction helpers', () => {
  it('redacts bearer tokens, credential fields, cookies, and JWTs', () => {
    const input = 'Authorization: Bearer abcdefghijk token=secret eyJabcdefghijk.abcdefghijk.abcdefgh'
    const result = redactSensitiveText(input)
    expect(result).not.toContain('abcdefghijk')
    expect(result).not.toContain('secret')
  })

  it('caps and redacts headers without mutating safe metadata', () => {
    expect(sanitizeHeaders({ Cookie: 'session=nope', Accept: 'application/json' })).toEqual({
      Cookie: '[REDACTED]', Accept: 'application/json'
    })
  })
})
