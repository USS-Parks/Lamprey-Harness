import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('GA-5 automation and goal management UI wiring', () => {
  it('uses one typed automation panel in settings and the right-panel surface', () => {
    const panel = read('src/components/automations/AutomationsPanel.tsx')
    const settings = read('src/components/settings/AutomationsSettings.tsx')
    expect(settings).toMatch(/<AutomationsPanel \/>/)
    expect(panel).toMatch(/one_shot/)
    expect(panel).toMatch(/schedule/)
    expect(panel).toMatch(/event/)
    expect(panel).toMatch(/monitor/)
    expect(panel).toMatch(/automationDisplayState/)
    expect(panel).toMatch(/Wakes goal/)
  })

  it('exposes honest goal lifecycle, budget, progress, and loop-owner controls', () => {
    const source = read('src/components/settings/PlanGoalSettings.tsx')
    expect(source).toMatch(/goalDisplayState/)
    expect(source).toMatch(/tokenPercent/)
    expect(source).toMatch(/timePercent/)
    expect(source).toMatch(/lifecycleStatus/)
    expect(source).toMatch(/'start'/)
    expect(source).toMatch(/'pause'/)
    expect(source).toMatch(/'resume'/)
    expect(source).toMatch(/'complete'/)
    expect(source).toMatch(/'abort'/)
    expect(source).toMatch(/goalTransition/)
  })

  it('keeps renderer calls on the typed preload IPC surface', () => {
    const preload = read('electron/preload.ts')
    expect(preload).toMatch(/automations:[\s\S]*?kind: 'one_shot' \| 'schedule' \| 'event' \| 'monitor'/)
    expect(preload).toMatch(/goalTransition:[\s\S]*?ipcRenderer\.invoke\('plan:goalTransition'/)
  })
})
