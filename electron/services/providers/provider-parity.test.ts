import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PROVIDERS, MODEL_CATALOG } from './registry'

// Source-lock: the main-process ProviderId union (registry.ts) and the
// renderer mirror (src/lib/types.ts) must stay member-identical. The renderer
// cannot import electron code, so the mirror is hand-maintained — the same
// drift shape that shipped the SP-1 defaults bug. This test makes the drift
// impossible to land.

const repoRoot = join(__dirname, '..', '..', '..')

function unionMembers(relPath: string): string[] {
  const source = readFileSync(join(repoRoot, relPath), 'utf-8')
  const decl = source.match(/export type ProviderId =([\s\S]*?)\n\s*\n/)
  if (!decl) throw new Error(`ProviderId declaration not found in ${relPath}`)
  return [...decl[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
}

describe('ProviderId union parity (main ↔ renderer)', () => {
  const mainMembers = unionMembers('electron/services/providers/registry.ts')
  const rendererMembers = unionMembers('src/lib/types.ts')

  it('both unions declare at least the original five providers', () => {
    for (const id of ['deepseek', 'google', 'dashscope', 'openrouter', 'zhipu']) {
      expect(mainMembers).toContain(id)
    }
  })

  it('renderer union is member-identical to the main-process union', () => {
    expect(rendererMembers).toEqual(mainMembers)
  })

  it('the PROVIDERS table covers exactly the union members', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...mainMembers].sort())
  })

  it('every catalog model points at a provider that exists in PROVIDERS', () => {
    for (const m of MODEL_CATALOG) {
      expect(
        Object.prototype.hasOwnProperty.call(PROVIDERS, m.provider),
        `${m.id} references unknown provider '${m.provider}'`
      ).toBe(true)
    }
  })
})
