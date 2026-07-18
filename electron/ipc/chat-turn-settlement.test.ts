import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// JM-8 (July 2026 Maintenance) — settle-the-turn locks. Every failure path in
// runChatRound must settle its wrapper promise; a hung turn is the worst
// failure mode this app has (spinner forever, no error row, leaked abort
// entry). Source-reading contract locks, WC-8 pattern.

const src = readFileSync(join(__dirname, 'chat.ts'), 'utf-8')

describe('JM-8 every runChatRound failure path settles the turn', () => {
  it('a pre-stream chatStream rejection is caught and rejects the wrapper (CC-1)', () => {
    const wrapper = src.slice(src.indexOf('return new Promise<RunChatRoundResult>'))
    expect(wrapper).toMatch(/\)\.catch\(\(err\) => \{/)
    expect(wrapper).toMatch(/runChatRound\.preStreamThrow/)
  })

  it('the async onDone body is fully wrapped in try/catch (CC-3)', () => {
    const onDone = src.slice(src.indexOf('onDone: async (fullContent, toolCalls, fullReasoning)'))
    const firstBrace = onDone.indexOf('{')
    const tryIdx = onDone.indexOf('try {')
    const traceIdx = onDone.indexOf('trace(')
    expect(tryIdx).toBeGreaterThan(firstBrace)
    expect(tryIdx).toBeLessThan(traceIdx)
  })

  it('the onError body is wrapped so even the error path settles (CC-3)', () => {
    const onError = src.slice(src.indexOf('onError: (error, partial)'))
    const tryIdx = onError.indexOf('try {')
    const traceIdx = onError.indexOf('trace(')
    expect(tryIdx).toBeGreaterThan(-1)
    expect(tryIdx).toBeLessThan(traceIdx)
  })

  it('chat:send stringifies untyped throws before using them (CC-20)', () => {
    expect(src).toMatch(/err instanceof Error \? err\.message : String\(err \?\? 'unknown error'\)/)
    expect(src).not.toMatch(/return \{ success: false, error: err\.message \}/)
  })

  it('both chat:send success paths return the same payload shape (CC-20)', () => {
    const matches =
      src.match(
        /success: true,\s*\n\s*data: \{ conversationId, correlationId, turnId: turnRuntime\.turnId \}/g
      ) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe('JM-10 fallback tool contract is live', () => {
  it('non-native/downgraded rounds inject the fallback instruction + tool list (CC-4)', () => {
    expect(src).toMatch(
      /if \(!actuallySupportsTools && tools && tools\.length > 0\) \{\s*\n\s*ensureFallbackContract\(messages, tools\)/
    )
    expect(src).toMatch(/FALLBACK_TOOL_INSTRUCTION/)
    expect(src).toMatch(/renderFallbackToolBlock/)
  })

  it('malformed native tool args return a corrective result, never silent {} (CC-6)', () => {
    expect(src).toMatch(/argument_parse_failed/)
    const parse = src.slice(src.indexOf('const rawArgs = tc.function.arguments'))
    const catchBlock = parse.slice(parse.indexOf('catch'), parse.indexOf('// Fix C'))
    expect(catchBlock).toMatch(/return \{/)
  })

  it('fallback validation failures run a corrective round (CC-13)', () => {
    expect(src).toMatch(/fallbackResult\?\.validationError/)
    expect(src).toMatch(/failed validation/)
  })
})
