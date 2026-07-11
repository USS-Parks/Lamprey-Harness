import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the OpenAI SDK with a controllable stream so we can simulate the
// "provider opened a socket then stopped sending chunks" case without a
// real network call. The mock has to live ABOVE the registry import so
// vi.mock hoisting catches it before the module under test loads.
const mockCreate = vi.fn()
// Constructor options per instantiation, so tests can assert which apiKey /
// baseURL the registry actually handed the SDK (keyless placeholder,
// base-URL overrides).
const mockCtorOpts: Array<{ apiKey?: string; baseURL?: string }> = []
vi.mock('openai', () => {
  return {
    default: class FakeOpenAI {
      constructor(opts: { apiKey?: string; baseURL?: string }) {
        mockCtorOpts.push(opts)
      }
      chat = {
        completions: {
          create: mockCreate
        }
      }
    }
  }
})

// Keychain defaults to a non-empty key so getClientForProvider doesn't throw;
// individual tests override the implementation to exercise the no-key and
// keyless (keyOptional) paths.
const mockGetKey = vi.fn((_provider: string): string | null => 'test-key')
vi.mock('../keychain', () => ({
  getKey: (provider: string) => mockGetKey(provider)
}))

// event-log is a pure-side-effect module; stub it to no-op.
vi.mock('../event-log', () => ({
  recordEvent: vi.fn(),
  boundedJsonPreview: (s: unknown) => String(s ?? '')
}))

import {
  chatStream,
  chatOnce,
  StreamInactivityError,
  __setStreamInactivityForTesting,
  resetProviderClients
} from './registry'

// A controllable async-iterable stream: pushes chunks the test code feeds it,
// honors AbortSignal, and lets the test "stall" by simply never pushing.
function makeControllableStream() {
  const queue: any[] = []
  let resolveNext: ((v: { value: any; done: boolean }) => void) | null = null
  let rejectNext: ((e: Error) => void) | null = null
  let closed = false

  const push = (chunk: any) => {
    if (closed) return
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      rejectNext = null
      r({ value: chunk, done: false })
    } else {
      queue.push(chunk)
    }
  }
  const end = () => {
    closed = true
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      rejectNext = null
      r({ value: undefined, done: true })
    }
  }
  const fail = (err: Error) => {
    closed = true
    if (rejectNext) {
      const rj = rejectNext
      resolveNext = null
      rejectNext = null
      rj(err)
    }
  }

  let signalHandler: (() => void) | null = null
  const stream = {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (queue.length > 0) {
        return { value: queue.shift(), done: false }
      }
      if (closed) {
        return { value: undefined, done: true }
      }
      return new Promise<{ value: any; done: boolean }>((res, rej) => {
        resolveNext = res
        rejectNext = rej
      })
    },
    attachSignal(signal: AbortSignal) {
      signalHandler = () => {
        const err: any = new Error('Request was aborted.')
        err.name = 'AbortError'
        fail(err)
      }
      if (signal.aborted) signalHandler()
      else signal.addEventListener('abort', signalHandler, { once: true })
    }
  }

  return { stream, push, end, fail }
}

function makeChunk(content: string) {
  return {
    choices: [
      {
        delta: { content },
        index: 0,
        finish_reason: null
      }
    ]
  }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockGetKey.mockReset()
  mockGetKey.mockImplementation(() => 'test-key')
  mockCtorOpts.length = 0
  resetProviderClients()
})

