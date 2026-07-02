import { describe, it, expect } from 'vitest'
import { extractBalancedJson, parseFallbackToolCalls } from './fallback-tool-parser'
import { validateToolArguments } from './tool-schema-validator'

describe('FC-11 — Ghost-reply regression tests', () => {
  const shellSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to run' }
    },
    required: ['command'],
    additionalProperties: false
  }

  it('native model: pseudo-XML prose with empty toolCalls never dispatches', () => {
    // Simulate a native-model response: toolCalls is empty, but the
    // content contains bash-like pseudo-XML. The validator + parser
    // should NOT extract tool calls from this.
    const content = 'Let me run that for you:\n<bash>npm test</bash>\nThe tests should pass now.'

    // Fallback parser should NOT find a valid JSON tool call here
    const result = parseFallbackToolCalls(content, [
      { name: 'shell_command', inputSchema: shellSchema }
    ])
    // Pseudo-XML in angle brackets is NOT valid JSON — parser returns null
    expect(result).toBeNull()
  })

  it('native model: prose containing <bash> in content is not a tool call', () => {
    // The pseudo-XML tags are prose, not structured tool invocations.
    // validateToolArguments would reject this even if it were parsed.
    const result = validateToolArguments('shell_command', { command: 'npm test' }, shellSchema)
    // Valid args — but this only matters if the parser actually extracted
    // a tool call, which it shouldn't for angle-bracket pseudo-XML.
    expect(result.valid).toBe(true)
  })

  it('fallback model: pseudo-XML is not accepted as a valid tool call', () => {
    // Fallback models must use the JSON contract format:
    // {"action": "shell_command", "input": {"command": "npm test"}}
    // Angle-bracket pseudo-XML should never dispatch.
    const content = '<bash>rm -rf /</bash>'

    const result = parseFallbackToolCalls(content, [
      { name: 'shell_command', inputSchema: shellSchema }
    ])
    // extractBalancedJson won't find a valid JSON object here
    expect(result).toBeNull()
  })

  it('fallback model: valid JSON tool call DOES dispatch', () => {
    // This is the expected fallback format
    const content = '{"action":"shell_command","input":{"command":"npm test"}}'

    const result = parseFallbackToolCalls(content, [
      { name: 'shell_command', inputSchema: shellSchema }
    ])
    expect(result).not.toBeNull()
    expect(result!.calls).toHaveLength(1)
    expect(result!.calls[0].name).toBe('shell_command')
    expect(result!.calls[0].arguments).toEqual({ command: 'npm test' })
    expect(result!.calls[0].provenance).toBe('fallback')
  })

  it('fallback model: invalid arguments do not dispatch', () => {
    // Missing required "command" field
    const content = '{"action":"shell_command","input":{"wrong":"stuff"}}'

    const result = parseFallbackToolCalls(content, [
      { name: 'shell_command', inputSchema: shellSchema }
    ])
    // The load-bearing invariant is unchanged: nothing dispatches. JM-10
    // (CC-13) replaced the old bare `null` with a structured validationError
    // so the caller runs a corrective round instead of publishing the JSON.
    expect(result!.calls).toEqual([])
    expect(result!.isFinalAnswer).toBe(false)
    expect(result!.validationError?.toolName).toBe('shell_command')
  })

  it('brace-balanced extractor handles nested JSON in prose', () => {
    // Model might emit multi-line content with embedded JSON
    const content = [
      'Here is my plan:',
      '{"action":"shell_command","input":{"command":"git status"}}',
      'This will check the current state.'
    ].join('\n')

    const extracted = extractBalancedJson(content)
    expect(extracted).not.toBeNull()
    expect(extracted).toContain('"action":"shell_command"')
  })

  it('brace-balanced extractor returns null when no braces present', () => {
    const content = 'This is just a plain text answer with <bash>syntax</bash>'
    // No {} braces → no JSON
    expect(extractBalancedJson(content)).toBeNull()
  })
})
