// R6 reasoning-trail tests, extracted from final-response-composer.test.ts
// when UB-5 excised the composer. The trail itself is kept (user-directed
// reasoning audit): multi-round turns persist every round's chain-of-thought.

import { describe, it, expect } from 'vitest'
import { concatReasoningTrail, MAX_REASONING_BYTES } from './reasoning-trail'

describe('concatReasoningTrail (R6, kept through UB-5)', () => {
  it('returns undefined when nothing has reasoning', () => {
    expect(concatReasoningTrail([], undefined)).toBeUndefined()
    expect(concatReasoningTrail(['', '   ', undefined], undefined)).toBeUndefined()
  })

  it('numbers surviving rounds, skipping empty entries before numbering', () => {
    const out = concatReasoningTrail(['first', '', 'third'], undefined)
    expect(out).toContain('--- round 1 ---\nfirst')
    expect(out).toContain('--- round 2 ---\nthird')
    expect(out).not.toContain('--- round 3 ---')
  })

  it('appends the trailing segment last with the historical composer label', () => {
    const out = concatReasoningTrail(['r1'], 'tail')
    expect(out!.endsWith('--- composer ---\ntail')).toBe(true)
  })

  it('single round + no tail keeps just the one numbered block', () => {
    const out = concatReasoningTrail(['only'], undefined)
    expect(out).toBe('--- round 1 ---\nonly')
  })

  it('truncates over-cap trails with the honest marker', () => {
    const big = 'x'.repeat(MAX_REASONING_BYTES)
    const out = concatReasoningTrail([big, big], undefined)!
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_REASONING_BYTES + 64)
    expect(out).toMatch(/\[truncated for length — \d+ kb omitted\]$/)
  })

  // JM-12 (CC-10) — the cap is BYTE-true for multi-byte text. The old char
  // slice kept ~3× the cap for CJK trails and could persist a lone surrogate.
  it('caps CJK trails at the byte limit without splitting codepoints', () => {
    const cjk = '思考中'.repeat(Math.ceil(MAX_REASONING_BYTES / 3)) // 3 bytes/char
    const out = concatReasoningTrail([cjk], undefined)!
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_REASONING_BYTES + 64)
    expect(out).not.toContain('�')
    // Round-trips cleanly — no lone surrogate at the cut point.
    expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out)
    expect(out).toMatch(/\[truncated for length — \d+ kb omitted\]$/)
  })
})
