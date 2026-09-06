import { SETTINGS_LEAVES } from '@/lib/settings-navigation'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('AC-20/AC-22/AC-23/AC-24 settings and tool-search wiring', () => {
  it('SettingsDialog retains the Tools section in grouped navigation', () => {
    const src = read('src/components/settings/SettingsDialog.tsx')
    expect(src).toMatch(/import \{ ToolSettings \}/)
    expect(read('src/lib/settings-navigation.ts')).toMatch(/id: 'tools', label: 'Tools'/)
    expect(src).toContain('SETTINGS_LEAVES as TABS')
    expect(src).toMatch(/activeTab === 'tools' && <ToolSettings \/>/)
  })

  it('SettingsTabId includes every SettingsDialog tab', () => {
    const ui = read('src/stores/ui-store.ts')
    const tabIds = SETTINGS_LEAVES.map(leaf => leaf.id)
    expect(tabIds).toHaveLength(24)
    for (const id of tabIds) {
      expect(ui, `SettingsTabId missing '${id}'`).toMatch(new RegExp(`\\|\\s*'${id}'`))
    }
  })

  it('ToolSettings binds surface + spill and has no Browser Developer toggle', () => {
    const src = read('src/components/settings/ToolSettings.tsx')
    expect(src).toMatch(/toolSurface/)
    expect(src).toMatch(/toolResultSpill/)
    expect(src).toMatch(/toolResultSpillBytes/)
    expect(src).toMatch(/Armed from the Browser panel/)
    expect(src).not.toMatch(/browserDeveloperModeEnabled/)
  })

  it('LoopSettings names chars/4 and the multi-round undercount', () => {
    const src = read('src/components/settings/LoopSettings.tsx')
    expect(src).toMatch(/chars\/4/)
    expect(src).toMatch(/under-?count/)
  })

  it('ToolUseCard renders tool_search matches', () => {
    const src = read('src/components/chat/ToolUseCard.tsx')
    expect(src).toMatch(/parseToolSearchMatches/)
    expect(src).toMatch(/toolName === 'tool_search'/)
  })
})
