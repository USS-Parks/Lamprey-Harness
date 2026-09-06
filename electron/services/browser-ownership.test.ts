import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  const children: unknown[] = []
  const window = { isDestroyed: () => false, webContents: { send: vi.fn() }, contentView: {
    children, addChildView: (view: unknown) => { if (!children.includes(view)) children.push(view) },
    removeChildView: (view: unknown) => { const index = children.indexOf(view); if (index >= 0) children.splice(index, 1) }
  } }
  return { BrowserWindow: { getAllWindows: () => [window] }, WebContentsView: class {
    visible = false
    webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false, loadURL: async () => {}, close: vi.fn(), setWindowOpenHandler: vi.fn(),
      navigationHistory: { canGoBack: () => false, canGoForward: () => false }
    })
    setVisible(value: boolean) { this.visible = value }
    getVisible() { return this.visible }
    setBounds() {}
  } }
})

import { closeTab, getActiveTabId, getTab, listTabs, newTab, setActiveTab, setOwner, setVisible } from './browser-manager'

afterEach(() => {
  for (const owner of ['a', 'b', null]) for (const tab of listTabs(owner)) closeTab(tab.id)
  setOwner(null)
})

describe('browser task ownership', () => {
  it('restores each task selection and prevents another task handle from resolving', async () => {
    setOwner('a')
    const a = await newTab('about:blank', 'a')
    setVisible(true, 'a')
    expect(a.view.getVisible()).toBe(true)
    setOwner('b')
    const b = await newTab('about:blank', 'b')
    setVisible(true, 'b')
    expect(a.view.getVisible()).toBe(false)
    expect(b.view.getVisible()).toBe(true)
    expect(getTab(a.id, 'b')).toBeNull()
    expect(listTabs('b').map(tab => tab.id)).toEqual([b.id])
    setOwner('a')
    setVisible(true, 'a')
    expect(getActiveTabId('a')).toBe(a.id)
    expect(a.view.getVisible()).toBe(true)
    expect(b.view.getVisible()).toBe(false)
  })
  it('background opens and stale hide requests cannot steal foreground visibility', async () => {
    setOwner('a')
    const a = await newTab('about:blank', 'a')
    setVisible(true, 'a')
    const b = await newTab('about:blank', 'b')
    setActiveTab(b.id)
    setVisible(false, 'b')
    expect(getActiveTabId('a')).toBe(a.id)
    expect(a.view.getVisible()).toBe(true)
    expect(b.view.getVisible()).toBe(false)
    closeTab(a.id)
    expect(getActiveTabId('a')).toBeNull()
    expect(b.view.getVisible()).toBe(false)
    expect(listTabs('b')).toHaveLength(1)
  })
  it('ten hide/show cycles reuse a session; close destroys only that session', async () => {
    setOwner('a')
    const a = await newTab('about:blank', 'a')
    for (let i = 0; i < 10; i++) { setVisible(false, 'a'); setVisible(true, 'a') }
    expect(listTabs('a')).toHaveLength(1)
    expect(a.view.webContents.close).not.toHaveBeenCalled()
    closeTab(a.id)
    expect(a.view.webContents.close).toHaveBeenCalledOnce()
    expect(listTabs('a')).toEqual([])
  })
})
