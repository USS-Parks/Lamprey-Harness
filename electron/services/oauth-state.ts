import { randomBytes } from 'crypto'

// SEC-9: CSRF protection for the OAuth callback. Without a `state` parameter
// a hostile site that knows the redirect URL (it's hardcoded to
// http://localhost:9876) could trick the user into authorising as a
// different account, then race the legitimate callback. The state token is
// a 192-bit random value the provider echoes back; the callback handler
// rejects any callback whose state doesn't match what was sent.

// 24 bytes → 32-char base64url. Plenty of entropy without bloating the URL.
const STATE_BYTE_LEN = 24

export function generateOAuthState(): string {
  return randomBytes(STATE_BYTE_LEN).toString('base64url')
}

export interface OAuthSession {
  /** The state token to embed in the authorisation URL. */
  readonly state: string
  /**
   * Returns true if `received` matches the session's state AND the session
   * hasn't already been consumed. Single-use by design: a verified state
   * cannot be re-verified, so a slow callback racing a real callback can't
   * replay a stolen state token.
   */
  verify(received: string | null | undefined): boolean
}

/**
 * Decision returned by `validateOAuthCallback`. The three error shapes map
 * directly to HTTP responses + outer-promise rejection reasons in
 * `mcp.ts`'s setupGoogleOAuth handler, so tests can pin the wire-visible
 * behaviour without booting Electron's IPC layer.
 */
export type OAuthCallbackOutcome =
  | { kind: 'success'; code: string }
  | { kind: 'denied'; httpStatus: 200; reason: string }
  | { kind: 'missing-code'; httpStatus: 400; reason: string }
  | { kind: 'state-mismatch'; httpStatus: 400; reason: string }

/**
 * Apply the OAuth callback decision tree to one incoming request URL.
 * Mirrors the wire-visible behaviour of the local http callback in
 * `mcp:setupGoogleOAuth`:
 *
 *   - `?error=...` on the URL  → denied  (browser sees a 200 thank-you
 *     page; outer promise rejects)
 *   - no `code` parameter       → missing-code (browser sees 400)
 *   - `code` present but state
 *     missing / wrong / replayed → state-mismatch (browser sees 400)
 *   - everything checks out     → success (single-use state is consumed)
 *
 * The state check is single-use: a wrong-then-right sequence accepts the
 * right one; a right-then-anything sequence rejects every subsequent call.
 * That semantics belongs to `OAuthSession.verify`; this helper just wires
 * the URL parsing.
 */
export function validateOAuthCallback(
  reqUrl: URL,
  session: OAuthSession
): OAuthCallbackOutcome {
  const error = reqUrl.searchParams.get('error')
  if (error) {
    return { kind: 'denied', httpStatus: 200, reason: error }
  }
  const code = reqUrl.searchParams.get('code')
  if (!code) {
    return { kind: 'missing-code', httpStatus: 400, reason: 'Missing authorization code' }
  }
  const receivedState = reqUrl.searchParams.get('state')
  if (!session.verify(receivedState)) {
    return {
      kind: 'state-mismatch',
      httpStatus: 400,
      reason: 'OAuth state mismatch — possible CSRF attempt or stale callback'
    }
  }
  return { kind: 'success', code }
}

/**
 * Build a single-use OAuth session. `generator` is injected so tests can
 * pin the state value without monkey-patching crypto.
 */
export function createOAuthSession(generator: () => string = generateOAuthState): OAuthSession {
  const state = generator()
  let consumed = false
  return {
    state,
    verify(received): boolean {
      if (consumed) return false
      if (typeof received !== 'string' || received.length === 0) return false
      if (received.length !== state.length) return false
      // Constant-time comparison. The state is 32 chars of random base64url
      // so a timing oracle is unlikely to be useful, but the cost is one
      // tight loop and it removes a class of subtle bugs from the audit
      // trail.
      let diff = 0
      for (let i = 0; i < state.length; i++) {
        diff |= state.charCodeAt(i) ^ received.charCodeAt(i)
      }
      if (diff !== 0) return false
      consumed = true
      return true
    }
  }
}
