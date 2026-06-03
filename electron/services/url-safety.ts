import { isIP } from 'net'
import { lookup as dnsLookup } from 'dns/promises'

// SSRF gate for any URL the model can influence. Web fetches that follow
// model-supplied URLs go through assertPublicUrl + safeFetch so the network
// stack cannot reach loopback, link-local (incl. the 169.254.169.254 cloud
// metadata service), RFC1918, ULAs, the unspecified address, or non-http(s)
// schemes — even after a 3xx redirect.
//
// Caveat (documented gap, not a bug): there is a TOCTOU window between the
// pre-fetch DNS resolution and the real fetch's resolution — a DNS rebinder
// could return a public address on the first call and a private one on the
// second. The v1 gate locks down the trivial direct cases (the model just
// sends http://127.0.0.1 / http://169.254.169.254); closing the rebind gap
// would require resolving once and then fetching against the locked-in IP
// with a Host header, which is more invasive than this prompt.

export type LookupResult = { address: string; family: 4 | 6 }
export type LookupFn = (host: string) => Promise<LookupResult[]>

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

const DEFAULT_LOOKUP: LookupFn = async (host) => {
  const all = await dnsLookup(host, { all: true })
  return all.map((r) => ({
    address: r.address,
    family: r.family === 6 ? 6 : 4
  }))
}

const PRIVATE_V4_RANGES: ReadonlyArray<{ cidr: string; reason: string }> = [
  { cidr: '127.0.0.0/8', reason: 'loopback' },
  { cidr: '10.0.0.0/8', reason: 'RFC1918 private' },
  { cidr: '172.16.0.0/12', reason: 'RFC1918 private' },
  { cidr: '192.168.0.0/16', reason: 'RFC1918 private' },
  { cidr: '169.254.0.0/16', reason: 'link-local (incl. cloud metadata 169.254.169.254)' },
  { cidr: '0.0.0.0/8', reason: 'unspecified / current network' },
  { cidr: '100.64.0.0/10', reason: 'carrier-grade NAT (shared address space)' }
]

function ip4ToInt(ip: string): number {
  const parts = ip.split('.')
  if (parts.length !== 4) return -1
  let n = 0
  for (const p of parts) {
    const o = Number(p)
    if (!Number.isInteger(o) || o < 0 || o > 255) return -1
    n = (n << 8) | o
  }
  return n >>> 0
}

function inV4Cidr(ip: string, cidr: string): boolean {
  const [netStr, maskStr] = cidr.split('/')
  const ipN = ip4ToInt(ip)
  const netN = ip4ToInt(netStr)
  if (ipN < 0 || netN < 0) return false
  const mask = Number(maskStr)
  if (mask < 0 || mask > 32) return false
  if (mask === 0) return true
  const maskBits = (~0 << (32 - mask)) >>> 0
  return (ipN & maskBits) === (netN & maskBits)
}

export function classifyIPv4(ip: string): { private: true; reason: string } | { private: false } {
  if (ip4ToInt(ip) < 0) return { private: false }
  for (const { cidr, reason } of PRIVATE_V4_RANGES) {
    if (inV4Cidr(ip, cidr)) return { private: true, reason }
  }
  return { private: false }
}

export function classifyIPv6(ip: string): { private: true; reason: string } | { private: false } {
  const lower = ip.toLowerCase()
  // Loopback ::1
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') {
    return { private: true, reason: 'IPv6 loopback' }
  }
  // Unspecified ::
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') {
    return { private: true, reason: 'IPv6 unspecified' }
  }
  // Link-local fe80::/10 (range fe80:: – febf:ffff:...)
  if (/^fe[89ab][0-9a-f]:/.test(lower)) {
    return { private: true, reason: 'IPv6 link-local' }
  }
  // Unique-local fc00::/7 (fc00:: – fdff:ffff:...)
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) {
    return { private: true, reason: 'IPv6 unique-local' }
  }
  // IPv4-mapped IPv6 — two forms reach us here:
  //   * the literal-input form  ::ffff:127.0.0.1
  //   * the normalized hex form Node's URL parser produces, ::ffff:7f00:1
  //     (last two hextets form the 32-bit IPv4 address)
  const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedDotted) {
    const v4 = classifyIPv4(mappedDotted[1])
    if (v4.private) return { private: true, reason: `IPv4-mapped (${v4.reason})` }
  }
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    if (Number.isFinite(hi) && Number.isFinite(lo)) {
      const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
      const v4 = classifyIPv4(dotted)
      if (v4.private) return { private: true, reason: `IPv4-mapped (${v4.reason})` }
    }
  }
  return { private: false }
}

