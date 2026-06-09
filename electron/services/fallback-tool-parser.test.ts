import { describe, it, expect } from 'vitest'
import { extractBalancedJson, parseFallbackToolCalls, FALLBACK_TOOL_INSTRUCTION } from './fallback-tool-parser'

const shellSchema = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'Command to run' }
  },
  required: ['command'],
  additionalProperties: false
}

const patchSchema = {
  type: 'object',
  properties: {
    patch: { type: 'string', description: 'Patch envelope' }
  },
  required: ['patch'],
  additionalProperties: false
}

const tools = [
  { name: 'shell_command', inputSchema: shellSchema },
  { name: 'apply_patch', inputSchema: patchSchema }
]

describe('extractBalancedJson', () => {
  it('extracts flat JSON object', () => {
    const result = extractBalancedJson('{"action":"shell_command","input":{"command":"ls"}}')
    expect(result).toBe('{"action":"shell_command","input":{"command":"ls"}}')
  })

  it('extracts nested JSON with braces inside strings', () => {
    const result = extractBalancedJson(
      'Some text before {"action":"apply_patch","input":{"patch":"*** Begin Patch\\n{hello}\\n*** End Patch"}} more text'
    )
    expect(result).toContain('"action":"apply_patch"')
    expect(result).toContain('*** Begin Patch')
    expect(result).toContain('*** End Patch')
  })

  it('handles escaped quotes inside strings', () => {
    const result = extractBalancedJson('{"text":"say \\"hello\\""}')
    expect(result).toContain('\\"hello\\"')
  })

  it('returns null when no braces present', () => {
    expect(extractBalancedJson('plain text with no json')).toBeNull()
  })

  it('returns null for unbalanced braces', () => {
    expect(extractBalancedJson('{"action": "test"')).toBeNull()
  })

  it('extracts only the first balanced JSON object', () => {
    const result = extractBalancedJson('{"first":1}{"second":2}')
    expect(result).toBe('{"first":1}')
  })

  it('handles deeply nested braces', () => {
    const result = extractBalancedJson('{"a":{"b":{"c":{"d":"e"}}}}')
    expect(result).toBe('{"a":{"b":{"c":{"d":"e"}}}}')
  })
})

describe('parseFallbackToolCalls', () => {
  it('parses a valid tool call', () => {
    const result = parseFallbackToolCalls(
      '{"action":"shell_command","input":{"command":"ls"}}',
      tools
    )
    expect(result).not.toBeNull()
    expect(result!.calls).toHaveLength(1)
    expect(result!.calls[0].name).toBe('shell_command')
    expect(result!.calls[0].provenance).toBe('fallback')
    expect(result!.calls[0].arguments).toEqual({ command: 'ls' })
    expect(result!.isFinalAnswer).toBe(false)
  })

  it('returns isFinalAnswer for action: final', () => {
    const result = parseFallbackToolCalls(
      '{"action":"final","answer":"All done!"}',
      tools
    )
    expect(result).not.toBeNull()
    expect(result!.calls).toHaveLength(0)
    expect(result!.isFinalAnswer).toBe(true)
  })

  it('returns null for plain prose', () => {
    const result = parseFallbackToolCalls('just some text, no json here', tools)
    expect(result).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    const result = parseFallbackToolCalls('{broken json', tools)
    expect(result).toBeNull()
  })

  it('returns null for unknown tool name', () => {
    const result = parseFallbackToolCalls(
      '{"action":"nonexistent_tool","input":{}}',
      tools
    )
    expect(result).toBeNull()
  })

  it('returns null for missing input', () => {
    const result = parseFallbackToolCalls(
      '{"action":"shell_command"}',
      tools
    )
    expect(result).toBeNull()
  })

  it('returns null for invalid arguments (missing required)', () => {
    const result = parseFallbackToolCalls(
      '{"action":"shell_command","input":{"wrong_key":"value"}}',
      tools
    )
    expect(result).toBeNull()
  })

  it('returns null for invalid arguments (wrong type)', () => {
    const result = parseFallbackToolCalls(
      '{"action":"shell_command","input":{"command":123}}',
      tools
    )
    expect(result).toBeNull()
  })

  it('generates fallback-prefixed call ids', () => {
    const result = parseFallbackToolCalls(
      '{"action":"shell_command","input":{"command":"ls"}}',
      tools
    )
    expect(result!.calls[0].id).toMatch(/^fb_/)
  })

  it('returns null when text has no action field', () => {
    const result = parseFallbackToolCalls('{"something":"else"}', tools)
    expect(result).toBeNull()
  })

  it('handles JSON with surrounding whitespace', () => {
    // JSON with leading whitespace — extractBalancedJson handles
    const result = parseFallbackToolCalls(
      '  {"action":"shell_command","input":{"command":"ls"}}',
      tools
    )
    expect(result).not.toBeNull()
    expect(result!.calls[0].name).toBe('shell_command')
  })
})

describe('FALLBACK_TOOL_INSTRUCTION', () => {
  it('is a non-empty string', () => {
    expect(typeof FALLBACK_TOOL_INSTRUCTION).toBe('string')
    expect(FALLBACK_TOOL_INSTRUCTION.length).toBeGreaterThan(50)
  })

  it('references the JSON contract format', () => {
    expect(FALLBACK_TOOL_INSTRUCTION).toContain('"action"')
    expect(FALLBACK_TOOL_INSTRUCTION).toContain('"input"')
    expect(FALLBACK_TOOL_INSTRUCTION).toContain('"final"')
  })
})
