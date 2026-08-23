import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CONNECTORS_CATALOG } from '../../data/connectors-catalog'

const flowSource = readFileSync(join(__dirname, 'AddConnectorFlow.tsx'), 'utf-8')

describe('TR-4 AddConnectorFlow catalog smoke', () => {
  it('reads CONNECTORS_CATALOG from the dual-catalog module', () => {
    expect(flowSource).toMatch(
      /import\s+\{[^}]*CONNECTORS_CATALOG[^}]*\}\s+from\s+'@\/data\/connectors-catalog'/
    )
    expect(flowSource).toMatch(/for \(const e of CONNECTORS_CATALOG\)/)
  })

  it('catalog exposes the K2 ids and is ten entries', () => {
    const ids = CONNECTORS_CATALOG.map((e) => e.id)
    expect(ids).toHaveLength(10)
    for (const id of ['linear', 'sentry', 'notion', 'slack'] as const) {
      expect(ids).toContain(id)
    }
    expect(ids).not.toContain('fetch')
  })
})
