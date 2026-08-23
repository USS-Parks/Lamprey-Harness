import { describe, it, expect } from 'vitest'
import { parseOpenRouterFallbacks, buildOpenRouterFallbackExtras } from './openrouter-routing'

describe('parseOpenRouterFallbacks (TL-B2)', () => {
  it('returns [] for missing / non-array values', () => {
    expect(parseOpenRouterFallbacks(undefined)).toEqual([])
    expect(parseOpenRouterFallbacks(null)).toEqual([])
    expect(parseOpenRouterFallbacks('anthropic/claude')).toEqual([])
    expect(parseOpenRouterFallbacks({ id: 'x' })).toEqual([])
  })

  it('trims, drops empties, and de-dupes while keeping order', () => {
    expect(
      parseOpenRouterFallbacks([
        '  openai/gpt-4o-mini ',
        '',
        'openai/gpt-4o-mini',
        'google/gemini-flash-1.5',
        12
      ])
    ).toEqual(['openai/gpt-4o-mini', 'google/gemini-flash-1.5'])
  })
})

describe('buildOpenRouterFallbackExtras (TL-B2)', () => {
  it('omits models when the fallback list is empty (K4 no-op)', () => {
    expect(buildOpenRouterFallbackExtras('anthropic/claude-sonnet-4', [])).toEqual({})
  })

  it('emits models, skipping the primary id if it appears in the list', () => {
    expect(
      buildOpenRouterFallbackExtras('anthropic/claude-sonnet-4', [
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o-mini',
        'google/gemini-flash-1.5'
      ])
    ).toEqual({ models: ['openai/gpt-4o-mini', 'google/gemini-flash-1.5'] })
  })
})
