import { describe, it, expect } from 'vitest'
import {
  createOAuthSession,
  generateOAuthState,
  validateOAuthCallback
} from './oauth-state'

function callbackUrl(params: Record<string, string>): URL {
  const url = new URL('http://localhost:9876/')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url
}

describe('generateOAuthState', () => {
  it('returns a base64url string of expected length', () => {
    const s = generateOAuthState()
    // 24 random bytes → 32 base64url chars, no padding.
    expect(s.length).toBe(32)
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces distinct values across calls (entropy sanity)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(generateOAuthState())
    expect(seen.size).toBe(100)
  })
})

describe('createOAuthSession.verify', () => {
  it('returns true exactly once for a matching state, then false (single-use)', () => {
    const session = createOAuthSession(() => 'fixed-state-value')
    expect(session.state).toBe('fixed-state-value')
    expect(session.verify('fixed-state-value')).toBe(true)
    expect(session.verify('fixed-state-value')).toBe(false)
  })

  it('returns false for a wrong state', () => {
    const session = createOAuthSession(() => 'fixed-state-value')
    expect(session.verify('something-else-entirely-of-same-length')).toBe(false)
  })

  it('returns false when the received state is missing', () => {
    const session = createOAuthSession(() => 'fixed-state-value')
    expect(session.verify(null)).toBe(false)
    expect(session.verify(undefined)).toBe(false)
    expect(session.verify('')).toBe(false)
  })

  it('returns false on length mismatch (constant-time guard)', () => {
    const session = createOAuthSession(() => 'fixed-state-value')
    // Even though the prefix matches, the length check rejects.
    expect(session.verify('fixed')).toBe(false)
    expect(session.verify('fixed-state-value-extra')).toBe(false)
  })

  it('rejects after first successful verify even if the same state is replayed', () => {
    const session = createOAuthSession(() => 'state-abc-xyz-123456')
    expect(session.verify('state-abc-xyz-123456')).toBe(true)
    // Replay must fail — `verify` consumes the session.
    expect(session.verify('state-abc-xyz-123456')).toBe(false)
  })

  it('rejects after a failed verify if the state is then replayed (state is still single-use)', () => {
    const session = createOAuthSession(() => 'state-abc-xyz-123456')
    // A wrong attempt doesn't consume the session — a legitimate callback
    // following an attacker probe should still succeed exactly once.
    expect(session.verify('wrong-but-same-length!')).toBe(false)
    expect(session.verify('state-abc-xyz-123456')).toBe(true)
    expect(session.verify('state-abc-xyz-123456')).toBe(false)
  })

  it('binds verify to the session instance (two sessions are independent)', () => {
    const a = createOAuthSession(() => 'state-aaaaaaaaaaaa')
    const b = createOAuthSession(() => 'state-bbbbbbbbbbbb')
    expect(a.verify('state-bbbbbbbbbbbb')).toBe(false)
    expect(b.verify('state-aaaaaaaaaaaa')).toBe(false)
    expect(a.verify('state-aaaaaaaaaaaa')).toBe(true)
    expect(b.verify('state-bbbbbbbbbbbb')).toBe(true)
  })

  it('default generator produces a real random state when no generator is injected', () => {
    const a = createOAuthSession()
    const b = createOAuthSession()
    expect(a.state).not.toBe(b.state)
    expect(a.state.length).toBe(32)
  })
})