describe('chatStream — SSE inactivity watchdog (T1)', () => {
  it('fires StreamInactivityError when the provider stops sending chunks', async () => {
    // 50 ms watchdog so the test stays fast.
    __setStreamInactivityForTesting(50)

    // Fresh stalling stream per attempt — the watchdog will retry up to 3
    // times with exponential backoff (2/4/8s), so we cap the test wait by
    // shrinking the backoff via fake timers. Instead of fake timers, just
    // accept the real backoff but keep the test runtime bounded with a
    // generous-but-not-infinite vitest timeout.
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      const fresh = makeControllableStream()
      fresh.stream.attachSignal(opts.signal)
      return Promise.resolve(fresh.stream)
    })

    let errorMessage: string | null = null
    let onDoneCalled = false

    const start = Date.now()
    await chatStream([{ role: 'user', content: 'hi' }], 'deepseek-v4-pro', undefined, {
      onChunk: () => {
        /* no-op */
      },
      onDone: () => {
        onDoneCalled = true
      },
      onError: (msg) => {
        errorMessage = msg
      }
    })
    const elapsed = Date.now() - start

    expect(onDoneCalled).toBe(false)
    expect(errorMessage).toMatch(/Stream stalled|provider sent no chunks/i)
    expect(elapsed).toBeLessThan(20_000)

    __setStreamInactivityForTesting(null)
  }, 25_000)

  it('does NOT fire when chunks arrive within the watchdog window', async () => {
    __setStreamInactivityForTesting(200)

    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      // Feed a chunk every 50ms (well inside 200ms watchdog) and finish.
      const t1 = setTimeout(() => controllable.push(makeChunk('hello ')), 30)
      const t2 = setTimeout(() => controllable.push(makeChunk('world')), 80)
      const t3 = setTimeout(() => controllable.end(), 130)
      void t1
      void t2
      void t3
      return Promise.resolve(controllable.stream)
    })

    let received = ''
    let errored = false
    let done = false
    await chatStream([{ role: 'user', content: 'hi' }], 'deepseek-v4-pro', undefined, {
      onChunk: (c) => {
        received += c
      },
      onDone: (full) => {
        done = true
        received = full
      },
      onError: () => {
        errored = true
      }
    })

    expect(errored).toBe(false)
    expect(done).toBe(true)
    expect(received).toBe('hello world')

    __setStreamInactivityForTesting(null)
  })

  it('can be disabled by setting threshold to 0', async () => {
    __setStreamInactivityForTesting(0)

    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      // Stall briefly then finish — the watchdog should NOT fire.
      setTimeout(() => controllable.push(makeChunk('ok')), 50)
      setTimeout(() => controllable.end(), 100)
      return Promise.resolve(controllable.stream)
    })

    let errored = false
    let done = false
    await chatStream([{ role: 'user', content: 'hi' }], 'deepseek-v4-pro', undefined, {
      onChunk: () => {},
      onDone: () => {
        done = true
      },
      onError: () => {
        errored = true
      }
    })

    expect(errored).toBe(false)
    expect(done).toBe(true)

    __setStreamInactivityForTesting(null)
  })

  it('user-signal abort wins over the inactivity watchdog', async () => {
    __setStreamInactivityForTesting(500)

    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      // Never send a chunk; rely on the user signal to break out.
      return Promise.resolve(controllable.stream)
    })

    const userAbort = new AbortController()
    let doneContent = ''
    let errored = false

    const p = chatStream(
      [{ role: 'user', content: 'hi' }],
      'deepseek-v4-pro',
      undefined,
      {
        onChunk: () => {},
        onDone: (full) => {
          doneContent = full
        },
        onError: () => {
          errored = true
        }
      },
      userAbort.signal
    )

    // Fire the user abort before the watchdog can.
    setTimeout(() => userAbort.abort(), 50)
    await p

    expect(errored).toBe(false)
    expect(doneContent).toContain('[cancelled]')

    __setStreamInactivityForTesting(null)
  })

  it('StreamInactivityError carries the configured threshold', () => {
    const e = new StreamInactivityError(45_000)
    expect(e.name).toBe('StreamInactivityError')
    expect(e.inactivityMs).toBe(45_000)
    expect(e.message).toMatch(/45s/)
  })
})

