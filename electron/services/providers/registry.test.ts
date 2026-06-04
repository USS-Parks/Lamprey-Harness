import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// Mock the OpenAI client so we control the streamed chunks and can make a
// stream fail mid-flight. `mockCreate` is hoisted so the vi.mock factory can
// close over it.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: mockCreate } }
  }
}))

// getClientForProvider throws without a key; give it one.
vi.mock('../keychain', () => ({ getKey: () => 'test-key' }))

import { chatStream, isKnownModel, resetProviderClients, resolveModel } from './registry'

function contentChunk(text: string) {
  return { choices: [{ delta: { content: text } }] }
}

async function* streamOf(chunks: unknown[]) {
  for (const c of chunks) yield c
}

const userMessages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'hi' }]

beforeEach(() => {
  mockCreate.mockReset()
  resetProviderClients()
})

describe('chatStream retry — BUG-1 (per-attempt accumulators)', () => {
  it('does not carry partial content into a retried attempt', async () => {
    let call = 0
    mockCreate.mockImplementation(async () => {
      call++
      if (call === 1) {
        // Emit partial content, then fail mid-stream. No `.status` on the
        // error routes through the generic retry path.
        return (async function* () {
          yield contentChunk('Partial ')
          yield contentChunk('data')
          throw new Error('network blip')
        })()
      }
      return streamOf([contentChunk('Hello '), contentChunk('world')])
    })

    const onDone = vi.fn()
    const onError = vi.fn()
    await chatStream(userMessages, 'deepseek-v4-pro', undefined, {
      onChunk: () => {},
      onDone,
      onError
    })

    expect(onError).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalledTimes(1)
    // Before the fix, fullContent persisted across the retry and onDone would
    // have received 'Partial dataHello world'.
    expect(onDone).toHaveBeenCalledWith('Hello world', undefined)
  }, 10_000)

  it('a clean single-pass stream is unaffected', async () => {
    mockCreate.mockImplementation(async () =>
      streamOf([contentChunk('all '), contentChunk('good')])
    )
    const onDone = vi.fn()
    await chatStream(userMessages, 'deepseek-v4-pro', undefined, {
      onChunk: () => {},
      onDone,
      onError: () => {}
    })
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('all good', undefined)
  })
})

describe('resolveModel / isKnownModel — QUAL-3', () => {
  it('isKnownModel is true for a catalog id, false for an unknown id', () => {
    expect(isKnownModel('deepseek-v4-pro')).toBe(true)
    expect(isKnownModel('totally-made-up-model')).toBe(false)
  })

  it('resolveModel returns the catalog descriptor for a known id', () => {
    const d = resolveModel('deepseek-v4-pro')
    expect(d.id).toBe('deepseek-v4-pro')
    expect(d.provider).toBe('deepseek')
  })

  it('resolveModel still returns a fallback descriptor for an unknown id (custom-model support) and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const d = resolveModel('my-custom-endpoint')
    // Does NOT throw — custom models depend on this fallback path.
    expect(d.id).toBe('my-custom-endpoint')
    expect(d.apiModelId).toBe('my-custom-endpoint')
    expect(d.provider).toBe('deepseek')
    // But the silent-typo risk is now observable.
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
