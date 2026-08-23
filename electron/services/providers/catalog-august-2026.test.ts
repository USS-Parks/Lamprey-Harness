import { describe, expect, it } from 'vitest'
import { MODEL_CATALOG, resolveModel } from './registry'
import { AUGUST_2026_MODELS } from './catalog-august-2026'

const EXPECTED_IDS = [
  'deepseek-v4-flash-vision-exp',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'qwen3.8-max',
  'glm-5.3',
  'claude-opus-5',
  'claude-fable-5',
  'grok-4.6',
  'minimax-m3',
  'muse-spark-1.2',
  'muse-spark-1.1'
] as const

describe('August 2026 catalog additions', () => {
  it('registers the documented first-party ids on MODEL_CATALOG', () => {
    expect(AUGUST_2026_MODELS.map((model) => model.id)).toEqual([...EXPECTED_IDS])
    for (const id of EXPECTED_IDS) {
      expect(MODEL_CATALOG.some((row) => row.id === id), id).toBe(true)
      expect(resolveModel(id)?.id).toBe(id)
    }
  })

  it('keeps Anthropic rows off the reasoning-effort compat flags', () => {
    for (const id of ['claude-opus-5', 'claude-fable-5'] as const) {
      const row = MODEL_CATALOG.find((model) => model.id === id)
      expect(row?.reasoningCapOnToolUse).toBeUndefined()
      expect(row?.defaultMaxTokens).toBeUndefined()
      expect(row?.isReasoner).toBeUndefined()
    }
  })

  it('pairs defaultMaxTokens with reasoningCapOnToolUse', () => {
    for (const row of AUGUST_2026_MODELS) {
      expect(Boolean(row.defaultMaxTokens), row.id).toBe(Boolean(row.reasoningCapOnToolUse))
    }
  })
})
