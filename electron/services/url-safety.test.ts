import { describe, it, expect } from 'vitest'
import {
  assertPublicUrl,
  classifyIPv4,
  classifyIPv6,
  safeFetch,
  UnsafeUrlError,
  type LookupFn
} from './url-safety'

const publicLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }]

describe('classifyIPv4', () => {
  it('rejects 127.0.0.0/8 (loopback)', () => {
    expect(classifyIPv4('127.0.0.1')).toEqual({ private: true, reason: 'loopback' })
    expect(classifyIPv4('127.255.255.254')).toEqual({ private: true, reason: 'loopback' })
  })

  it('rejects 169.254.0.0/16 including the cloud metadata address', () => {
    const cloud = classifyIPv4('169.254.169.254')
    expect(cloud.private).toBe(true)
    if (cloud.private) {
      expect(cloud.reason).toContain('link-local')
      expect(cloud.reason).toContain('169.254.169.254')
    }
    expect(classifyIPv4('169.254.0.1')).toEqual(
      expect.objectContaining({ private: true })
    )
  })

  it('rejects RFC1918 ranges in full', () => {
    expect(classifyIPv4('10.0.0.1')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv4('10.255.255.254')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv4('172.16.0.1')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv4('172.31.255.254')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv4('192.168.1.1')).toEqual(expect.objectContaining({ private: true }))
  })

  it('treats 172.32.0.1 (just past RFC1918) as public', () => {
    expect(classifyIPv4('172.32.0.1')).toEqual({ private: false })
  })

  it('rejects 0.0.0.0/8 (unspecified)', () => {
    expect(classifyIPv4('0.0.0.0')).toEqual(expect.objectContaining({ private: true }))
  })

  it('rejects 100.64.0.0/10 (carrier-grade NAT)', () => {
    expect(classifyIPv4('100.64.0.1')).toEqual(expect.objectContaining({ private: true }))
  })

  it('treats well-known public IPs as public', () => {
    expect(classifyIPv4('1.1.1.1')).toEqual({ private: false })
    expect(classifyIPv4('8.8.8.8')).toEqual({ private: false })
    expect(classifyIPv4('93.184.216.34')).toEqual({ private: false })
  })

  it('returns public for a malformed v4 literal (caller must validate parseability)', () => {
    // classifyIPv4 is a low-level check; the higher-level assertPublicUrl
    // path uses net.isIP first to make sure the input is actually a literal.
    expect(classifyIPv4('not-an-ip')).toEqual({ private: false })
  })
})

describe('classifyIPv6', () => {
  it('rejects ::1 (loopback) in both canonical and expanded forms', () => {
    expect(classifyIPv6('::1')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv6('0:0:0:0:0:0:0:1')).toEqual(expect.objectContaining({ private: true }))
  })

  it('rejects link-local fe80::/10', () => {
    expect(classifyIPv6('fe80::1')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv6('febf::abc')).toEqual(expect.objectContaining({ private: true }))
  })

  it('rejects unique-local fc00::/7', () => {
    expect(classifyIPv6('fc00::1')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv6('fd99::1')).toEqual(expect.objectContaining({ private: true }))
  })

  it('rejects IPv4-mapped IPv6 with a private payload', () => {
    expect(classifyIPv6('::ffff:127.0.0.1')).toEqual(expect.objectContaining({ private: true }))
    expect(classifyIPv6('::ffff:169.254.169.254')).toEqual(
      expect.objectContaining({ private: true })
    )
  })

  it('accepts public unicast addresses', () => {
    expect(classifyIPv6('2001:4860:4860::8888')).toEqual({ private: false })
  })
})

