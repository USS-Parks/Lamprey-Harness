import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordCapabilityCheck,
  isDowngraded,
  resetCapabilityTracking,
  __clearForTesting,
  __setCapabilityStateForTesting
} from './capability-tracker'

beforeEach(() => {
  __clearForTesting()
})

describe('recordCapabilityCheck', () => {
  it('returns null when tools were not sent', () => {
    const result = recordCapabilityCheck('conv1', 'model1', false, false, 'some text')
    expect(result).toBeNull()
  })

  it('returns null when tool_calls were returned', () => {
    const result = recordCapabilityCheck('conv1', 'model1', true, true, 'some text')
    expect(result).toBeNull()
  })

  it('returns null for normal answer without tool-like syntax', () => {
    const result = recordCapabilityCheck(
      'conv1',
      'model1',
      true,
      false,
      'Here is the analysis you requested.'
    )
    expect(result).toBeNull()
  })

  it('increments mismatch count on tool-like syntax without tool_calls', () => {
    // First mismatch
    const r1 = recordCapabilityCheck(
      'conv1',
      'model1',
      true,
      false,
      'Let me run that for you:\n<bash>npm test</bash>'
    )
    expect(r1).toBeNull() // Not at threshold yet
    expect(isDowngraded('conv1', 'model1')).toBe(false)

    // Second mismatch
    const r2 = recordCapabilityCheck(
      'conv1',
      'model1',
      true,
      false,
      '<tool>search</tool>'
    )
    expect(r2).toBeNull()

    // Third mismatch → downgrade
    const r3 = recordCapabilityCheck(
      'conv1',
      'model1',
      true,
      false,
      'I will use: <shell>ls</shell>'
    )
    expect(r3).not.toBeNull()
    expect(r3).toContain('Capability mismatch')
    expect(r3).toContain('Downgrading to fallback mode')
    expect(isDowngraded('conv1', 'model1')).toBe(true)
  })

  it('resets mismatch count on a normal answer', () => {
    // Two mismatches
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>test</bash>')
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>test2</bash>')

    // Normal answer resets
    recordCapabilityCheck('conv1', 'model1', true, false, 'Here is the answer.')
    
    // Now start again from 0
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>test3</bash>')
    expect(isDowngraded('conv1', 'model1')).toBe(false)
  })

  it('resets mismatch count when tool_calls are returned', () => {
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>test</bash>')
    recordCapabilityCheck('conv1', 'model1', true, true, 'ran tool successfully')
    
    // Counter reset, not downgraded
    expect(isDowngraded('conv1', 'model1')).toBe(false)
  })

  it('does not count non-tool-like syntax as mismatch', () => {
    recordCapabilityCheck('conv1', 'model1', true, false, 'Regular prose with <angle> brackets')
    recordCapabilityCheck('conv1', 'model1', true, false, 'More regular text')
    recordCapabilityCheck('conv1', 'model1', true, false, 'Yet more text')
    expect(isDowngraded('conv1', 'model1')).toBe(false)
  })

  it('detects JSON action pattern', () => {
    recordCapabilityCheck('conv1', 'model1', true, false, '{"action": "shell_command", "input": {"cmd":"ls"}}')
    recordCapabilityCheck('conv1', 'model1', true, false, '{"action": "web_search", "input": {"query":"test"}}')
    recordCapabilityCheck('conv1', 'model1', true, false, '{"action": "apply_patch", "input": {}}')
    expect(isDowngraded('conv1', 'model1')).toBe(true)
  })

  it('is per-conversation, per-model', () => {
    // Downgrade model1 in conv1
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>a</bash>')
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>b</bash>')
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>c</bash>')

    // Same model, different conversation — not downgraded
    expect(isDowngraded('conv2', 'model1')).toBe(false)

    // Same conversation, different model — not downgraded
    expect(isDowngraded('conv1', 'model2')).toBe(false)
  })

  it('resetCapabilityTracking clears state for a pair', () => {
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>a</bash>')
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>b</bash>')
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>c</bash>')
    expect(isDowngraded('conv1', 'model1')).toBe(true)

    resetCapabilityTracking('conv1', 'model1')
    expect(isDowngraded('conv1', 'model1')).toBe(false)
  })

  it('returns null after downgrade (no repeat warnings)', () => {
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>a</bash>')
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>b</bash>')
    recordCapabilityCheck('conv1', 'model1', true, false, '<bash>c</bash>')
    
    const result = recordCapabilityCheck('conv1', 'model1', true, false, '<bash>d</bash>')
    expect(result).toBeNull()
  })

  it('uses custom threshold', () => {
    // Threshold of 1 — mismatch on first offense
    const result = recordCapabilityCheck(
      'conv1', 'model1', true, false, '<bash>test</bash>', 1
    )
    expect(result).not.toBeNull()
    expect(isDowngraded('conv1', 'model1')).toBe(true)
  })
})
