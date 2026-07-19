import { describe, expect, it, vi } from 'vitest'
import {
  BrowserCdpSessionService,
  type CdpDebuggerLike,
  type CdpDetachListener,
  type CdpMessageListener
} from './browser-cdp-session'

class FakeDebugger implements CdpDebuggerLike {
  attached = false
  attachCalls: Array<string | undefined> = []
  detachCalls = 0
  failVersions = new Set<string | undefined>()
  messages = new Set<CdpMessageListener>()
  detaches = new Set<CdpDetachListener>()
  sendCommand = vi.fn(async () => ({ ok: true }))

  isAttached(): boolean {
    return this.attached
  }

  attach(version?: string): void {
    this.attachCalls.push(version)
    if (this.failVersions.has(version)) throw new Error(`unsupported ${String(version)}`)
    this.attached = true
  }

  detach(): void {
    this.detachCalls += 1
    this.attached = false
  }

  on(event: 'message' | 'detach', listener: CdpMessageListener | CdpDetachListener): void {
    if (event === 'message') this.messages.add(listener as CdpMessageListener)
    else this.detaches.add(listener as CdpDetachListener)
  }

  removeListener(event: 'message' | 'detach', listener: CdpMessageListener | CdpDetachListener): void {
    if (event === 'message') this.messages.delete(listener as CdpMessageListener)
    else this.detaches.delete(listener as CdpDetachListener)
  }

  emitDetach(reason = 'target closed'): void {
    this.attached = false
    for (const listener of [...this.detaches]) listener({}, reason)
  }
}

describe('BrowserCdpSessionService', () => {
  it('stays disabled unless Browser Developer Mode is explicitly enabled', () => {
    const service = new BrowserCdpSessionService(() => false)
    expect(() => service.attach({ id: 'tab-1', debugger: new FakeDebugger() })).toThrow(
      'Browser Developer Mode is disabled'
    )
  })

  it('attaches once and returns the existing owner on reattach', () => {
    const service = new BrowserCdpSessionService(() => true)
    const dbg = new FakeDebugger()
    expect(service.attach({ id: 'tab-1', debugger: dbg })).toMatchObject({
      targetId: 'tab-1',
      protocolVersion: '1.3',
      reattached: false
    })
    expect(service.attach({ id: 'tab-1', debugger: dbg }).reattached).toBe(true)
    expect(dbg.attachCalls).toEqual(['1.3'])
  })

  it('falls back to Electron-selected latest protocol when 1.3 is rejected', () => {
    const service = new BrowserCdpSessionService(() => true)
    const dbg = new FakeDebugger()
    dbg.failVersions.add('1.3')
    expect(service.attach({ id: 'tab-1', debugger: dbg }).protocolVersion).toBe('latest')
    expect(dbg.attachCalls).toEqual(['1.3', undefined])
  })

  it('rejects a second owner for the same target or debugger', () => {
    const service = new BrowserCdpSessionService(() => true)
    const first = new FakeDebugger()
    service.attach({ id: 'tab-1', debugger: first })
    expect(() => service.attach({ id: 'tab-1', debugger: new FakeDebugger() })).toThrow(
      'different owner'
    )
    expect(() => service.attach({ id: 'tab-2', debugger: first })).toThrow(
      'already owned by target tab-1'
    )
  })

  it('cleans up on target close and can attach the replacement target', () => {
    const service = new BrowserCdpSessionService(() => true)
    const first = new FakeDebugger()
    service.attach({ id: 'tab-1', debugger: first })
    first.emitDetach()
    expect(service.get('tab-1')).toBeNull()

    const replacement = new FakeDebugger()
    expect(service.attach({ id: 'tab-1', debugger: replacement }).attached).toBe(true)
  })

  it('detaches and removes listeners when the caller cancels', () => {
    const service = new BrowserCdpSessionService(() => true)
    const dbg = new FakeDebugger()
    const controller = new AbortController()
    service.attach({ id: 'tab-1', debugger: dbg }, { signal: controller.signal })
    controller.abort()
    expect(service.get('tab-1')).toBeNull()
    expect(dbg.detachCalls).toBe(1)
    expect(dbg.messages.size).toBe(0)
    expect(dbg.detaches.size).toBe(0)
  })

  it('allows the legacy preview observer to share the sole CDP owner while disabled', () => {
    const service = new BrowserCdpSessionService(() => false)
    const dbg = new FakeDebugger()
    expect(
      service.attach({ id: 'tab-1', debugger: dbg }, { requireDeveloperMode: false }).attached
    ).toBe(true)
    expect(() => service.attach({ id: 'tab-1', debugger: dbg })).toThrow(
      'Browser Developer Mode is disabled'
    )
  })
})
