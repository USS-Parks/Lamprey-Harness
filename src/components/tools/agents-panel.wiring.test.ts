import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// AO-10 — source-lock the Agents inventory UI wiring (WC-8 / era-chrome pattern).

const root = join(__dirname, '..', '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('AO-10 Agents UI wiring', () => {
  it("ui-store ToolId includes 'agents'", () => {
    expect(read('src/stores/ui-store.ts')).toMatch(/\|\s*'agents'/)
  })

  it('ToolsPanel imports + renders + labels the Agents panel', () => {
    const src = read('src/components/tools/ToolsPanel.tsx')
    expect(src).toMatch(/import \{ AgentsPanel \}/)
    expect(src).toMatch(/case 'agents':[\s\S]*?<AgentsPanel \/>/)
    expect(src).toMatch(/agents: 'Agents'/)
  })

  it('RightPanelHome registers the Agents pill', () => {
    const src = read('src/components/artifacts/RightPanelHome.tsx')
    expect(src).toMatch(/id: 'agents'/)
    expect(src).toMatch(/label: 'Agents'/)
  })

  it('AgentsPanel reads agents IPC + gates on the master toggle', () => {
    const src = read('src/components/tools/panels/AgentsPanel.tsx')
    expect(src).toMatch(/window\.api\.agents\.list/)
    expect(src).toMatch(/window\.api\.agents\.revoke/)
    expect(src).toMatch(/orchestrationEnabled/)
  })

  it('preload exposes the agents surface', () => {
    const src = read('electron/preload.ts')
    expect(src).toMatch(/agents:\s*\{/)
    expect(src).toMatch(/'agents:list'/)
    expect(src).toMatch(/'agents:revoke'/)
  })
})
