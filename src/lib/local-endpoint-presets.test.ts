import { describe, expect, it } from 'vitest'
import {
  LOCAL_ENDPOINT_PRESETS,
  applyLocalEndpointPreset
} from './local-endpoint-presets'

const builtins = new Set(['ollama', 'lmstudio', 'openai'])

describe('applyLocalEndpointPreset (TL-C2)', () => {
  it('writes the Ollama override only when unset', () => {
    const first = applyLocalEndpointPreset('ollama', {}, builtins)
    expect(first.status).toBe('applied')
    expect(first.settings.providerBaseUrlOverrides.ollama).toBe('http://127.0.0.1:11434/v1')
    expect(first.settings.customProviders).toEqual([])

    const second = applyLocalEndpointPreset('ollama', first.settings, builtins)
    expect(second.status).toBe('unchanged')

    const custom = applyLocalEndpointPreset(
      'ollama',
      { providerBaseUrlOverrides: { ollama: 'http://192.168.1.10:11434/v1' } },
      builtins
    )
    expect(custom.status).toBe('unchanged')
    expect(custom.settings.providerBaseUrlOverrides.ollama).toBe('http://192.168.1.10:11434/v1')
  })

  it('writes the LM Studio override when unset', () => {
    const result = applyLocalEndpointPreset('lmstudio', {}, builtins)
    expect(result.status).toBe('applied')
    expect(result.settings.providerBaseUrlOverrides.lmstudio).toBe('http://127.0.0.1:1234/v1')
  })

  it('adds Unsloth as a custom endpoint and does not shadow built-ins', () => {
    const first = applyLocalEndpointPreset('unsloth', {}, builtins)
    expect(first.status).toBe('applied')
    expect(first.settings.customProviders).toEqual([
      {
        id: 'unsloth',
        label: 'Unsloth Studio',
        baseURL: 'http://127.0.0.1:8000/v1',
        requiresKey: false
      }
    ])

    const second = applyLocalEndpointPreset('unsloth', first.settings, builtins)
    expect(second.status).toBe('unchanged')
    expect(second.settings.customProviders).toHaveLength(1)

    const shadowed = applyLocalEndpointPreset('unsloth', {}, new Set(['unsloth']))
    expect(shadowed.status).toBe('unchanged')
    expect(shadowed.settings.customProviders).toEqual([])
  })

  it('ships exactly the K7 preset ids', () => {
    expect(LOCAL_ENDPOINT_PRESETS.map((p) => p.id)).toEqual(['ollama', 'lmstudio', 'unsloth'])
  })
})
