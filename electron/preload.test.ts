import { describe, it, expect, vi } from 'vitest'

// Capture the `api` object the preload exposes, and spy the ipcRenderer calls,
// so we can assert the on* helpers register a listener and return a scoped
// unsubscribe (BUG-6) rather than relying on a removeAllListeners sledgehammer.
const h = vi.hoisted(() => ({
  api: undefined as Record<string, any> | undefined,
  on: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, obj: Record<string, any>) => {
      h.api = obj
    }
  },
  ipcRenderer: {
    on: h.on,
    removeListener: h.removeListener,
    removeAllListeners: h.removeAllListeners,
    invoke: vi.fn()
  },
  webUtils: { getPathForFile: vi.fn() }
}))

import './preload'

const api = () => h.api!
const handlerFor = (channel: string) =>
  h.on.mock.calls.find((c) => c[0] === channel)?.[1]

describe('preload IPC subscription contract (BUG-6)', () => {
  it('chat.onError registers a listener and returns a scoped unsubscribe', () => {
    h.on.mockClear()
    h.removeListener.mockClear()
    const unsub = api().chat.onError(vi.fn())
    expect(h.on).toHaveBeenCalledWith('chat:error', expect.any(Function))
    expect(typeof unsub).toBe('function')

    const handler = handlerFor('chat:error')
    unsub()
    expect(h.removeListener).toHaveBeenCalledWith('chat:error', handler)
  })

  it('the unsubscribe removes exactly the handler it added — never removeAllListeners', () => {
    h.on.mockClear()
    h.removeListener.mockClear()
    h.removeAllListeners.mockClear()
    const unsub = api().chat.onChunk(vi.fn())
    const handler = handlerFor('chat:chunk')
    unsub()
    expect(h.removeListener).toHaveBeenCalledWith('chat:chunk', handler)
    expect(h.removeAllListeners).not.toHaveBeenCalled()
  })

  it('chat no longer exposes the removeAllListeners-based offAll', () => {
    expect(api().chat.offAll).toBeUndefined()
  })

  it('app.onError and app.onWarning also return unsubscribers', () => {
    expect(typeof api().app.onError(vi.fn())).toBe('function')
    expect(typeof api().app.onWarning(vi.fn())).toBe('function')
  })
})
