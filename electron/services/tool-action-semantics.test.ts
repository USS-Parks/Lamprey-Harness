// WM-2 — action semantics + the coverage lock that keeps the table from
// drifting as tools are added.

import { describe, expect, it, vi } from 'vitest'
import {
  ANALYZED_TOOLS,
  EXEMPT_MUTATING_TOOLS,
  analyzeToolCall,
  isSimpleReadCommand
} from './tool-action-semantics'

vi.mock('electron', () => ({
  app: { getPath: () => '.tmp-wm2', isReady: () => true },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

const PATCH = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch`

describe('analyzeToolCall — apply_patch', () => {
  it('produces blocking exists + anchors for updates', () => {
    const a = analyzeToolCall('apply_patch', {
      patch: PATCH('*** Update File: src/a.ts\n@@\n-old\n+new')
    })!
    expect(a.malformed).toBeUndefined()
    expect(a.requirements).toContainEqual({
      kind: 'exists', path: 'src/a.ts', severity: 'blocking', opIndex: 0
    })
    expect(a.requirements).toContainEqual({
      kind: 'anchors', path: 'src/a.ts', severity: 'blocking', opIndex: 0
    })
    expect(a.effects).toContainEqual({ kind: 'modifies', path: 'src/a.ts' })
    expect(a.patchOps).toHaveLength(1)
  })

  it('produces absent for adds and exists for deletes', () => {
    const a = analyzeToolCall('apply_patch', {
      patch: PATCH('*** Add File: x.txt\n+hello\n*** Delete File: y.txt')
    })!
    expect(a.requirements).toContainEqual({
      kind: 'absent', path: 'x.txt', severity: 'blocking', opIndex: 0
    })
    expect(a.requirements).toContainEqual({
      kind: 'exists', path: 'y.txt', severity: 'blocking', opIndex: 1
    })
    expect(a.effects).toContainEqual({ kind: 'creates', path: 'x.txt' })
    expect(a.effects).toContainEqual({ kind: 'removes', path: 'y.txt' })
  })

  it('reports malformed patches without throwing', () => {
    const a = analyzeToolCall('apply_patch', { patch: 'not a patch' })!
    expect(a.malformed).toMatch(/Begin Patch/)
    expect(a.requirements).toEqual([])
  })

  it('every op carries a within-workspace requirement', () => {
    const a = analyzeToolCall('apply_patch', {
      patch: PATCH('*** Update File: ../escape.ts\n@@\n-a\n+b')
    })!
    expect(a.requirements[0]).toMatchObject({ kind: 'within-workspace', path: '../escape.ts' })
  })
})

describe('analyzeToolCall — shell_command', () => {
  it('simple reads get blocking exists requirements', () => {
    const a = analyzeToolCall('shell_command', { command: 'cat src/app.ts' })!
    expect(a.requirements).toEqual([
      { kind: 'exists', path: 'src/app.ts', severity: 'blocking' }
    ])
    expect(a.effects).toContainEqual({ kind: 'observes', path: 'src/app.ts' })
  })

  it('compound commands degrade reads to advisory', () => {
    const a = analyzeToolCall('shell_command', { command: 'cat a.txt && cat b.txt' })!
    for (const r of a.requirements) expect(r.severity).toBe('advisory')
  })

  it('grep patterns never attribute as paths', () => {
    const a = analyzeToolCall('shell_command', { command: 'grep -n "foo.bar" src/app.ts' })!
    const paths = a.requirements.map((r) => r.path)
    expect(paths).not.toContain('foo.bar')
    expect(paths).not.toContain('"foo.bar"')
  })

  it('build tools carry unattributed mutation only', () => {
    const a = analyzeToolCall('shell_command', { command: 'npm run build' })!
    expect(a.unattributedMutation).toBe(true)
    expect(a.requirements).toEqual([])
  })

  it('unknown tools return null (pass through)', () => {
    expect(analyzeToolCall('web_search', { query: 'x' })).toBeNull()
    expect(analyzeToolCall('some_mcp__tool', {})).toBeNull()
  })
})

describe('isSimpleReadCommand', () => {
  it('accepts single-segment strict reads and rejects everything else', () => {
    expect(isSimpleReadCommand('cat a.txt')).toBe(true)
    expect(isSimpleReadCommand('Get-Content a.txt')).toBe(true)
    expect(isSimpleReadCommand('cat a.txt > b.txt')).toBe(false)
    expect(isSimpleReadCommand('cat a.txt; rm b')).toBe(false)
    expect(isSimpleReadCommand('grep foo a.txt')).toBe(false)
    expect(isSimpleReadCommand('cat')).toBe(false)
  })
})

describe('WM-2 coverage lock — every mutating native tool is covered or exempt', () => {
  it('holds for the full registered catalog', async () => {
    await import('./tool-packs')
    const { toolRegistry } = await import('./tool-registry')
    const mutatingNatives = toolRegistry
      .getDescriptors()
      .filter((d) => d.providerKind === 'native' && d.mutates)
    expect(mutatingNatives.length).toBeGreaterThan(20)
    const covered = new Set(ANALYZED_TOOLS)
    const missing = mutatingNatives
      .map((d) => d.id)
      .filter((id) => !covered.has(id) && !(id in EXEMPT_MUTATING_TOOLS))
    expect(
      missing,
      `mutating native tools without semantics or a named exemption: ${missing.join(', ')}`
    ).toEqual([])
  })

  it('exemptions do not shadow analyzed tools', () => {
    for (const t of ANALYZED_TOOLS) {
      expect(EXEMPT_MUTATING_TOOLS[t]).toBeUndefined()
    }
  })
})
