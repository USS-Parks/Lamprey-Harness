import { describe, expect, it, vi } from 'vitest'
import { waitForPaint } from './renderer-paint'

describe('waitForPaint (UX-34)', () => {
  it('resolves after two animation frames when rAF exists', async () => {
    let queued = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued += 1
      queueMicrotask(() => cb(0))
      return queued
    })
    await waitForPaint()
    expect(queued).toBe(2)
    vi.unstubAllGlobals()
  })

  it('resolves immediately when animation frames are unavailable', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    await expect(waitForPaint()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})
