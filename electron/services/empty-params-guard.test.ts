import { describe, it, expect } from 'vitest'
import { detectEmptyParams } from './empty-params-guard'

describe('detectEmptyParams (Fix C)', () => {
  const required = ['command']

  it('flags empty string as exhaustion when schema has required fields', () => {
    const r = detectEmptyParams('shell_command', '', required)
    expect(r.isEmpty).toBe(true)
    if (r.isEmpty) {
      expect(r.toolName).toBe('shell_command')
      expect(r.requiredFields).toEqual(['command'])
      expect(r.diagnostic).toContain('output token budget')
    }
  })

  it('flags "{}" as exhaustion when schema has required fields', () => {
    const r = detectEmptyParams('apply_patch', '{}', ['patch'])
    expect(r.isEmpty).toBe(true)
    if (r.isEmpty) expect(r.requiredFields).toEqual(['patch'])
  })

  it('flags "null" as exhaustion when schema has required fields', () => {
    const r = detectEmptyParams('shell_command', 'null', required)
    expect(r.isEmpty).toBe(true)
  })

  it('flags undefined raw args as exhaustion', () => {
    const r = detectEmptyParams('shell_command', undefined, required)
    expect(r.isEmpty).toBe(true)
  })

  it('flags null raw args as exhaustion', () => {
    const r = detectEmptyParams('shell_command', null, required)
    expect(r.isEmpty).toBe(true)
  })

  it('passes through when args have content', () => {
    const r = detectEmptyParams('shell_command', '{"command":"echo hi"}', required)
    expect(r.isEmpty).toBe(false)
  })

  it('passes through when schema has no required fields', () => {
    const r = detectEmptyParams('some_tool', '{}', undefined)
    expect(r.isEmpty).toBe(false)
  })

  it('passes through when required array is empty', () => {
    const r = detectEmptyParams('some_tool', '{}', [])
    expect(r.isEmpty).toBe(false)
  })

  it('passes through for whitespace-only args with no required fields', () => {
    const r = detectEmptyParams('optional_tool', '  ', [])
    expect(r.isEmpty).toBe(false)
  })

  it('flags whitespace-only args when schema has required fields', () => {
    const r = detectEmptyParams('shell_command', '   ', required)
    expect(r.isEmpty).toBe(true)
  })
})
