import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'ChatInput.tsx'), 'utf8')

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
})
