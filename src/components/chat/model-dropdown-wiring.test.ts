import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'ModelDropdown.tsx'), 'utf8')
const apiKeySettings = readFileSync(join(__dirname, '..', 'settings', 'ApiKeySettings.tsx'), 'utf8')

describe('model dropdown viewport contract', () => {
  it('bounds the expanded catalog to the viewport and keeps it scrollable', () => {
    expect(source).toContain('max-h-[min(70vh,36rem)]')
    expect(source).toContain('overflow-y-auto')
    expect(source).toContain('overscroll-contain')
    expect(source).not.toMatch(
      /bottom-full right-0 z-30 mb-1 w-72 overflow-hidden rounded-lg/
    )
  })

  it('scrolls the active model into the bounded list and exposes menu semantics', () => {
    expect(source).toContain("querySelector<HTMLElement>('[data-active-model=\"true\"]')")
    expect(source).toContain("scrollIntoView({ block: 'nearest' })")
    expect(source).toContain('role="menu"')
    expect(source).toContain('role="menuitemradio"')
    expect(source).toContain("data-active-model={m.id === activeModel ? 'true' : undefined}")
  })

  it('refreshes key state and uses the authoritative catalog without fallback aliases', () => {
    expect(source).toContain('}, [open, refreshProviders])')
    expect(apiKeySettings).toContain('useProvidersStore.getState().setProviders(entries)')
    expect(source).toContain('useModelStore(s => s.models)')
    expect(source).not.toContain('fallback:')
    expect(source).toContain('await setModel(id)')
    expect(source).toContain('onRequestKey(model.provider)')
    expect(source).not.toContain("provider: 'openrouter'")
  })
})
