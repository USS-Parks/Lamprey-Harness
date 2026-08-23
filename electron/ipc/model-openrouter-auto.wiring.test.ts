import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('TL-B5 openrouter/auto picker wiring', () => {
  it('model list injects openrouter/auto only when an OpenRouter key exists', () => {
    const src = read('electron/ipc/model.ts')
    expect(src).toMatch(/hasKey\('openrouter'\)/)
    expect(src).toMatch(/OPENROUTER_AUTO_ID/)
    expect(src).toMatch(/openrouter\/auto/)
  })

  it('resolveModel handles the auto id outside MODEL_CATALOG', () => {
    const src = read('electron/services/providers/registry.ts')
    expect(src).toMatch(/OPENROUTER_AUTO_ID = 'openrouter\/auto'/)
    expect(src).toMatch(/modelId === OPENROUTER_AUTO_ID/)
  })

  it('routing panel documents session stickiness', () => {
    const src = read('src/components/settings/OpenRouterRoutingSettings.tsx')
    expect(src).toMatch(/openrouter\/auto/)
    expect(src).toMatch(/stick/)
  })
})