describe('chatStream — streaming-vitals heartbeat (T4)', () => {
  it('fires onVitals while the stream is active and stops when it ends', async () => {
    __setStreamInactivityForTesting(0)

    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      // Drip chunks across a window long enough for at least one heartbeat
      // (provider fires every 2s; we tick out chunks slowly).
      setTimeout(() => controllable.push(makeChunk('a')), 100)
      setTimeout(() => controllable.push(makeChunk('b')), 2_200)
      setTimeout(() => controllable.end(), 2_400)
      return Promise.resolve(controllable.stream)
    })

    const vitalsCalls: Array<{ lastChunkAt: number; chunkCount: number }> = []
    let done = false
    await chatStream([{ role: 'user', content: 'hi' }], 'deepseek-v4-pro', undefined, {
      onChunk: () => {},
      onVitals: (v) => vitalsCalls.push({ lastChunkAt: v.lastChunkAt, chunkCount: v.chunkCount }),
      onDone: () => {
        done = true
      },
      onError: () => {}
    })

    expect(done).toBe(true)
    // At least one heartbeat fired in the ~2.4s window. Provider lifts the
    // 2s heartbeat regardless of chunk arrival so the renderer can show a
    // staleness indicator on slow providers.
    expect(vitalsCalls.length).toBeGreaterThanOrEqual(1)
    const last = vitalsCalls[vitalsCalls.length - 1]
    expect(last.chunkCount).toBeGreaterThanOrEqual(1)
    expect(last.lastChunkAt).toBeGreaterThan(0)

    __setStreamInactivityForTesting(null)
  }, 10_000)
})

// Reasoning Audit Phase R2 — chatOnce now returns BOTH the visible body
// and any chain-of-thought the provider emitted alongside it. These tests
// pin the SDK response-shape contract: both `message.reasoning` and
// `message.reasoning_content` (the two field names different OpenAI-
// compatible APIs use) must be picked up. Without this pin, a future
// refactor could silently drop reasoning at the boundary again.
describe('chatOnce — reasoning channel extraction (R2)', () => {
  it('returns body only when neither reasoning field is set', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: 'plain body' },
          finish_reason: 'stop'
        }
      ]
    })
    const result = await chatOnce([{ role: 'user', content: 'q' }], 'deepseek-v4-pro')
    expect(result.content).toBe('plain body')
    expect(result.reasoning).toBeUndefined()
  })

  it('extracts reasoning from message.reasoning (OpenRouter shape)', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'final answer',
            reasoning: 'I thought through it like this'
          },
          finish_reason: 'stop'
        }
      ]
    })
    const result = await chatOnce([{ role: 'user', content: 'q' }], 'deepseek-v4-pro')
    expect(result.content).toBe('final answer')
    expect(result.reasoning).toBe('I thought through it like this')
  })

  it('extracts reasoning from message.reasoning_content (DashScope / DeepSeek shape)', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'final answer',
            reasoning_content: 'CoT on the other field name'
          },
          finish_reason: 'stop'
        }
      ]
    })
    const result = await chatOnce([{ role: 'user', content: 'q' }], 'deepseek-v4-pro')
    expect(result.content).toBe('final answer')
    expect(result.reasoning).toBe('CoT on the other field name')
  })

  it('prefers message.reasoning when both fields are populated', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'final answer',
            reasoning: 'primary CoT',
            reasoning_content: 'duplicate CoT'
          },
          finish_reason: 'stop'
        }
      ]
    })
    const result = await chatOnce([{ role: 'user', content: 'q' }], 'deepseek-v4-pro')
    expect(result.reasoning).toBe('primary CoT')
  })

  it('treats whitespace-only reasoning as absent', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: { content: 'body', reasoning: '   \n  ' },
          finish_reason: 'stop'
        }
      ]
    })
    const result = await chatOnce([{ role: 'user', content: 'q' }], 'deepseek-v4-pro')
    expect(result.reasoning).toBeUndefined()
  })

  it('trims surrounding whitespace from preserved reasoning', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'body',
            reasoning: '  actual reasoning  \n'
          },
          finish_reason: 'stop'
        }
      ]
    })
    const result = await chatOnce([{ role: 'user', content: 'q' }], 'deepseek-v4-pro')
    expect(result.reasoning).toBe('actual reasoning')
  })
})

