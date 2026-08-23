/**
 * TL-C2 — one-click local OpenAI-compatible presets.
 *
 * Ollama and LM Studio are built-ins: applying a preset writes
 * `providerBaseUrlOverrides` only when that id has no override yet.
 * Unsloth Studio is not a built-in: applying adds a `customProviders`
 * row. Existing user values are never overwritten (K7).
 */

export const LOCAL_ENDPOINT_PRESETS = [
  {
    id: 'ollama',
    kind: 'builtin' as const,
    label: 'Ollama',
    baseURL: 'http://127.0.0.1:11434/v1'
  },
  {
    id: 'lmstudio',
    kind: 'builtin' as const,
    label: 'LM Studio',
    baseURL: 'http://127.0.0.1:1234/v1'
  },
  {
    id: 'unsloth',
    kind: 'custom' as const,
    label: 'Unsloth Studio',
    baseURL: 'http://127.0.0.1:8000/v1',
    requiresKey: false
  }
] as const

export type LocalEndpointPresetId = (typeof LOCAL_ENDPOINT_PRESETS)[number]['id']

export interface CustomProviderRecord {
  id: string
  baseURL: string
  label?: string
  requiresKey?: boolean
}

export interface LocalEndpointSettingsSlice {
  providerBaseUrlOverrides?: Record<string, string>
  customProviders?: CustomProviderRecord[]
}

export interface ApplyPresetResult {
  status: 'applied' | 'unchanged'
  settings: {
    providerBaseUrlOverrides: Record<string, string>
    customProviders: CustomProviderRecord[]
  }
  message: string
}

function snapshot(input: LocalEndpointSettingsSlice): ApplyPresetResult['settings'] {
  const providerBaseUrlOverrides =
    input.providerBaseUrlOverrides &&
    typeof input.providerBaseUrlOverrides === 'object' &&
    !Array.isArray(input.providerBaseUrlOverrides)
      ? { ...input.providerBaseUrlOverrides }
      : {}
  const customProviders = Array.isArray(input.customProviders)
    ? input.customProviders.filter((row) => row && typeof row.id === 'string')
    : []
  return { providerBaseUrlOverrides, customProviders }
}

export function applyLocalEndpointPreset(
  id: string,
  input: LocalEndpointSettingsSlice,
  builtinIds: ReadonlySet<string>
): ApplyPresetResult {
  const preset = LOCAL_ENDPOINT_PRESETS.find((row) => row.id === id)
  if (!preset) {
    return {
      status: 'unchanged',
      settings: snapshot(input),
      message: `Unknown local endpoint preset: ${id}`
    }
  }

  const settings = snapshot(input)

  if (preset.kind === 'builtin') {
    const current = (settings.providerBaseUrlOverrides[preset.id] ?? '').trim()
    if (current && current !== preset.baseURL) {
      return {
        status: 'unchanged',
        settings,
        message: `${preset.label} already has a custom base URL; left as-is.`
      }
    }
    if (current === preset.baseURL) {
      return {
        status: 'unchanged',
        settings,
        message: `${preset.label} preset already applied.`
      }
    }
    return {
      status: 'applied',
      settings: {
        ...settings,
        providerBaseUrlOverrides: {
          ...settings.providerBaseUrlOverrides,
          [preset.id]: preset.baseURL
        }
      },
      message: `${preset.label} preset applied (${preset.baseURL}).`
    }
  }

  if (builtinIds.has(preset.id)) {
    return {
      status: 'unchanged',
      settings,
      message: `${preset.label} is a built-in provider; not added as a custom endpoint.`
    }
  }
  if (settings.customProviders.some((row) => row.id === preset.id)) {
    return {
      status: 'unchanged',
      settings,
      message: `${preset.label} endpoint already exists; left as-is.`
    }
  }
  return {
    status: 'applied',
    settings: {
      ...settings,
      customProviders: [
        ...settings.customProviders,
        {
          id: preset.id,
          label: preset.label,
          baseURL: preset.baseURL,
          requiresKey: preset.requiresKey
        }
      ]
    },
    message: `${preset.label} preset added (${preset.baseURL}). Edit the URL if your server uses another port.`
  }
}
