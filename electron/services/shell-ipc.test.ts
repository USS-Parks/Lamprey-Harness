import { describe, expect, it, vi } from 'vitest'
import { openExternalReply, pingReply } from './shell-ipc'

describe('pingReply', () => {
  it('returns the standard success envelope with pong', () => {
    expect(pingReply()).toEqual({ success: true, data: 'pong' })
  })
})

describe('openExternalReply', () => {
  it('opens http(s) URLs and returns success', () => {
    const open = vi.fn()
    expect(openExternalReply('https://example.com/docs', open)).toEqual({
      success: true,
      data: null
    })
    expect(openExternalReply('http://localhost:5173', open)).toEqual({
      success: true,
      data: null
    })
    expect(open).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenNthCalledWith(1, 'https://example.com/docs')
    expect(open).toHaveBeenNthCalledWith(2, 'http://localhost:5173')
  })

  it('rejects non-http(s) without calling open', () => {
    const open = vi.fn()
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
      expect(openExternalReply(url, open)).toEqual({
        success: false,
        error: 'URL must start with http:// or https://'
      })
    }
    expect(open).not.toHaveBeenCalled()
  })
})