describe('validateOAuthCallback (IPC integration surface)', () => {
  // These cases pin the decision tree the http callback handler in
  // `electron/ipc/mcp.ts` runs on every request. The mcp handler is a
  // thin switch over the returned `kind`; testing the helper directly
  // covers the wire behaviour without booting the http server.

  it('returns success and consumes the session when state matches', () => {
    const session = createOAuthSession(() => 'fixed-state-value-12345678')
    const url = callbackUrl({ code: 'AUTH-CODE-1', state: 'fixed-state-value-12345678' })
    const outcome = validateOAuthCallback(url, session)
    expect(outcome).toEqual({ kind: 'success', code: 'AUTH-CODE-1' })
    // Session has been consumed; a replay must now fail.
    const replay = validateOAuthCallback(
      callbackUrl({ code: 'AUTH-CODE-1', state: 'fixed-state-value-12345678' }),
      session
    )
    expect(replay.kind).toBe('state-mismatch')
    if (replay.kind === 'state-mismatch') expect(replay.httpStatus).toBe(400)
  })

  it('rejects with state-mismatch when the state param is missing', () => {
    const session = createOAuthSession(() => 'fixed-state-value-12345678')
    const url = callbackUrl({ code: 'AUTH-CODE-1' })
    const outcome = validateOAuthCallback(url, session)
    expect(outcome.kind).toBe('state-mismatch')
    if (outcome.kind === 'state-mismatch') {
      expect(outcome.httpStatus).toBe(400)
      expect(outcome.reason).toMatch(/state/i)
    }
  })

  it('rejects with state-mismatch when the state param is wrong', () => {
    const session = createOAuthSession(() => 'fixed-state-value-12345678')
    const url = callbackUrl({ code: 'AUTH-CODE-1', state: 'totally-wrong-but-same-length' })
    const outcome = validateOAuthCallback(url, session)
    expect(outcome.kind).toBe('state-mismatch')
  })

  it('rejects with state-mismatch when an attacker replays a state token they observed', () => {
    const session = createOAuthSession(() => 'real-state-value-aaaaaaaa')
    // First call (the legitimate one) succeeds.
    const first = validateOAuthCallback(
      callbackUrl({ code: 'legit-code', state: 'real-state-value-aaaaaaaa' }),
      session
    )
    expect(first.kind).toBe('success')
    // Attacker replays the same state — must fail (single-use).
    const replay = validateOAuthCallback(
      callbackUrl({ code: 'attacker-code', state: 'real-state-value-aaaaaaaa' }),
      session
    )
    expect(replay.kind).toBe('state-mismatch')
  })

  it('a wrong-state probe does NOT lock out a subsequent legitimate callback', () => {
    const session = createOAuthSession(() => 'state-aaaaaaaaaaaaaaaaaaaa')
    // Attacker probe with the wrong state first — should not consume the
    // session.
    const probe = validateOAuthCallback(
      callbackUrl({ code: 'probe', state: 'wrong-state-same-length-x' }),
      session
    )
    expect(probe.kind).toBe('state-mismatch')
    // Real callback arrives — must still succeed.
    const real = validateOAuthCallback(
      callbackUrl({ code: 'real-code', state: 'state-aaaaaaaaaaaaaaaaaaaa' }),
      session
    )
    expect(real).toEqual({ kind: 'success', code: 'real-code' })
  })

  it('returns missing-code when no code parameter is present (and no error)', () => {
    const session = createOAuthSession(() => 'fixed-state-value-12345678')
    const url = callbackUrl({ state: 'fixed-state-value-12345678' })
    const outcome = validateOAuthCallback(url, session)
    expect(outcome.kind).toBe('missing-code')
    if (outcome.kind === 'missing-code') expect(outcome.httpStatus).toBe(400)
  })

  it('returns denied (200) when the user declined at the provider', () => {
    const session = createOAuthSession(() => 'fixed-state-value-12345678')
    const url = callbackUrl({ error: 'access_denied' })
    const outcome = validateOAuthCallback(url, session)
    expect(outcome.kind).toBe('denied')
    if (outcome.kind === 'denied') {
      expect(outcome.httpStatus).toBe(200)
      expect(outcome.reason).toBe('access_denied')
    }
  })

  it('denied takes precedence over a present code (provider error wins)', () => {
    const session = createOAuthSession(() => 'fixed-state-value-12345678')
    const url = callbackUrl({
      code: 'AUTH-CODE',
      state: 'fixed-state-value-12345678',
      error: 'consent_required'
    })
    const outcome = validateOAuthCallback(url, session)
    expect(outcome.kind).toBe('denied')
    if (outcome.kind === 'denied') expect(outcome.reason).toBe('consent_required')
  })

  it('does NOT consume the session for non-success outcomes', () => {
    const session = createOAuthSession(() => 'fixed-state-value-12345678')
    // Three failed attempts — each must not consume the state.
    validateOAuthCallback(callbackUrl({ error: 'foo' }), session)
    validateOAuthCallback(callbackUrl({ code: 'a' }), session)
    validateOAuthCallback(
      callbackUrl({ code: 'a', state: 'wrong-state-same-length-x' }),
      session
    )
    // The legitimate callback still works.
    const ok = validateOAuthCallback(
      callbackUrl({ code: 'real', state: 'fixed-state-value-12345678' }),
      session
    )
    expect(ok).toEqual({ kind: 'success', code: 'real' })
  })
})