// ── Fix A/B descriptor field tests ──────────────────────────────────
import { MODEL_CATALOG, resolveModel, resolveProviderDescriptor, PROVIDERS } from './registry'

describe('provider descriptor resolution + key handling', () => {
  it('resolves every built-in provider id to its own descriptor', () => {
    for (const id of Object.keys(PROVIDERS)) {
      const desc = resolveProviderDescriptor(id)
      expect(desc).not.toBeNull()
      expect(desc!.id).toBe(id)
      expect(desc!.baseURL.length).toBeGreaterThan(0)
      expect(desc!.label.length).toBeGreaterThan(0)
    }
  })

  it('returns null for an unknown provider id', () => {
    expect(resolveProviderDescriptor('definitely-not-a-provider')).toBeNull()
  })

  it('every built-in provider still requires a key (keyOptional unset)', () => {
    // Era-lock guard: the five original providers never become keyless by
    // accident. Local runtimes opt in explicitly when they are added.
    for (const desc of Object.values(PROVIDERS)) {
      const id: string = desc.id
      if (id === 'ollama' || id === 'lmstudio') continue
      expect(desc.keyOptional ?? false).toBe(false)
    }
  })

  it('a key-required provider with no stored key rejects with the Settings hint', async () => {
    mockGetKey.mockImplementation(() => null)
    await expect(chatOnce([{ role: 'user', content: 'q' }], 'deepseek-v4-pro')).rejects.toThrow(
      /API key not configured.*Settings/i
    )
  })
})

describe('keyless local providers + base-URL overrides', () => {
  const okCompletion = {
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }]
  }

  // Point the registry's settings.json readers at a throwaway dir carrying a
  // custom model on the ollama provider (its built-in catalog is empty by
  // design) plus whatever overrides each test writes.
  async function withUserDataDir(
    settings: Record<string, unknown>,
    run: (dir: string) => Promise<void>
  ): Promise<void> {
    const { mkdtempSync, writeFileSync: wf } = await import('fs')
    const { tmpdir } = await import('os')
    const { join: j } = await import('path')
    const { setUserDataPathProvider } = await import('./registry')
    const dir = mkdtempSync(j(tmpdir(), 'lamprey-provider-expansion-'))
    wf(j(dir, 'settings.json'), JSON.stringify(settings))
    setUserDataPathProvider(() => dir)
    try {
      await run(dir)
    } finally {
      setUserDataPathProvider(null)
    }
  }

  const ollamaCustomModel = {
    customModels: [
      {
        id: 'local-llama',
        name: 'Local Llama',
        provider: 'ollama',
        contextWindow: 32_768,
        supportsTools: false
      }
    ]
  }

  it('creates a keyless client with the placeholder key for keyOptional providers', async () => {
    mockGetKey.mockImplementation(() => null)
    mockCreate.mockResolvedValueOnce(okCompletion)
    await withUserDataDir(ollamaCustomModel, async () => {
      const result = await chatOnce([{ role: 'user', content: 'q' }], 'local-llama')
      expect(result.content).toBe('ok')
      const ctor = mockCtorOpts[mockCtorOpts.length - 1]
      expect(ctor.apiKey).toBe('local')
      expect(ctor.baseURL).toBe('http://127.0.0.1:11434/v1')
    })
  })

  it('a stored key wins over the keyless placeholder', async () => {
    mockGetKey.mockImplementation(() => 'real-ollama-token')
    mockCreate.mockResolvedValueOnce(okCompletion)
    await withUserDataDir(ollamaCustomModel, async () => {
      await chatOnce([{ role: 'user', content: 'q' }], 'local-llama')
      expect(mockCtorOpts[mockCtorOpts.length - 1].apiKey).toBe('real-ollama-token')
    })
  })

  it('providerBaseUrlOverrides redirects the client and a changed override misses the stale cache', async () => {
    mockGetKey.mockImplementation(() => null)
    mockCreate.mockResolvedValue(okCompletion)
    await withUserDataDir(
      {
        ...ollamaCustomModel,
        providerBaseUrlOverrides: { ollama: 'http://192.168.7.20:11434/v1' }
      },
      async (dir) => {
        const { writeFileSync: wf, utimesSync } = await import('fs')
        const { join: j } = await import('path')

        await chatOnce([{ role: 'user', content: 'q' }], 'local-llama')
        expect(mockCtorOpts[mockCtorOpts.length - 1].baseURL).toBe('http://192.168.7.20:11434/v1')

        // Rewrite the override WITHOUT resetting provider clients; bump the
        // mtime explicitly so filesystems with coarse timestamps can't make
        // the cache read stale data.
        wf(
          j(dir, 'settings.json'),
          JSON.stringify({
            ...ollamaCustomModel,
            providerBaseUrlOverrides: { ollama: 'http://10.0.0.5:11434/v1' }
          })
        )
        const bumped = new Date(Date.now() + 5_000)
        utimesSync(j(dir, 'settings.json'), bumped, bumped)

        await chatOnce([{ role: 'user', content: 'q' }], 'local-llama')
        expect(mockCtorOpts[mockCtorOpts.length - 1].baseURL).toBe('http://10.0.0.5:11434/v1')
      }
    )
  })

  it('rejects non-http override values at the consumption site', async () => {
    mockGetKey.mockImplementation(() => null)
    mockCreate.mockResolvedValueOnce(okCompletion)
    await withUserDataDir(
      {
        ...ollamaCustomModel,
        providerBaseUrlOverrides: { ollama: 'file:///C:/evil' }
      },
      async () => {
        await chatOnce([{ role: 'user', content: 'q' }], 'local-llama')
        expect(mockCtorOpts[mockCtorOpts.length - 1].baseURL).toBe('http://127.0.0.1:11434/v1')
      }
    )
  })
})

