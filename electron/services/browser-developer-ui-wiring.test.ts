import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('BD-5 Browser Developer UI wiring', () => {
  it('routes every developer control through typed preload IPC', () => {
    const ipc = source('electron/ipc/browser.ts')
    const preload = source('electron/preload.ts')
    for (const action of [
      'Status', 'SetEnabled', 'SetSitePolicy', 'Attach', 'Detach', 'Capture', 'Clear'
    ]) {
      expect(ipc).toContain(`browser:developer${action}`)
      expect(preload).toContain(`browser:developer${action}`)
    }
    expect(ipc).toContain('browserDeveloperObserver.clearAll()')
    expect(ipc).toContain('browserCdpSessions.detachDeveloperSessions()')
    expect(ipc).toContain('setBrowserDeveloperSitePolicy')
  })

  it('shows target, recording progress, site trust, evidence, and annotations', () => {
    const panel = source('src/components/tools/panels/BrowserPanel.tsx')
    for (const label of [
      'Developer Mode', 'Target:', 'Recording', 'Console', 'Network', 'Attach + record',
      'Detach', 'Clear evidence', 'Capture screenshot', 'Captured browser evidence',
      'Annotations:'
    ]) expect(panel).toContain(label)
    expect(panel).toContain('developerSetSitePolicy')
    expect(panel).toContain('window.setInterval')
  })

  it('keeps the owner smoke procedure in the project planning record', () => {
    const playbook = source('PLANNING/CJ26_BROWSER_DEVELOPER_PLAYBOOK.md')
    expect(playbook).toContain('USER-VERIFICATION-NEEDED')
    expect(playbook).toContain('Attach + record')
    expect(playbook).toContain('Clear evidence')
  })
})
