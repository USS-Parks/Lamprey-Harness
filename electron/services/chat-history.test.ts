import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildApiMessagesFromStoredMessages, type StoredChatMessage } from './chat-history'
import { readSettings } from './settings-helper'

vi.mock('./settings-helper', () => ({
  readSettings: vi.fn(() => ({}))
}))

const toolCall = (id: string, name = 'shell_command') => ({
  id,
  type: 'function' as const,
  function: { name, arguments: '{"command":"echo hi"}' }
})

describe('buildApiMessagesFromStoredMessages', () => {
  it('keeps all tool replies for a multi-tool assistant turn', () => {
    const messages: StoredChatMessage[] = [
      { role: 'user', content: 'check things' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [toolCall('call-a'), toolCall('call-b')]
      },
      { role: 'tool', content: 'A done', toolCallId: 'call-a' },
      { role: 'tool', content: 'B done', toolCallId: 'call-b' },
      { role: 'assistant', content: 'All set.' }
    ]

    const api = buildApiMessagesFromStoredMessages('system', messages)

    expect(api.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'tool',
      'assistant'
    ])
    expect(api[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call-a' }, { id: 'call-b' }]
    })
    expect(api[3]).toMatchObject({ role: 'tool', tool_call_id: 'call-a' })
    expect(api[4]).toMatchObject({ role: 'tool', tool_call_id: 'call-b' })
  })

  it('drops orphan tool replies', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'tool', content: 'orphan', toolCallId: 'call-a' },
      { role: 'user', content: 'hello' }
    ])

    expect(api.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('drops incomplete assistant tool-call blocks', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      {
        role: 'assistant',
        content: '',
        toolCalls: [toolCall('call-a'), toolCall('call-b')]
      },
      { role: 'tool', content: 'A done', toolCallId: 'call-a' },
      { role: 'user', content: 'next turn' }
    ])

    expect(api.map((m) => m.role)).toEqual(['system', 'user'])
    expect(api[1]).toMatchObject({ role: 'user', content: 'next turn' })
  })
})

// Reasoning Audit Phase R8 — rehydrate past reasoning into the API
// message stack (gated by includePastReasoningInContext, default true).
describe('buildApiMessagesFromStoredMessages — reasoning rehydration (R8)', () => {
  const mockReadSettings = readSettings as unknown as ReturnType<typeof vi.fn>
  beforeEach(() => {
    mockReadSettings.mockReset()
  })

  it('prepends <think>…</think> when setting is on (default) and row has reasoning', () => {
    mockReadSettings.mockReturnValue({}) // default = ON
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help me' },
      {
        role: 'assistant',
        content: 'sure, do this',
        reasoning: 'I thought it through'
      },
      { role: 'user', content: 'follow-up' }
    ])
    expect(api[2]).toMatchObject({
      role: 'assistant',
      content: '<think>I thought it through</think>\n\nsure, do this'
    })
  })

  it('does NOT prepend when setting is explicitly false', () => {
    mockReadSettings.mockReturnValue({ includePastReasoningInContext: false })
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help me' },
      {
        role: 'assistant',
        content: 'sure, do this',
        reasoning: 'I thought it through'
      }
    ])
    expect(api[2]).toMatchObject({ role: 'assistant', content: 'sure, do this' })
  })

  it('passes through unchanged when row has no reasoning', () => {
    mockReadSettings.mockReturnValue({}) // default = ON
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      { role: 'assistant', content: 'plain reply' }
    ])
    expect(api[2]).toMatchObject({ role: 'assistant', content: 'plain reply' })
  })

  it('does NOT double-tag when content already opens with <think>', () => {
    mockReadSettings.mockReturnValue({})
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      {
        role: 'assistant',
        content: '<think>existing inline</think>body',
        reasoning: 'native reasoning'
      }
    ])
    expect(api[2]).toMatchObject({
      role: 'assistant',
      content: '<think>existing inline</think>body'
    })
  })

  it('also prepends on assistant rows that carry tool_calls', () => {
    mockReadSettings.mockReturnValue({})
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'q' },
      {
        role: 'assistant',
        content: 'calling tool',
        reasoning: 'why I think shell is right',
        toolCalls: [toolCall('call-a')]
      },
      { role: 'tool', content: 'done', toolCallId: 'call-a' }
    ])
    const assistant = api[2] as { role: string; content: string | null }
    expect(assistant.role).toBe('assistant')
    expect(assistant.content).toBe(
      '<think>why I think shell is right</think>\n\ncalling tool'
    )
  })
})

describe('buildApiMessagesFromStoredMessages — reasoning_content field for DeepSeek V4', () => {
  const mockReadSettings = readSettings as unknown as ReturnType<typeof vi.fn>
  beforeEach(() => {
    mockReadSettings.mockReset()
    mockReadSettings.mockReturnValue({})
  })

  it('includes reasoning_content field for deepseek-v4-pro', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      {
        role: 'assistant',
        content: 'sure',
        reasoning: 'chain of thought',
        toolCalls: [toolCall('call-a')]
      },
      { role: 'tool', content: 'done', toolCallId: 'call-a' }
    ], 'deepseek-v4-pro')
    const assistant = api[2] as any
    expect(assistant.reasoning_content).toBe('chain of thought')
    expect(assistant.content).toBe('sure')
  })

  it('includes reasoning_content field for deepseek-v4-flash', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      { role: 'assistant', content: 'reply', reasoning: 'thought' }
    ], 'deepseek-v4-flash')
    const assistant = api[2] as any
    expect(assistant.reasoning_content).toBe('thought')
    expect(assistant.content).toBe('reply')
  })

  it('does NOT wrap reasoning in <think> tags for V4 models', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      { role: 'assistant', content: 'reply', reasoning: 'thought' }
    ], 'deepseek-v4-pro')
    const assistant = api[2] as any
    expect(assistant.content).not.toContain('<think>')
  })

  it('does NOT include reasoning_content for non-V4 models', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      { role: 'assistant', content: 'reply', reasoning: 'thought' }
    ], 'qwen3-max')
    const assistant = api[2] as any
    expect(assistant.reasoning_content).toBeUndefined()
    expect(assistant.content).toContain('<think>')
  })

  // JM-9 (CC-15) — this test used to assert the OPPOSITE with 'deepseek-chat'
  // as the "non-V4" fixture, codifying the defect: the retired alias resolves
  // to V4 via RETIRED_MODEL_MAP, so legacy conversations were silently denied
  // the v0.15.4 reasoning echo across turns.
  it('retired DeepSeek aliases resolve to V4 and DO get reasoning_content', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      { role: 'assistant', content: 'reply', reasoning: 'thought' }
    ], 'deepseek-chat')
    const assistant = api[2] as any
    expect(assistant.reasoning_content).toBe('thought')
    expect(assistant.content).not.toContain('<think>')
  })

  it('does NOT include reasoning_content when modelId is undefined', () => {
    const api = buildApiMessagesFromStoredMessages('system', [
      { role: 'user', content: 'help' },
      { role: 'assistant', content: 'reply', reasoning: 'thought' }
    ])
    const assistant = api[2] as any
    expect(assistant.reasoning_content).toBeUndefined()
  })
})
