import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => {
      throw new Error('electron app not available in test environment')
    }
  }
}))

import { withWriteRetry } from './database'

// Persistence Phase / PS3 — withWriteRetry tests.
//
// We don't need a real SQLite handle here — the helper's contract is
// pure: invoke fn, catch only SQLITE_BUSY, retry with exponential
// backoff up to maxRetries times. Synthetic errors verify each branch.

function busyError(): Error {
  const err = new Error('database is locked') as Error & { code?: string }
  err.code = 'SQLITE_BUSY'
  return err
}

function otherError(): Error {
  const err = new Error('constraint violated') as Error & { code?: string }
  err.code = 'SQLITE_CONSTRAINT'
  return err
}

describe('withWriteRetry (PS3)', () => {
  it('returns the inner result when fn succeeds first try', () => {
    let calls = 0
    const result = withWriteRetry(
      () => {
        calls++
        return 42
      },
      { label: 'test:first-try' }
    )
    expect(result).toBe(42)
    expect(calls).toBe(1)
  })

  it('retries on SQLITE_BUSY and returns the eventual success value', () => {
    let calls = 0
    const result = withWriteRetry(
      () => {
        calls++
        if (calls < 3) throw busyError()
        return 'ok'
      },
      { maxRetries: 3, baseDelayMs: 1, label: 'test:retry-3' }
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('exhausts retries and rethrows the last SQLITE_BUSY', () => {
    let calls = 0
    expect(() =>
      withWriteRetry(
        () => {
          calls++
          throw busyError()
        },
        { maxRetries: 2, baseDelayMs: 1, label: 'test:exhaust' }
      )
    ).toThrowError(/database is locked/)
    // 1 initial + 2 retries = 3 calls.
    expect(calls).toBe(3)
  })

  it('does NOT retry on non-busy errors', () => {
    let calls = 0
    expect(() =>
      withWriteRetry(
        () => {
          calls++
          throw otherError()
        },
        { maxRetries: 5, baseDelayMs: 1, label: 'test:other' }
      )
    ).toThrowError(/constraint violated/)
    expect(calls).toBe(1)
  })

  it('matches SQLITE_BUSY by message string when code is absent', () => {
    let calls = 0
    const result = withWriteRetry(
      () => {
        calls++
        if (calls === 1) {
          // Some better-sqlite3 paths don't tag .code; the message carries
          // the SQLITE_BUSY token instead. The helper must catch both.
          throw new Error('SQLITE_BUSY: database is locked')
        }
        return 'success-via-msg'
      },
      { maxRetries: 2, baseDelayMs: 1, label: 'test:msg-match' }
    )
    expect(result).toBe('success-via-msg')
    expect(calls).toBe(2)
  })

  it('honors custom maxRetries=0 (no retry, immediate rethrow)', () => {
    let calls = 0
    expect(() =>
      withWriteRetry(
        () => {
          calls++
          throw busyError()
        },
        { maxRetries: 0, baseDelayMs: 1, label: 'test:no-retry' }
      )
    ).toThrow()
    expect(calls).toBe(1)
  })
})
