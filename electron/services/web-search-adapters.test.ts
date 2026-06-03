import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// web-search-adapters reads settings.json + the keychain. We mock the
// adapter dependencies to focus on the SSRF/safeFetch wiring.

const state = vi.hoisted(() => ({
  provider: 'searxng' as 'brave' | 'tavily' | 'serpapi' | 'searxng',
  endpoint: 'http://127.0.0.1:8888',
  hasKeyFor: new Set<string>(['web_search:brave', 'web_search:tavily', 'web_search:serpapi']),
  keyValue: 'test-key-12345'
}))

vi.mock('./settings-helper', () => ({
  readSettings: () => ({
    webTools: { searchProvider: state.provider, searxngEndpoint: state.endpoint }
  })
}))

vi.mock('./keychain', () => ({
  getKey: (provider: string) => (state.hasKeyFor.has(provider) ? state.keyValue : null),
  hasKey: (provider: string) => state.hasKeyFor.has(provider)
}))

import { getWebSearchAdapter } from './web-search-adapters'

describe('web-search-adapters — SEC-2 (safeFetch integration)', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls: string[] = []
  let respondWith: () => Response = () => new Response('{}', { status: 200 })

  beforeEach(() => {
    fetchCalls = []
    // Spy on the global so we can confirm whether the adapter reached the
    // network. safeFetch routes through `fetch`; if the URL is internal
    // safeFetch refuses BEFORE calling it, which is exactly what we assert.
    globalThis.fetch = (async (input: unknown) => {
      fetchCalls.push(String(input))
      return respondWith()
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('SearXNG endpoint pointing at loopback is refused before any network call', async () => {
    state.provider = 'searxng'
    state.endpoint = 'http://127.0.0.1:8888'
    const adapter = getWebSearchAdapter()
    expect(adapter).not.toBeNull()
    await expect(adapter!.search('hello')).rejects.toThrow(/127\.0\.0\.1|loopback|Refused/i)
    expect(fetchCalls).toEqual([])
  })

  it('SearXNG endpoint pointing at the cloud metadata IP is refused', async () => {
    state.provider = 'searxng'
    state.endpoint = 'http://169.254.169.254'
    const adapter = getWebSearchAdapter()
    await expect(adapter!.search('hello')).rejects.toThrow(/169\.254\.169\.254/)
    expect(fetchCalls).toEqual([])
  })

  it('SearXNG endpoint pointing at RFC1918 is refused', async () => {
    state.provider = 'searxng'
    state.endpoint = 'http://10.0.0.1'
    const adapter = getWebSearchAdapter()
    await expect(adapter!.search('hello')).rejects.toThrow(/Refused/i)
    expect(fetchCalls).toEqual([])
  })

  it('SearXNG image search hitting loopback is also refused (proves swap reaches every fetch site)', async () => {
    state.provider = 'searxng'
    state.endpoint = 'http://127.0.0.1'
    const adapter = getWebSearchAdapter()
    expect(adapter?.imageSearch).toBeTruthy()
    await expect(adapter!.imageSearch!('cats')).rejects.toThrow(/Refused/i)
    expect(fetchCalls).toEqual([])
  })

  it('redirect into an internal IP is refused even from a public adapter host', async () => {
    state.provider = 'brave'
    respondWith = () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/' }
      })
    const adapter = getWebSearchAdapter()
    await expect(adapter!.search('hello')).rejects.toThrow(/169\.254\.169\.254/)
    // The first hop ran (against the public Brave host); the redirect is
    // what got refused. Either zero or one network call is acceptable —
    // what matters is that the second call (to the internal IP) never
    // happened.
    expect(fetchCalls.length).toBeLessThanOrEqual(1)
    for (const c of fetchCalls) {
      expect(c).not.toContain('169.254.169.254')
    }
  })
})
