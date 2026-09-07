import { describe, expect, it } from 'vitest'
import {
  hiddenPrefixSpacerPx,
  initialHiddenPrefix,
  nextHiddenPrefix,
  TRANSCRIPT_REVEAL_BATCH,
  TRANSCRIPT_TAIL,
  visibleTranscriptSlice
} from './transcript-window'

describe('transcript window (UX-34)', () => {
  it('keeps short transcripts fully visible', () => {
    expect(initialHiddenPrefix(TRANSCRIPT_TAIL)).toBe(0)
    expect(initialHiddenPrefix(8)).toBe(0)
    expect(visibleTranscriptSlice(['a', 'b'], 0)).toEqual(['a', 'b'])
  })

  it('hides older rows so the destination tail mounts first', () => {
    const count = 1000
    const hidden = initialHiddenPrefix(count)
    expect(hidden).toBe(count - TRANSCRIPT_TAIL)
    const items = Array.from({ length: count }, (_, i) => `m${i}`)
    const visible = visibleTranscriptSlice(items, hidden)
    expect(visible).toHaveLength(TRANSCRIPT_TAIL)
    expect(visible[0]).toBe(`m${hidden}`)
    expect(visible.at(-1)).toBe('m999')
  })

  it('reveals older rows in bounded batches until none remain', () => {
    let hidden = initialHiddenPrefix(1000)
    let steps = 0
    while (hidden > 0) {
      const next = nextHiddenPrefix(hidden)
      expect(next).toBeLessThan(hidden)
      expect(hidden - next).toBeLessThanOrEqual(TRANSCRIPT_REVEAL_BATCH)
      hidden = next
      steps += 1
    }
    expect(hidden).toBe(0)
    expect(steps).toBeGreaterThan(1)
    expect(nextHiddenPrefix(0)).toBe(0)
  })

  it('sizes the prefix spacer from the hidden count only', () => {
    expect(hiddenPrefixSpacerPx(0)).toBe(0)
    expect(hiddenPrefixSpacerPx(10, 72)).toBe(720)
  })
})
