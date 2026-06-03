import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory fs so loadConfigs's read/validate/backup/regenerate path can be
// exercised without touching disk. `copies` records copyFileSync calls (the
// corrupt-file backup).
const h = vi.hoisted(() => ({
  store: {} as Record<string, string>,
  copies: [] as Array<[string, string]>
}))

vi.mock('fs', () => ({
  existsSync: (p: string) => p in h.store,
  readFileSync: (p: string) => h.store[p],
  writeFileSync: (p: string, data: string) => {
    h.store[p] = data
  },
  copyFileSync: (src: string, dst: string) => {
    h.copies.push([src, dst])
    h.store[dst] = h.store[src]
  }
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/cfg' },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { loadConfigs } from './mcp-manager'

const CONFIG = '/cfg/mcp-servers.json'

beforeEach(() => {
  for (const k of Object.keys(h.store)) delete h.store[k]
  h.copies.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('loadConfigs (BUG-5)', () => {
  it('returns a valid config array unchanged (no backup)', () => {
    const valid = [{ id: 'srv-a', transport: 'stdio' }]
    h.store[CONFIG] = JSON.stringify(valid)
    const out = loadConfigs()
    expect(out.map((c) => c.id)).toContain('srv-a')
    expect(h.copies).toHaveLength(0)
  })

  it('backs up corrupt JSON and regenerates defaults', () => {
    h.store[CONFIG] = '{ this is not json'
    const out = loadConfigs()
    expect(h.copies).toHaveLength(1) // backed up before overwriting
    expect(h.copies[0][1]).toMatch(/mcp-servers\.json\.bak-\d+$/)
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0) // defaults written
    // The file on disk was regenerated (valid JSON now).
    expect(() => JSON.parse(h.store[CONFIG])).not.toThrow()
  })

  it('treats a non-array (or id-less) JSON value as corrupt and backs it up', () => {
    h.store[CONFIG] = JSON.stringify({ not: 'an array' })
    const out = loadConfigs()
    expect(h.copies).toHaveLength(1)
    expect(Array.isArray(out)).toBe(true)
  })

  it('writes defaults without a backup when the file is missing', () => {
    const out = loadConfigs()
    expect(h.copies).toHaveLength(0)
    expect(Array.isArray(out)).toBe(true)
    expect(h.store[CONFIG]).toBeDefined()
  })
})
