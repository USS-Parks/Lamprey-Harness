import { describe, expect, it } from 'vitest'
import {
  CONNECTION_REFUSED_HINT,
  describeProviderProbeFailure,
  isConnectionRefusedError
} from './connection-error'

describe('TL-C3 connection refused copy', () => {
  it('detects ECONNREFUSED on the error and its cause', () => {
    const nested = { message: 'Connection error.', cause: { code: 'ECONNREFUSED' } }
    expect(isConnectionRefusedError(nested)).toBe(true)
    expect(describeProviderProbeFailure(nested, 'fallback')).toBe(CONNECTION_REFUSED_HINT)
    expect(
      describeProviderProbeFailure(
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
          code: 'ECONNREFUSED'
        }),
        'fallback'
      )
    ).toBe(CONNECTION_REFUSED_HINT)
  })

  it('leaves non-socket errors as the original message', () => {
    expect(describeProviderProbeFailure(new Error('HTTP 500'), 'fallback')).toBe('HTTP 500')
    expect(isConnectionRefusedError({ status: 401, message: 'Unauthorized' })).toBe(false)
  })
})
