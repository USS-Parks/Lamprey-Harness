import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('ST-8 renderer reconciliation wiring', () => {
  it('emits one start identity for interactive and newly-created headless runtimes', () => {
    const chat = read('electron/ipc/chat.ts')
    expect(chat).toMatch(
      /turnRuntime = turnRuntimeRegistry\.register\([\s\S]*?emitTurnStarted\(turnRuntime\)/
    )
    expect(chat).toMatch(/if \(!input\.runtime\) emitTurnStarted\(runtime\)/)
    expect(chat.match(/emitTurnStarted\(/g)).toHaveLength(2)
  })

  it('exposes lifecycle subscriptions and a durable snapshot through preload', () => {
    const preload = read('electron/preload.ts')
    const control = read('electron/ipc/turn-control.ts')
    for (const channel of ['chat:turn-started', 'chat:turn-settled']) {
      expect(preload).toContain(`ipcRenderer.on('${channel}'`)
      expect(preload).toContain(`ipcRenderer.removeListener('${channel}'`)
    }
    expect(preload).toContain("ipcRenderer.invoke('turn:getState', conversationId)")
    expect(control).toContain("ipcMain.handle('turn:getState'")
    expect(control).toContain("active?.status === 'running' && runtime?.turnId === active.id")
    expect(control).toContain('followUps: deps.store.listFollowUps(conversationId)')
  })

  it('stores lifecycle events for every conversation instead of filtering to the visible one', () => {
    const hook = read('src/hooks/useChat.ts')
    const start = hook.slice(
      hook.indexOf('window.api.chat.onTurnStarted'),
      hook.indexOf('window.api.chat.onTurnSettled')
    )
    const settled = hook.slice(
      hook.indexOf('window.api.chat.onTurnSettled'),
      hook.indexOf('window.api.chat.onError')
    )
    expect(start).toContain('applyTurnStarted')
    expect(start).not.toContain('matchesActive')
    expect(settled).toContain('applyTurnSettled')
    expect(settled).not.toContain('matchesActive')
  })

  it('retains the JM-21 navigation and stale-message guards', () => {
    const store = read('src/stores/chat-store.ts')
    const select = store.slice(
      store.indexOf('selectConversation: async'),
      store.indexOf('hydrateTurnControl: async')
    )
    for (const reset of [
      "streamingContent: ''",
      "streamingReasoning: ''",
      'streamingDocuments: []',
      'streamingVitals: null'
    ]) {
      expect(select).toContain(reset)
    }
    expect(select).toContain('if (get().activeConversationId !== id) return')
    expect(select).toContain('getConversationFollowUpState')
    expect(store).toContain('turnControlByConversation: FollowUpStateByConversation')
  })
})
