// Agentic-coding config tests, extracted from final-response-composer.test.ts
// when UB-5 excised the composer. The config is now mode + skills only.

import { describe, it, expect } from 'vitest'
import { loadAgenticCodingConfig, DEFAULT_AGENTIC_SKILLS } from './agentic-coding-config'

describe('loadAgenticCodingConfig (UB-5: mode + skills, no composer)', () => {
  it('null settings → mode off, default skills', () => {
    const cfg = loadAgenticCodingConfig(null)
    expect(cfg.mode).toBe(false)
    expect(cfg.skills).toEqual([...DEFAULT_AGENTIC_SKILLS])
  })

  it('mode reflects agenticCodingMode strictly (=== true)', () => {
    expect(loadAgenticCodingConfig({}).mode).toBe(false)
    expect(loadAgenticCodingConfig({ agenticCodingMode: 'yes' }).mode).toBe(false)
    expect(loadAgenticCodingConfig({ agenticCodingMode: true }).mode).toBe(true)
  })

  it('skills honor the stored list, filtering non-strings', () => {
    const cfg = loadAgenticCodingConfig({ agenticCodingSkills: ['plan', 42, 'verify'] })
    expect(cfg.skills).toEqual(['plan', 'verify'])
  })

  it('the config carries NO composer field (UB-5 absence lock)', () => {
    const cfg = loadAgenticCodingConfig({ agenticCodingMode: true, agenticCodingComposer: 'always' })
    expect('composer' in cfg).toBe(false)
  })
})
