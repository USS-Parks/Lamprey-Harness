import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

const taskChannels = [
  'tasks:graph',
  'tasks:readGraphTask',
  'tasks:waitGraph',
  'tasks:updateMetadata',
  'tasks:previewDelete',
  'tasks:deleteGraphTask'
] as const

describe('TC-6 task-control renderer wiring', () => {
  it('keeps every graph/lifecycle IPC channel paired in main and preload', () => {
    const main = read('electron/ipc/tasks.ts')
    const preload = read('electron/preload.ts')
    for (const channel of taskChannels) {
      expect(main).toContain(`'${channel}'`)
      expect(preload).toContain(`'${channel}'`)
    }
  })

  it('surfaces graph, unread, wait, steering, interrupt, and lifecycle controls', () => {
    const panel = read('src/components/activity/TaskControlPanel.tsx')
    const dashboard = read('src/components/activity/ActivityDashboard.tsx')
    expect(dashboard).toContain('<TaskControlPanel />')
    for (const evidence of [
      'unreadCount',
      'waitGraph',
      'window.api.turn.steer',
      'window.api.turn.interrupt',
      'updateMetadata',
      'previewDelete',
      'deleteGraphTask'
    ]) {
      expect(panel).toContain(evidence)
    }
  })

  it('routes user Steering through the exact active turn and never Queue fallback', () => {
    const panel = read('src/components/activity/TaskControlPanel.tsx')
    expect(panel).toContain("deliveryMode: 'steer'")
    expect(panel).toContain('expectedTurnId: String(activeTurn.metadata.entityId)')
    expect(panel).not.toContain('window.api.turn.queue')
  })
})
