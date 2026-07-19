import { describe, it, expect } from 'vitest'
import { MODEL_CATALOG, resolveModel } from './registry'

describe('FC-2 — supportsTools flag audit', () => {
  it('every model in catalog has a boolean supportsTools', () => {
    for (const model of MODEL_CATALOG) {
      expect(typeof model.supportsTools, `${model.id}: supportsTools must be boolean`).toBe('boolean')
    }
  })

  it('DeepSeek native models have correct supportsTools', () => {
    const v4pro = resolveModel('deepseek-v4-pro')
    expect(v4pro.supportsTools).toBe(true)

    const v4flash = resolveModel('deepseek-v4-flash')
    expect(v4flash.supportsTools).toBe(true)

    const reasoner = resolveModel('deepseek-reasoner')
    expect(reasoner.supportsTools).toBe(true)
    expect(reasoner.id).toBe('deepseek-v4-pro')
  })

  it('Qwen native models have correct supportsTools', () => {
    const max = resolveModel('qwen3-max')
    expect(max.supportsTools).toBe(true)

    const coderPlus = resolveModel('qwen3-coder-plus')
    expect(coderPlus.supportsTools).toBe(true)

    const plus35 = resolveModel('qwen3.5-plus')
    expect(plus35.supportsTools).toBe(false)

    const long = resolveModel('qwen-long')
    expect(long.supportsTools).toBe(false)
  })

  it('Google Gemma models have correct supportsTools', () => {
    const gemma27b = resolveModel('gemma-3-27b-it')
    expect(gemma27b.supportsTools).toBe(true)

    const gemma12b = resolveModel('gemma-3-12b-it')
    expect(gemma12b.supportsTools).toBe(true)
  })

  it('direct Google Gemma 4 models have correct supportsTools', () => {
    const g431b = resolveModel('gemma-4-31b-it-google')
    expect(g431b.provider).toBe('google')
    expect(g431b.supportsTools).toBe(true)

    const g426b = resolveModel('gemma-4-26b-a4b-it-google')
    expect(g426b.provider).toBe('google')
    expect(g426b.supportsTools).toBe(true)
  })

  it('resolveModel for unknown model falls back to supportsTools=true', () => {
    const custom = resolveModel('custom-unknown-model')
    expect(custom.supportsTools).toBe(true)
  })
})
