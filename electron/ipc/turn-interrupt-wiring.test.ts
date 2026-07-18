import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string =>
  readFileSync(join(root, path), 'utf8').replace(/\r\n?/g, '\n')

describe('ST-7 interrupt and recovery wiring contract', () => {
  it('exposes strict interrupt IPC and keeps legacy cancel as one compatibility adapter', () => {
    const control = read('electron/ipc/turn-control.ts')
    const preload = read('electron/preload.ts')
    const chat = read('electron/ipc/chat.ts')
    const cancelStart = chat.indexOf("ipcMain.handle('chat:cancel'")
    const cancel = chat.slice(
      cancelStart,
      chat.indexOf("ipcMain.handle('chat:generateTitle'", cancelStart)
    )

    expect(control).toContain("ipcMain.handle('turn:interrupt'")
    expect(preload).toContain("ipcRenderer.invoke('turn:interrupt', request)")
    expect(cancel).toContain('interruptTurn({ conversationId, expectedTurnId: run.turnId })')
    expect(cancel).not.toMatch(/\.abort\(|recordEvent\(|drainPendingDocuments\(/)
  })

  it('contains no background terminal or process cleanup authority', () => {
    const interrupt = read('electron/services/turn-interrupt.ts')
    for (const forbidden of [
      'ptyKill',
      "'terminal:kill'",
      'getLiveHandle',
      'child_process',
      'killProcessTree'
    ]) {
      expect(interrupt).not.toContain(forbidden)
    }
    expect(interrupt).toContain("runtime.abort('user-interrupt')")
    expect(read('electron/ipc/terminal.ts')).toContain("ipcMain.handle('terminal:kill'")
  })

  it('recovers startup orphans before registering turn-control handlers', () => {
    const control = read('electron/ipc/turn-control.ts')
    const recovery = control.slice(
      control.indexOf('export function recoverTurnControlOnStartup'),
      control.indexOf('export interface TurnControlDependencies')
    )
    expect(recovery).toContain('store.recoverOrphans(recoveredAt, reason)')
    expect(recovery).toContain("type: 'turn.recovered'")
    expect(control).toMatch(
      /if \(productionStore\) recoverTurnControlOnStartup\(productionStore, Date\.now\(\)\)\s*\n\s*const actions/
    )
  })

  it('keeps Steering non-preemptive and pending delivery recoverable', () => {
    const actions = read('electron/ipc/turn-control.ts')
    const steering = actions.slice(
      actions.indexOf('function submit('),
      actions.indexOf('\n  return {\n    steer:')
    )
    const interrupt = read('electron/services/turn-interrupt.ts')
    expect(steering).not.toMatch(/\.abort\(|interruptTurn/)
    expect(interrupt.indexOf('recoverPendingSteers(')).toBeLessThan(
      interrupt.indexOf("runtime.abort('user-interrupt')")
    )
  })
})
