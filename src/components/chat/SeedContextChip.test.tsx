import { describe, expect, it } from 'vitest'
import { parseSeedContext } from './SeedContextChip'

describe('parseSeedContext', () => {
  it('parses the sentinel wrapper and attributes', () => {
    const parsed = parseSeedContext(
      '<seed_context source="conv-1" kind="message" from_message_id="msg-1">\nhello\n</seed_context>'
    )

    expect(parsed).toEqual({
      source: 'conv-1',
      kind: 'message',
      fromMessageId: 'msg-1',
      body: 'hello'
    })
  })

  it('returns null for ordinary user text', () => {
    expect(parseSeedContext('hello')).toBeNull()
  })
})
