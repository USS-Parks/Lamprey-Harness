import { describe, it, expect } from 'vitest'
import {
  parseOpenRouterFallbacks,
  parseOpenRouterSort,
  buildOpenRouterChatExtras,
  buildOpenRouterFallbackExtras
} from './openrouter-routing'

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

describe('OpenRouter provider prefs (TL-B3)', () => {
  it('parseOpenRouterSort falls back to default', () => {
    expect(parseOpenRouterSort(undefined)).toBe('default')
    expect(parseOpenRouterSort('nope')).toBe('default')
    expect(parseOpenRouterSort('price')).toBe('price')
    expect(parseOpenRouterSort('latency')).toBe('latency')
    expect(parseOpenRouterSort('throughput')).toBe('throughput')
  })

  it('emits provider.sort when not default', () => {
    expect(
      buildOpenRouterChatExtras('anthropic/claude-sonnet-4', {
        fallbacks: [],
        sort: 'price',
        order: [],
        ignore: []
      })
    ).toEqual({ provider: { sort: 'price' } })
  })

  it('emits provider.order and provider.ignore', () => {
    expect(
      buildOpenRouterChatExtras('anthropic/claude-sonnet-4', {
        fallbacks: ['openai/gpt-4o-mini'],
        sort: 'latency',
        order: ['Anthropic', 'OpenAI'],
        ignore: ['Azure']
      })
    ).toEqual({
      models: ['openai/gpt-4o-mini'],
      provider: { sort: 'latency', order: ['Anthropic', 'OpenAI'], ignore: ['Azure'] }
    })
  })

  it('empty prefs + empty fallbacks stay {} (K4)', () => {
    expect(
      buildOpenRouterChatExtras('anthropic/claude-sonnet-4', {
        fallbacks: [],
        sort: 'default',
        order: [],
        ignore: []
      })
    ).toEqual({})
  })
})