function parseUrlOrThrow(raw: string): URL {
  try {
    return new URL(raw)
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${truncateForError(raw)}`)
  }
}

function truncateForError(s: string): string {
  return s.length > 120 ? s.slice(0, 120) + '…' : s
}

/**
 * Validate that `rawUrl` is safe for the network layer to follow:
 *
 *   - parseable URL with http(s) scheme
 *   - hostname resolves to at least one address, and every resolved address
 *     is a public unicast IP — none of loopback / link-local / RFC1918 /
 *     ULA / unspecified / CGNAT
 *
 * Returns the parsed URL on success; throws `UnsafeUrlError` on failure.
 *
 * `opts.lookup` lets tests inject a fake resolver so the suite does not hit
 * real DNS. Default resolver is `dns/promises lookup({ all: true })`.
 */
export async function assertPublicUrl(
  rawUrl: string,
  opts: { lookup?: LookupFn } = {}
): Promise<URL> {
  const url = parseUrlOrThrow(rawUrl)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Refused URL scheme ${url.protocol}; only http and https are allowed`)
  }

  const host = url.hostname
  if (!host) {
    throw new UnsafeUrlError(`URL has no hostname: ${truncateForError(rawUrl)}`)
  }

  // For IPv6 literals, `URL.hostname` returns the bracketed form (`[::1]`)
  // and `net.isIP` only accepts the bare form. Strip the brackets before
  // the literal check so the rejection path returns the precise reason
  // (loopback / ULA / link-local) rather than falling through to DNS and
  // failing with a generic "DNS lookup failed" message.
  const hostForCheck =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host

  const literalKind = isIP(hostForCheck)
  if (literalKind === 4) {
    const c = classifyIPv4(hostForCheck)
    if (c.private) {
      throw new UnsafeUrlError(`Refused: ${hostForCheck} is ${c.reason}`)
    }
    return url
  }
  if (literalKind === 6) {
    const c = classifyIPv6(hostForCheck)
    if (c.private) {
      throw new UnsafeUrlError(`Refused: ${hostForCheck} is ${c.reason}`)
    }
    return url
  }

  // Hostname — resolve and validate every returned address.
  const lookup = opts.lookup ?? DEFAULT_LOOKUP
  let results: LookupResult[]
  try {
    results = await lookup(host)
  } catch (err) {
    throw new UnsafeUrlError(`DNS lookup failed for ${host}: ${(err as Error).message}`)
  }
  if (!results.length) {
    throw new UnsafeUrlError(`DNS returned no addresses for ${host}`)
  }
  for (const r of results) {
    const c = r.family === 6 ? classifyIPv6(r.address) : classifyIPv4(r.address)
    if (c.private) {
      throw new UnsafeUrlError(`Refused: ${host} resolved to ${r.address} (${c.reason})`)
    }
  }
  return url
}

/**
 * Fetch wrapper that runs `assertPublicUrl` before the initial request and
 * before every redirect hop. Uses `redirect: 'manual'` and walks 3xx chains
 * by hand so a redirect into an internal IP is rejected, not followed.
 *
 * Returns the final `Response`. Bounded by `opts.maxRedirects` (default 5);
 * exceeding it throws `UnsafeUrlError`. Callers keep ownership of any
 * AbortSignal via `init.signal`.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number; lookup?: LookupFn; fetchImpl?: typeof fetch } = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5
  const fetchImpl = opts.fetchImpl ?? fetch
  let current = (await assertPublicUrl(rawUrl, { lookup: opts.lookup })).toString()

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchImpl(current, { ...init, redirect: 'manual' })
    if (res.status < 300 || res.status >= 400) {
      return res
    }
    // 3xx — walk the Location header. Empty Location is an unusual but legal
    // state; surface the response so the caller can decide.
    const loc = res.headers.get('location')
    if (!loc) return res
    if (hop === maxRedirects) {
      throw new UnsafeUrlError(`Too many redirects (>${maxRedirects}) starting at ${rawUrl}`)
    }
    let next: string
    try {
      next = new URL(loc, current).toString()
    } catch {
      throw new UnsafeUrlError(`Invalid redirect target from ${current}: ${truncateForError(loc)}`)
    }
    current = (await assertPublicUrl(next, { lookup: opts.lookup })).toString()
  }
  // Loop body always returns or throws; this is unreachable but the type
  // checker can't prove it.
  throw new UnsafeUrlError(`Too many redirects (>${maxRedirects}) starting at ${rawUrl}`)
}
