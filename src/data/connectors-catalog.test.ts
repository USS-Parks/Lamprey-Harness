import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CONNECTORS_CATALOG } from './connectors-catalog'

const repoRoot = join(__dirname, '..', '..')

interface JsonCatalog {
  entries: Array<{
    id: string
    name: string
    command?: string
    args?: string[]
    auth: string
    category: string
    env?: Record<string, string>
  }>
}

function loadJsonCatalog(): JsonCatalog {
  const raw = readFileSync(join(repoRoot, 'resources', 'connectors', 'catalog.json'), 'utf-8')
  return JSON.parse(raw) as JsonCatalog
}

describe('TR-3 dual catalog parity', () => {
  it('JSON entries match CONNECTORS_CATALOG ids and template fields', () => {
    const json = loadJsonCatalog()
    const jsonIds = json.entries.map((e) => e.id)
    const tsIds = CONNECTORS_CATALOG.map((e) => e.id)
    expect(jsonIds).toEqual(tsIds)

    for (const ts of CONNECTORS_CATALOG) {
      const disk = json.entries.find((e) => e.id === ts.id)
      expect(disk, `json missing id ${ts.id}`).toBeDefined()
      if (!disk) continue
      expect(disk.name).toBe(ts.name)
      expect(disk.command).toBe(ts.command)
      expect(disk.args ?? []).toEqual(ts.args ?? [])
      expect(disk.auth).toBe(ts.auth)
      expect(disk.category).toBe(ts.category)
      expect(Object.keys(disk.env ?? {}).sort()).toEqual(Object.keys(ts.env ?? {}).sort())
    }
  })
})
