import { afterEach, describe, expect, it } from 'vitest'
import { formatMessageTime, resetMessageTimeCache } from './format-message-time'

afterEach(() => {
  resetMessageTimeCache()
})

describe('formatMessageTime (UX-34)', () => {
  it('returns the same string for timestamps in the same minute', () => {
    const a = formatMessageTime(1_700_000_040_000)
    const b = formatMessageTime(1_700_000_040_999)
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('does not treat different minutes as identical', () => {
    const first = formatMessageTime(1_700_000_000_000)
    const later = formatMessageTime(1_700_000_000_000 + 60_000)
    expect(first).not.toBe(later)
  })
})
