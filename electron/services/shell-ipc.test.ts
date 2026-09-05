import { describe, expect, it, vi } from 'vitest'
import { openExternalReply, pingReply } from './shell-ipc'

describe('pingReply', () => {
  it('returns the standard success envelope with pong', () => {
    expect(pingReply()).toEqual({ success: true, data: 'pong' })
  })
})

describe('openExternalReply', () => {
  it('opens http(s) URLs and returns success', async () => {
    const open = vi.fn(async () => {})
    expect(await openExternalReply('https://example.com/docs', open)).toEqual({
      success: true,
      data: null
    })
    expect(await openExternalReply('http://localhost:5173', open)).toEqual({
      success: true,
      data: null
    })
    expect(open).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenNthCalledWith(1, 'https://example.com/docs')
    expect(open).toHaveBeenNthCalledWith(2, 'http://localhost:5173')
  })

  it('waits for the OS operation and handles rejection without rejecting IPC', async () => {
    let reject!: (error: Error) => void
    const open = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
    let settled = false
    const reply = openExternalReply('https://example.com', open).then((result) => { settled = true; return result })
    await Promise.resolve()
    expect(settled).toBe(false)
    reject(new Error('No browser is available'))
    expect(await reply).toEqual({ success: false, error: 'No browser is available' })
  })

  it('contains synchronous OS failures too', async () => {
    expect(await openExternalReply('https://example.com', () => { throw new Error('OS unavailable') })).toEqual({ success: false, error: 'OS unavailable' })
  })

  it('rejects non-http(s) without calling open', async () => {
    const open = vi.fn(async () => {})
    const rejected = [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,hi',
      '\\\\attacker\\share',
      'HTTP://example.com',
      '',
      1,
      null,
      undefined
    ]
    for (const url of rejected) {
      expect(await openExternalReply(url, open)).toEqual({
        success: false,
        error: 'URL must start with http:// or https://'
      })
    }
    expect(open).not.toHaveBeenCalled()
  })
})
