import { describe, it, expect } from 'vitest'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { ORCHESTRATION_MODEL_TOOL_IDS, filterOrchestrationTools } from './orchestration-tools'

// AO-6 — the dispatch-array strip that enforces the master toggle's zero-byte
// guarantee for orchestration tools.

function tool(name: string): ChatCompletionTool {
  return {
    type: 'function',
    function: { name, description: name, parameters: { type: 'object', properties: {} } }
  }
}

describe('filterOrchestrationTools', () => {
  const surface = [
    tool('read_file'),
    tool('agent_fanout'),
    tool('apply_patch'),
    tool('agent_critique'),
    tool('agent_advisor')
  ]

  const nameOf = (t: ChatCompletionTool): string | undefined =>
    (t as { function?: { name?: string } }).function?.name

  it('strips every orchestration tool when disabled', () => {
    const out = filterOrchestrationTools(surface, false).map(nameOf)
    expect(out).toEqual(['read_file', 'apply_patch'])
    for (const id of ORCHESTRATION_MODEL_TOOL_IDS) expect(out).not.toContain(id)
  })

  it('passes the surface through unchanged when enabled (same reference)', () => {
    expect(filterOrchestrationTools(surface, true)).toBe(surface)
  })

  it('names all three strategy tools', () => {
    expect([...ORCHESTRATION_MODEL_TOOL_IDS]).toEqual([
      'agent_fanout',
      'agent_critique',
      'agent_advisor'
    ])
  })
})
