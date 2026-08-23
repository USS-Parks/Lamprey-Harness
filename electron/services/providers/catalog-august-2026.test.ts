import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { MODEL_CATALOG, resolveModel } from './registry'

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

  it('pairs defaultMaxTokens with reasoningCapOnToolUse on the August ids', () => {
    for (const id of EXPECTED_IDS) {
      const row = MODEL_CATALOG.find((model) => model.id === id)
      expect(row, id).toBeTruthy()
      expect(Boolean(row?.defaultMaxTokens), id).toBe(Boolean(row?.reasoningCapOnToolUse))
    }
  })

  it('OD-9: registry no longer overlays or imports AUGUST_2026_MODELS', () => {
    const registry = readFileSync(join(__dirname, 'registry.ts'), 'utf-8')
    expect(registry).not.toMatch(/AUGUST_2026_MODELS/)
    expect(registry).not.toMatch(/catalog-august-2026/)
    expect(registry).not.toMatch(/MODEL_CATALOG\.push/)
  })
})
