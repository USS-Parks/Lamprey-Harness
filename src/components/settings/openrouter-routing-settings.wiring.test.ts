import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('TL-B4 OpenRouter routing settings panel', () => {
  it('ModelSettings mounts OpenRouterRoutingSettings', () => {
    const src = read('src/components/settings/ModelSettings.tsx')
    expect(src).toMatch(/import \{ OpenRouterRoutingSettings \}/)
    expect(src).toMatch(/<OpenRouterRoutingSettings \/>/)
  })

  it('panel writes the B2/B3 settings keys and stays disabled without an OpenRouter key', () => {
    const src = read('src/components/settings/OpenRouterRoutingSettings.tsx')
    expect(src).toMatch(/openrouterFallbacks/)
    expect(src).toMatch(/openrouterProviderSort/)
    expect(src).toMatch(/openrouterProviderOrder/)
    expect(src).toMatch(/openrouterProviderIgnore/)
    expect(src).toMatch(/hasKey\('openrouter'\)/)
    expect(src).toMatch(/disabled=\{!enabled\}/)
  })
})
