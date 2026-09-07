import { describe, expect, it, vi } from 'vitest'
import { onRevealTranscript, revealTranscript, scrollToChapter } from './transcript-reveal'

describe('transcript reveal (UX-34)', () => {
  it('notifies the mounted list so hidden history can open', () => {
    const listener = vi.fn()
    const stop = onRevealTranscript(listener)
    revealTranscript()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    revealTranscript()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reveals immediately when jumping to a chapter', () => {
    const listener = vi.fn()
    const stop = onRevealTranscript(listener)
    scrollToChapter('ch-1')
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })
})
