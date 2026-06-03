import { describe, it, expect, vi } from 'vitest'

// browser-manager imports electron's BrowserWindow / WebContentsView at module
// load time. We only test the pure `coerceUrl` here; mock electron with
// minimal shims so the module loads in the node env.
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  WebContentsView: class {}
}))

import { coerceUrl } from './browser-manager'

describe('coerceUrl', () => {
  it('returns about:blank for empty input', () => {
    expect(coerceUrl('')).toBe('about:blank')
    expect(coerceUrl('   ')).toBe('about:blank')
  })

  it('passes through http and https unchanged', () => {
    expect(coerceUrl('http://example.com')).toBe('http://example.com')
    expect(coerceUrl('https://example.com/foo?bar=baz')).toBe(
      'https://example.com/foo?bar=baz'
    )
  })

  it('passes through about: targets unchanged', () => {
    expect(coerceUrl('about:blank')).toBe('about:blank')
    expect(coerceUrl('about:settings')).toBe('about:settings')
  })

  it('SEC-8: refuses file: scheme (returns about:blank, never the literal)', () => {
    expect(coerceUrl('file:///etc/passwd')).toBe('about:blank')
    expect(coerceUrl('FILE:///c:/Windows/System32/drivers/etc/hosts')).toBe(
      'about:blank'
    )
    expect(coerceUrl('file:///')).toBe('about:blank')
  })

  it('refuses other dangerous schemes', () => {
    expect(coerceUrl('javascript:alert(1)')).toBe('about:blank')
    expect(coerceUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank')
    expect(coerceUrl('view-source:http://example.com')).toBe('about:blank')
    expect(coerceUrl('chrome://settings')).toBe('about:blank')
    expect(coerceUrl('chrome-extension://abc/index.html')).toBe('about:blank')
  })

  it('upgrades bare domain-shaped input to https://', () => {
    expect(coerceUrl('example.com')).toBe('https://example.com')
    expect(coerceUrl('docs.example.com/path')).toBe('https://docs.example.com/path')
  })

  it('falls back to a Google search for arbitrary text', () => {
    const out = coerceUrl('how to fix my code')
    expect(out.startsWith('https://www.google.com/search?q=')).toBe(true)
    expect(out).toContain('how%20to%20fix%20my%20code')
  })

  it('does not turn a file: literal into a Google search (which would echo the path back)', () => {
    // Without the explicit FORBIDDEN_SCHEMES short-circuit, the old code
    // would coerce `file:///etc/passwd` to a Google search of the literal
    // path. The current code returns about:blank so the model can't even
    // see the path bounce back through the search engine.
    const out = coerceUrl('file:///etc/passwd')
    expect(out).not.toContain('etc/passwd')
    expect(out).not.toContain('google')
  })
})
