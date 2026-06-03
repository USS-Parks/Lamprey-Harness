import { describe, expect, it } from 'vitest'
import {
  _clearPageCacheForTest,
  executeTimeLookup,
  executeWebFind,
  executeWebOpen,
  stripHtmlToText
} from './web-tools'

// Pure-helper tests. The network paths (web_search, web_open, image_search)
// are covered by adapter-level mocking in later sessions; this file pins
// the input-validation surface and the HTML→text helper so refactors don't
// silently regress them.

describe('stripHtmlToText', () => {
  it('strips script and style blocks', () => {
    const html = '<html><body>Hello<script>alert(1)</script> there<style>p{color:red}</style></body></html>'
    const text = stripHtmlToText(html)
    expect(text).not.toContain('alert')
    expect(text).not.toContain('color:red')
    expect(text).toContain('Hello')
    expect(text).toContain('there')
  })

  it('decodes common entities', () => {
    const text = stripHtmlToText('<p>Tom &amp; Jerry &lt;3 &quot;love&quot;</p>')
    expect(text).toContain('Tom & Jerry')
    expect(text).toContain('<3')
    expect(text).toContain('"love"')
  })

  it('decodes numeric entities', () => {
    const text = stripHtmlToText('<p>caf&#233; &#x263A;</p>')
    expect(text).toContain('café')
    expect(text).toContain('☺')
  })

  it('preserves paragraph boundaries as newlines', () => {
    const html = '<p>one</p><p>two</p><p>three</p>'
    const text = stripHtmlToText(html)
    const lines = text.split('\n').filter((l) => l.trim() !== '')
    expect(lines).toEqual(['one', 'two', 'three'])
  })

  it('collapses runs of whitespace', () => {
    const text = stripHtmlToText('<p>a    b\t\tc</p>')
    expect(text).toBe('a b c')
  })
})

describe('executeTimeLookup', () => {
  it('returns a UTC string by default', async () => {
    const out = await executeTimeLookup({})
    expect(out).toMatch(/\(UTC\)$/)
  })

  it('honors a known timezone', async () => {
    const out = await executeTimeLookup({ timezone: 'America/Los_Angeles' })
    expect(out).toMatch(/\(America\/Los_Angeles\)$/)
  })

  it('returns a clean error for invalid timezones', async () => {
    const out = await executeTimeLookup({ timezone: 'Not/A_Zone' })
    expect(out.startsWith('Error:')).toBe(true)
  })
})

describe('executeWebFind argument validation', () => {
  it('rejects missing url', async () => {
    const out = await executeWebFind({ url: '', text: 'foo' })
    expect(out.startsWith('Error:')).toBe(true)
  })

  it('rejects missing text', async () => {
    const out = await executeWebFind({ url: 'https://example.com', text: '' })
    expect(out.startsWith('Error:')).toBe(true)
  })
})

describe('executeWebOpen — SSRF gate (integration)', () => {
  // url-safety.test.ts covers the assertPublicUrl / safeFetch matrix in
  // isolation. These cases just confirm the gate is actually wired through
  // executeWebOpen → fetchPageBytes → safeFetch, so a future refactor that
  // bypasses safeFetch trips a test.

  it('refuses a loopback literal before any network call', async () => {
    _clearPageCacheForTest()
    const out = await executeWebOpen({ url: 'http://127.0.0.1/admin' })
    expect(out.startsWith('Error: web_open failed')).toBe(true)
    expect(out).toContain('127.0.0.1')
    expect(out.toLowerCase()).toContain('refused')
  })

  it('refuses the 169.254.169.254 cloud metadata address explicitly', async () => {
    _clearPageCacheForTest()
    const out = await executeWebOpen({
      url: 'http://169.254.169.254/latest/meta-data/'
    })
    expect(out.startsWith('Error: web_open failed')).toBe(true)
    expect(out).toContain('169.254.169.254')
  })

  it('refuses RFC1918 literals', async () => {
    _clearPageCacheForTest()
    const out = await executeWebOpen({ url: 'http://10.0.0.1/' })
    expect(out.toLowerCase()).toContain('refused')
  })

  it('refuses IPv6 loopback in bracketed form', async () => {
    _clearPageCacheForTest()
    const out = await executeWebOpen({ url: 'http://[::1]/' })
    expect(out.toLowerCase()).toContain('refused')
  })

  it('keeps refusing non-http(s) schemes with the existing message', async () => {
    _clearPageCacheForTest()
    const out = await executeWebOpen({ url: 'file:///etc/passwd' })
    expect(out.startsWith('Error:')).toBe(true)
  })
})