describe('assertPublicUrl — scheme + parse', () => {
  it('rejects an unparseable URL', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicUrl('ftp://example.com/foo')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicUrl('javascript:alert(1)')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicUrl('gopher://example.com')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('accepts http and https', async () => {
    const u1 = await assertPublicUrl('http://example.com/foo', { lookup: publicLookup })
    expect(u1.protocol).toBe('http:')
    const u2 = await assertPublicUrl('https://example.com/foo', { lookup: publicLookup })
    expect(u2.protocol).toBe('https:')
  })
})

describe('assertPublicUrl — IP literals', () => {
  it('rejects loopback literals', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicUrl('http://[::1]/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('rejects the cloud metadata address (169.254.169.254) explicitly', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /169\.254\.169\.254/
    )
  })

  it('rejects RFC1918 literals', async () => {
    await expect(assertPublicUrl('http://10.0.0.1/')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicUrl('http://192.168.1.1/')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicUrl('http://172.20.0.1/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('rejects 0.0.0.0', async () => {
    await expect(assertPublicUrl('http://0.0.0.0/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('rejects IPv6 ULA / link-local literals', async () => {
    await expect(assertPublicUrl('http://[fc00::1]/')).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(assertPublicUrl('http://[fe80::1]/')).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('rejects IPv4-mapped IPv6 pointing at loopback', async () => {
    await expect(assertPublicUrl('http://[::ffff:127.0.0.1]/')).rejects.toBeInstanceOf(
      UnsafeUrlError
    )
  })

  it('accepts a public v4 literal', async () => {
    const u = await assertPublicUrl('https://1.1.1.1/')
    expect(u.hostname).toBe('1.1.1.1')
  })

  it('accepts a public v6 literal', async () => {
    // Node's URL parser keeps the brackets in `hostname` for IPv6 literals;
    // assertPublicUrl strips them only for the isIP check, so the returned
    // URL is unchanged. We just confirm acceptance via the resolved scheme.
    const u = await assertPublicUrl('https://[2001:4860:4860::8888]/')
    expect(u.protocol).toBe('https:')
    expect(u.hostname).toBe('[2001:4860:4860::8888]')
  })
})

describe('assertPublicUrl — DNS resolution', () => {
  it('accepts a hostname that resolves to a public IP', async () => {
    const lookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }]
    const u = await assertPublicUrl('https://example.com/x', { lookup })
    expect(u.hostname).toBe('example.com')
  })

  it('rejects a hostname that resolves to a loopback', async () => {
    const lookup: LookupFn = async () => [{ address: '127.0.0.1', family: 4 }]
    await expect(
      assertPublicUrl('https://rebind.example/', { lookup })
    ).rejects.toThrow(/127\.0\.0\.1/)
  })

  it('rejects when ANY resolved address is private (multi-record split horizon)', async () => {
    const lookup: LookupFn = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 }
    ]
    await expect(
      assertPublicUrl('https://mixed.example/', { lookup })
    ).rejects.toThrow(/10\.0\.0\.5/)
  })

  it('rejects when DNS returns no records', async () => {
    const lookup: LookupFn = async () => []
    await expect(
      assertPublicUrl('https://nx.example/', { lookup })
    ).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('surfaces a DNS lookup error as UnsafeUrlError', async () => {
    const lookup: LookupFn = async () => {
      throw new Error('NXDOMAIN')
    }
    await expect(
      assertPublicUrl('https://broken.example/', { lookup })
    ).rejects.toThrow(/DNS lookup failed/)
  })

  it('accepts a v6 host record', async () => {
    const lookup: LookupFn = async () => [
      { address: '2001:4860:4860::8888', family: 6 }
    ]
    const u = await assertPublicUrl('https://v6.example/', { lookup })
    expect(u.protocol).toBe('https:')
  })

  it('rejects a v6 host record pointing at fc00::/7', async () => {
    const lookup: LookupFn = async () => [{ address: 'fc00::1', family: 6 }]
    await expect(
      assertPublicUrl('https://ula.example/', { lookup })
    ).rejects.toThrow(/fc00/)
  })
})

describe('safeFetch — redirect handling', () => {
  it('returns a 2xx response unchanged', async () => {
    const fetchImpl = async (): Promise<Response> => new Response('ok', { status: 200 })
    const res = await safeFetch('https://example.com/', undefined, {
      lookup: publicLookup,
      fetchImpl
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('follows a redirect to a public URL', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url))
      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://target.example/landing' }
        })
      }
      return new Response('landed', { status: 200 })
    }
    const res = await safeFetch('https://example.com/', undefined, {
      lookup: publicLookup,
      fetchImpl
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('landed')
    expect(calls).toEqual([
      'https://example.com/',
      'https://target.example/landing'
    ])
  })

  it('rejects a redirect to an internal IP', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' }
      })
    await expect(
      safeFetch('https://example.com/', undefined, {
        lookup: publicLookup,
        fetchImpl
      })
    ).rejects.toThrow(/169\.254\.169\.254/)
  })

  it('rejects a redirect chain that exceeds maxRedirects', async () => {
    let counter = 0
    const fetchImpl = async (): Promise<Response> => {
      counter++
      return new Response(null, {
        status: 302,
        headers: { location: `https://hop-${counter}.example/` }
      })
    }
    await expect(
      safeFetch('https://example.com/', undefined, {
        lookup: publicLookup,
        fetchImpl,
        maxRedirects: 2
      })
    ).rejects.toThrow(/Too many redirects/)
  })

  it('rejects a redirect whose target is a non-http scheme', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(null, {
        status: 302,
        headers: { location: 'file:///etc/passwd' }
      })
    await expect(
      safeFetch('https://example.com/', undefined, {
        lookup: publicLookup,
        fetchImpl
      })
    ).rejects.toBeInstanceOf(UnsafeUrlError)
  })

  it('does not follow a 3xx without a Location header (returns it to the caller)', async () => {
    const fetchImpl = async (): Promise<Response> => new Response(null, { status: 304 })
    const res = await safeFetch('https://example.com/', undefined, {
      lookup: publicLookup,
      fetchImpl
    })
    expect(res.status).toBe(304)
  })

  it('passes through the init.signal and other init fields', async () => {
    const controller = new AbortController()
    let seenSignal: AbortSignal | undefined | null
    let seenHeaders: HeadersInit | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      seenSignal = init?.signal
      seenHeaders = init?.headers
      return new Response('ok', { status: 200 })
    }
    await safeFetch(
      'https://example.com/',
      { signal: controller.signal, headers: { 'X-Test': '1' } },
      { lookup: publicLookup, fetchImpl }
    )
    expect(seenSignal).toBe(controller.signal)
    expect(seenHeaders).toEqual({ 'X-Test': '1' })
  })

  it('refuses the initial URL when its host is private (no fetch call made)', async () => {
    let called = false
    const fetchImpl = async (): Promise<Response> => {
      called = true
      return new Response('should not have been fetched', { status: 200 })
    }
    await expect(
      safeFetch('http://127.0.0.1/secret', undefined, {
        lookup: publicLookup,
        fetchImpl
      })
    ).rejects.toBeInstanceOf(UnsafeUrlError)
    expect(called).toBe(false)
  })
})
