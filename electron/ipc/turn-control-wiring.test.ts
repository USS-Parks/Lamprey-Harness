import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

const channels = [
  'turn:steer',
  'turn:queue',
  'turn:listFollowups',
  'turn:updateFollowup',
  'turn:reorderFollowups',
  'turn:sendFollowupNow',
  'turn:deleteFollowup'
] as const

describe('ST-4 turn-control wiring contract', () => {
  it('registers every handler and exposes the exact same channels through preload', () => {
    const main = read('electron/ipc/turn-control.ts')
    const preload = read('electron/preload.ts')
    for (const channel of channels) {
      expect(main).toContain(`ipcMain.handle('${channel}'`)
      expect(preload).toContain(`ipcRenderer.invoke('${channel}'`)
    }
    const index = read('electron/ipc/index.ts')
    expect(index).toContain("import { registerTurnControlHandlers } from './turn-control'")
    expect(index).toMatch(/registerChatHandlers\(\)\s*\n\s*registerTurnControlHandlers\(\)/)
  })

  it('keeps every channel on the standard success/data or success/error envelope', () => {
    const main = read('electron/ipc/turn-control.ts')
    expect(main).toMatch(
      /type TurnControlEnvelope<T> =\s*\n\s*\{ success: true; data: T \} \| \{ success: false; error: string; rejection\?: FollowUpRejection \}/
    )
    expect(main).toMatch(/return \{ success: false, error: rejection\.message, rejection \}/)
    expect(main).not.toMatch(/chatStream|chatOnce|runChatRound|runHeadlessTurn/)
  })

  it('validates and guards Steering before persistence, with no Queue fallback', () => {
    const main = read('electron/ipc/turn-control.ts')
    const submitStart = main.indexOf('function submit(')
    const submit = main.slice(submitStart, main.indexOf('\n  return {\n    steer:', submitStart))
    expect(submit.indexOf('validateFollowUpSubmission(raw)')).toBeGreaterThan(-1)
    expect(submit.indexOf('lookupExpected(')).toBeGreaterThan(-1)
    expect(submit.indexOf('createFollowUp({')).toBeGreaterThan(-1)
    expect(submit.indexOf('validateFollowUpSubmission(raw)')).toBeLessThan(
      submit.indexOf('createFollowUp({')
    )
    expect(submit.indexOf('lookupExpected(')).toBeLessThan(submit.indexOf('createFollowUp({'))
    expect(main).not.toMatch(/deliveryMode\s*=\s*['"]queue['"]|fallback.*queue/i)
  })

  it('keeps the canonical request vocabulary mirrored in renderer types', () => {
    const mainTypes = read('electron/services/turn-control-types.ts')
    const rendererTypes = read('src/lib/turn-control-types.ts')
    for (const name of [
      'SteerFollowUpSubmission',
      'QueueFollowUpSubmission',
      'UpdateFollowUpRequest',
      'ReorderFollowUpsRequest',
      'SendFollowUpNowRequest',
      'DeleteFollowUpRequest'
    ]) {
      expect(mainTypes).toContain(name)
      expect(rendererTypes).toContain(name)
    }
  })
})