describe('reasoning token exhaustion guards (Fix A/B)', () => {
  const deepseekIds = ['deepseek-v4-pro', 'deepseek-v4-flash']

  for (const id of deepseekIds) {
    it(`${id} has defaultMaxTokens set`, () => {
      const desc = resolveModel(id)
      expect(desc.defaultMaxTokens).toBe(16_384)
    })

    it(`${id} has reasoningCapOnToolUse`, () => {
      expect(resolveModel(id).reasoningCapOnToolUse).toBe(true)
    })
  }

  it('no legacy DeepSeek aliases exist in the catalog', () => {
    const stale = MODEL_CATALOG.filter(
      (m) => m.provider === 'deepseek' && !m.id.startsWith('deepseek-v4-')
    )
    expect(stale).toEqual([])
  })

  it.each([
    ['deepseek-chat', 'deepseek-v4-flash'],
    ['deepseek-reasoner', 'deepseek-v4-pro'],
    ['deepseek-v3', 'deepseek-v4-flash'],
    ['deepseek-r1', 'deepseek-v4-pro']
  ])('retired model %s resolves to %s', (retired, expected) => {
    const desc = resolveModel(retired)
    expect(desc.id).toBe(expected)
    expect(desc.apiModelId).toBe(expected)
  })

  it('defaultMaxTokens appears only alongside the reasoning cap (guard pairing)', () => {
    // The output-budget guard exists for reasoning models that can exhaust
    // max_tokens on chain-of-thought (the v0.15.5 failure). Any model that
    // sets one half of the guard without the other is a smell: either the
    // budget is untethered or the cap has no budget to protect.
    for (const m of MODEL_CATALOG) {
      if (m.defaultMaxTokens !== undefined || m.reasoningCapOnToolUse) {
        expect(
          m.defaultMaxTokens,
          `${m.id}: reasoning guard without defaultMaxTokens`
        ).toBeDefined()
        expect(
          m.reasoningCapOnToolUse,
          `${m.id}: defaultMaxTokens without reasoningCapOnToolUse`
        ).toBe(true)
      }
    }
  })

  // JM-11 (CC-7) — Custom Models saved via model:addCustom are consulted by
  // resolveModel before the blind DeepSeek fallback. The catalog's own
  // comments tell users to paste DashScope/AI-Studio ids into Custom Models;
  // those used to dispatch to api.deepseek.com with the DeepSeek key.
  it('resolveModel honours a custom model from settings.json', async () => {
    const { mkdtempSync, writeFileSync: wf } = await import('fs')
    const { tmpdir } = await import('os')
    const { join: j } = await import('path')
    const { setUserDataPathProvider } = await import('./registry')
    const dir = mkdtempSync(j(tmpdir(), 'lamprey-custom-model-'))
    wf(
      j(dir, 'settings.json'),
      JSON.stringify({
        customModels: [
          {
            id: 'my-dashscope-model',
            name: 'My DashScope Model',
            provider: 'dashscope',
            contextWindow: 128_000,
            supportsTools: false,
            supportsVision: true
          }
        ]
      })
    )
    setUserDataPathProvider(() => dir)
    try {
      const desc = resolveModel('my-dashscope-model')
      expect(desc.provider).toBe('dashscope')
      expect(desc.contextWindow).toBe(128_000)
      expect(desc.supportsTools).toBe(false)
      expect(desc.supportsVision).toBe(true)
      // Unknown ids still fall through to the DeepSeek default.
      expect(resolveModel('totally-unknown-model').provider).toBe('deepseek')
    } finally {
      setUserDataPathProvider(null)
    }
  })

  it('chatStream sends max_tokens from defaultMaxTokens when caller omits maxTokens', async () => {
    __setStreamInactivityForTesting(0)
    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      setTimeout(() => controllable.push(makeChunk('ok')), 10)
      setTimeout(() => controllable.end(), 20)
      return Promise.resolve(controllable.stream)
    })

    await chatStream([{ role: 'user', content: 'hi' }], 'deepseek-v4-pro', undefined, {
      onChunk: () => {},
      onDone: () => {},
      onError: () => {}
    })

    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.max_tokens).toBe(16_384)
    __setStreamInactivityForTesting(null)
  })

  it('chatStream sends reasoning_effort when tools are offered on a capped model', async () => {
    __setStreamInactivityForTesting(0)
    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      setTimeout(() => controllable.push(makeChunk('ok')), 10)
      setTimeout(() => controllable.end(), 20)
      return Promise.resolve(controllable.stream)
    })

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'test',
          parameters: { type: 'object', properties: {} }
        }
      }
    ]

    await chatStream([{ role: 'user', content: 'hi' }], 'deepseek-v4-pro', tools, {
      onChunk: () => {},
      onDone: () => {},
      onError: () => {}
    })

    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.reasoning_effort).toBe('low')
    __setStreamInactivityForTesting(null)
  })

  it('chatStream does NOT send reasoning_effort when no tools offered', async () => {
    __setStreamInactivityForTesting(0)
    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      setTimeout(() => controllable.push(makeChunk('ok')), 10)
      setTimeout(() => controllable.end(), 20)
      return Promise.resolve(controllable.stream)
    })

    await chatStream([{ role: 'user', content: 'hi' }], 'deepseek-v4-pro', undefined, {
      onChunk: () => {},
      onDone: () => {},
      onError: () => {}
    })

    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.reasoning_effort).toBeUndefined()
    __setStreamInactivityForTesting(null)
  })

  it('caller-provided maxTokens overrides defaultMaxTokens', async () => {
    __setStreamInactivityForTesting(0)
    const controllable = makeControllableStream()
    mockCreate.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      controllable.stream.attachSignal(opts.signal)
      setTimeout(() => controllable.push(makeChunk('ok')), 10)
      setTimeout(() => controllable.end(), 20)
      return Promise.resolve(controllable.stream)
    })

    await chatStream(
      [{ role: 'user', content: 'hi' }],
      'deepseek-v4-pro',
      undefined,
      { onChunk: () => {}, onDone: () => {}, onError: () => {} },
      undefined,
      { maxTokens: 4096 }
    )

    const createArg = mockCreate.mock.calls[0][0]
    expect(createArg.max_tokens).toBe(4096)
    __setStreamInactivityForTesting(null)
  })
})
