import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(
  join(__dirname, 'ApiKeySettings.tsx'),
  'utf-8'
)

describe('TL-C2 local endpoint presets wiring', () => {
  it('ApiKeySettings offers Ollama, LM Studio, and Unsloth presets', () => {
    expect(src).toMatch(/LOCAL_ENDPOINT_PRESETS/)
    expect(src).toMatch(/applyLocalEndpointPreset/)
    expect(src).toMatch(/handleApplyLocalPreset/)
    expect(src).toMatch(/Local presets/)
  })
})
