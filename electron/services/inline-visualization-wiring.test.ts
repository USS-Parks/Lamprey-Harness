import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('VA-3 inline visualization wiring and isolation', () => {
  it('persists visualization identities on assistant messages and rehydrates them', () => {
    const chat = read('electron/ipc/chat.ts')
    const store = read('electron/services/conversation-store.ts')
    expect(chat).toContain('drainPendingArtifacts(correlationId)')
    expect(chat).toContain('artifacts')
    expect(store).toContain('artifactsJson')
    expect(store).toContain('linkArtifactToMessage')
    expect(store).toContain('JSON.parse(row.artifacts)')
  })

  it('bridges live state and renders historical plus streaming cards', () => {
    const preload = read('electron/preload.ts')
    const hook = read('src/hooks/useChat.ts')
    const bubble = read('src/components/chat/MessageBubble.tsx')
    const list = read('src/components/chat/MessageList.tsx')
    expect(preload).toContain("ipcRenderer.on('chat:visualization-state'")
    expect(preload).toContain("ipcRenderer.invoke('artifact:read'")
    expect(hook).toContain('upsertStreamingVisualization')
    expect(bubble).toContain('visualizations={message.artifacts}')
    expect(list).toContain('visualizations={streamingVisualizations}')
  })

  it('never injects artifact source into the chat DOM', () => {
    const card = read('src/components/chat/VisualizationCardRow.tsx')
    expect(card).not.toContain('dangerouslySetInnerHTML')
    expect(card).not.toMatch(/<iframe|<webview/i)
    expect(card).toContain("securityLevel: 'strict'")
    expect(card).toContain('svgDataUrl')
    expect(card).toContain('window.api.artifact.openInWindow')
    expect(card).toContain('Interactive content is isolated from the chat')
  })

  it('retains the sandbox process and navigation boundaries', () => {
    const sandbox = read('electron/services/artifact-sandbox.ts')
    expect(sandbox).toContain('sandbox: true')
    expect(sandbox).toContain('contextIsolation: true')
    expect(sandbox).toContain('nodeIntegration: false')
    expect(sandbox).toContain("connect-src 'none'")
    expect(sandbox).toContain("setWindowOpenHandler(() => ({ action: 'deny' }))")
    expect(sandbox).toContain("on('will-navigate', (event) => event.preventDefault())")
  })
})
