import { describe, expect, it } from 'vitest'
import {
  splitInlineReasoning,
  splitInlineReasoningWithDraft
} from './conversation-store'

describe('splitInlineReasoning', () => {
  it('passes through when native reasoning channel populated', () => {
    const r = splitInlineReasoning('plain body', 'native thinking')
    expect(r).toEqual({ content: 'plain body', reasoning: 'native thinking' })
  })

  it('extracts a leading <think>…</think> block out of content', () => {
    const r = splitInlineReasoning(
      '<think>plan the patch</think>\nHere is the patch:',
      undefined
    )
    expect(r.reasoning).toBe('plan the patch')
    // Trailing `\s*` in the regex eats the newline after </think>.
    expect(r.content).toBe('Here is the patch:')
  })

  it('tolerates leading whitespace before <think>', () => {
    const r = splitInlineReasoning('  \n<think>idea</think>body', undefined)
    expect(r.reasoning).toBe('idea')
    expect(r.content).toBe('body')
  })

  it('leaves content alone when <think> is missing or unterminated', () => {
    expect(splitInlineReasoning('no tags here', undefined)).toEqual({
      content: 'no tags here',
      reasoning: undefined
    })
    expect(
      splitInlineReasoning('<think>open but no close', undefined)
    ).toEqual({
      content: '<think>open but no close',
      reasoning: undefined
    })
  })

  it('does not extract <think> when it appears mid-body', () => {
    // Start-anchored by design — composer drafts that begin with prose
    // before the thinking block shouldn't get mangled.
    const content = 'Preface text\n<think>hidden</think>then body'
    expect(splitInlineReasoning(content, undefined)).toEqual({
      content,
      reasoning: undefined
    })
  })
})

describe('splitInlineReasoningWithDraft', () => {
  it('returns reasoning from content when it is present', () => {
    const r = splitInlineReasoningWithDraft(
      '<think>from content</think>body',
      undefined,
      '<think>from draft</think>different'
    )
    expect(r.reasoning).toBe('from content')
    expect(r.content).toBe('body')
  })

  // The bug this fix addresses: when the Final Response Composer rewrites
  // the assistant body, the original (with `<think>`) is moved to draft
  // and the composed clean text is stored as content. Without the draft
  // fallback, reasoning is silently dropped and the Reasoning panel never
  // renders after the run completes.
  it('recovers reasoning from draft when composer replaced content', () => {
    const composedBody = 'Here is the fix you asked about.'
    const originalDraft =
      '<think>I should explain the SQL bug clearly.</think>\n' +
      'Here is the fix you asked about (raw).'
    const r = splitInlineReasoningWithDraft(
      composedBody,
      undefined,
      originalDraft
    )
    expect(r.reasoning).toBe('I should explain the SQL bug clearly.')
    // Composer output is preserved as the visible content; only the
    // reasoning is hoisted out of the draft.
    expect(r.content).toBe(composedBody)
  })

  it('prefers the provider native channel over draft fallback', () => {
    const r = splitInlineReasoningWithDraft(
      'composed body',
      'native reasoning won',
      '<think>draft reasoning lost</think>original'
    )
    expect(r.reasoning).toBe('native reasoning won')
    expect(r.content).toBe('composed body')
  })

  it('returns undefined reasoning when neither content nor draft has one', () => {
    const r = splitInlineReasoningWithDraft(
      'composed body',
      undefined,
      'original body without think'
    )
    expect(r.reasoning).toBeUndefined()
    expect(r.content).toBe('composed body')
  })

  it('handles missing draft gracefully', () => {
    expect(
      splitInlineReasoningWithDraft('plain body', undefined, undefined)
    ).toEqual({ content: 'plain body', reasoning: undefined })
    expect(splitInlineReasoningWithDraft('plain body', undefined, '')).toEqual({
      content: 'plain body',
      reasoning: undefined
    })
  })
})
