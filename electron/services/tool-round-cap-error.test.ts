import { describe, it, expect } from 'vitest'
import { isUserAbortError } from './ghost-reply-guard'
import {
  MAX_TOOL_ROUNDS,
  TOOL_ROUND_CAP_MESSAGE,
  ToolRoundCapError
} from './tool-round-cap-error'

describe('AC-1 ToolRoundCapError', () => {
  it('is instanceof Error and ToolRoundCapError', () => {
    const err = new ToolRoundCapError()
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ToolRoundCapError)
    expect(err.name).toBe('ToolRoundCapError')
    expect(err.message).toBe(TOOL_ROUND_CAP_MESSAGE)
  })

  it('is not a user abort, so headless catch settles failed', () => {
    const err = new ToolRoundCapError()
    expect(isUserAbortError(err)).toBe(false)
  })

  it('keeps the 50-round ceiling and the continue advice', () => {
    expect(MAX_TOOL_ROUNDS).toBe(50)
    expect(TOOL_ROUND_CAP_MESSAGE).toContain('50')
    expect(TOOL_ROUND_CAP_MESSAGE).toContain('continue')
    expect(TOOL_ROUND_CAP_MESSAGE).toContain('partial work is saved')
  })
})
