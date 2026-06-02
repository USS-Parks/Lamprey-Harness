import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the OpenAI client so we control the streamed chunks, and the keychain so
// getClientForProvider finds a key without touching electron safeStorage. The
// shared `create` spy is driven per-test; vi.hoisted lets the mock factory and
// the test body reference it.
const h = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: h.create } }
  }
}))
vi.mock('../keychain', () => ({ getKey: () => 'test-key' }))

import { chatStream, resetProviderClients } from './registry'

beforeEach(() => {
  h.create.mockReset()
  resetProviderClients()
})

afterEach(() => {
  vi.useRealTimers()
})

const MODEL = 'deepseek-v4-pro'
const messages = [{ role: 'user' as const, content: 'hi' }]

// A stream that emits one delta then fails mid-iteration. No `.status` → the
// generic network-retry path in chatStream.
async function* failingContentStream() {
  yield { choices: [{ delta: { content: 'partial ' } }] }
  throw new Error('network blip')
}
async function* goodContentStream() {
  yield { choices: [{ delta: { content: 'final answer' } }] }
}

async function* failingToolStream() {
  yield {
    choices: [
      { delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'foo', arguments: '{"par' } }] } }
    ]
  }
  throw new Error('network blip')
}
async function* goodToolStream() {
  yield {
    choices: [
      { delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'foo', arguments: '{"x":1}' } }] } }
    ]
  }
}

describe('chatStream retry resets per-attempt accumulators (BUG-1)', () => {
  it('does not append the failed attempt content onto the retry', async () => {
    vi.useFakeTimers()
    h.create
      .mockImplementationOnce(async () => failingContentStream())
      .mockImplementationOnce(async () => goodContentStream())

    const onDone = vi.fn()
    const onChunk = vi.fn()
    const p = chatStream(messages, MODEL, undefined, { onChunk, onDone, onError: vi.fn() })

    await vi.advanceTimersByTimeAsync(5000) // flush the exponential backoff + retry
    await p

    expect(h.create).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledTimes(1)
    // The bug appended: would have been 'partial final answer'.
    expect(onDone.mock.calls[0][0]).toBe('final answer')
  })

  it('does not leak partial tool-call arguments across a retry', async () => {
    vi.useFakeTimers()
    h.create
      .mockImplementationOnce(async () => failingToolStream())
      .mockImplementationOnce(async () => goodToolStream())

    const onDone = vi.fn()
    const p = chatStream(messages, MODEL, undefined, {
      onChunk: vi.fn(),
      onDone,
      onError: vi.fn()
    })

    await vi.advanceTimersByTimeAsync(5000)
    await p

    const toolCalls = onDone.mock.calls[0][1]
    expect(toolCalls).toHaveLength(1)
    // The bug concatenated: would have been '{"par{"x":1}'.
    expect(toolCalls[0].function.arguments).toBe('{"x":1}')
  })

  it('succeeds in one shot when the first stream does not fail', async () => {
    h.create.mockImplementationOnce(async () => goodContentStream())
    const onDone = vi.fn()
    await chatStream(messages, MODEL, undefined, { onChunk: vi.fn(), onDone, onError: vi.fn() })
    expect(h.create).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0]).toBe('final answer')
  })
})
