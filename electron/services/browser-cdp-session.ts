import { readSettings } from './settings-helper'

export const DEFAULT_CDP_PROTOCOL_VERSIONS = ['1.3', undefined] as const

export type CdpMessageListener = (
  event: unknown,
  method: string,
  params: unknown,
  sessionId?: string
) => void

export type CdpDetachListener = (event: unknown, reason: string) => void

export interface CdpDebuggerLike {
  isAttached(): boolean
  attach(protocolVersion?: string): void
  detach(): void
  sendCommand(
    method: string,
    commandParams?: Record<string, unknown>,
    sessionId?: string
  ): Promise<unknown>
  on(event: 'message', listener: CdpMessageListener): unknown
  on(event: 'detach', listener: CdpDetachListener): unknown
  removeListener(event: 'message', listener: CdpMessageListener): unknown
  removeListener(event: 'detach', listener: CdpDetachListener): unknown
}

export interface BrowserCdpTarget {
  id: string
  debugger: CdpDebuggerLike
}

export interface BrowserCdpSessionSnapshot {
  targetId: string
  protocolVersion: string
  attached: boolean
  reattached: boolean
}

interface Session {
  targetId: string
  debugger: CdpDebuggerLike
  protocolVersion: string
  developerModeConsumer: boolean
  messageListeners: Set<CdpMessageListener>
  onMessage: CdpMessageListener
  onDetach: CdpDetachListener
  abortCleanup?: () => void
}

export interface AttachBrowserCdpOptions {
  /** Legacy preview capture shares the owner but predates Developer Mode. */
  requireDeveloperMode?: boolean
  signal?: AbortSignal
  protocolVersions?: ReadonlyArray<string | undefined>
}

function developerModeEnabled(): boolean {
  return readSettings().browserDeveloperModeEnabled === true
}

function abortError(): Error {
  const error = new Error('Browser CDP session cancelled')
  error.name = 'AbortError'
  return error
}

/**
 * Owns Electron debugger/CDP attachment for every in-app browser target.
 * Consumers subscribe through this service instead of attaching a second
 * debugger client to the same WebContents.
 */
export class BrowserCdpSessionService {
  private readonly sessions = new Map<string, Session>()
  private readonly targetByDebugger = new WeakMap<object, string>()

  constructor(private readonly isDeveloperModeEnabled = developerModeEnabled) {}

  attach(
    target: BrowserCdpTarget,
    options: AttachBrowserCdpOptions = {}
  ): BrowserCdpSessionSnapshot {
    const requiresDeveloperMode = options.requireDeveloperMode !== false
    if (requiresDeveloperMode && !this.isDeveloperModeEnabled()) {
      throw new Error('Browser Developer Mode is disabled')
    }
    if (options.signal?.aborted) throw abortError()

    const existing = this.sessions.get(target.id)
    if (existing) {
      if (existing.debugger !== target.debugger) {
        throw new Error(`CDP target ${target.id} already has a different owner`)
      }
      if (requiresDeveloperMode) existing.developerModeConsumer = true
      this.bindAbort(existing, options.signal)
      return this.snapshot(existing, true)
    }

    const debuggerOwner = this.targetByDebugger.get(target.debugger as object)
    if (debuggerOwner && debuggerOwner !== target.id) {
      throw new Error(`CDP debugger is already owned by target ${debuggerOwner}`)
    }
    if (target.debugger.isAttached()) {
      throw new Error(`CDP target ${target.id} is already attached outside Lamprey's session service`)
    }

    const versions = options.protocolVersions ?? DEFAULT_CDP_PROTOCOL_VERSIONS
    let attachedVersion: string | null = null
    let lastError: unknown
    for (const version of versions) {
      try {
        target.debugger.attach(version)
        attachedVersion = version ?? 'latest'
        break
      } catch (error) {
        lastError = error
        if (target.debugger.isAttached()) {
          try {
            target.debugger.detach()
          } catch {
            // best-effort cleanup after a partially successful attach
          }
        }
      }
    }
    if (!attachedVersion) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error')
      throw new Error(`Unable to attach CDP target ${target.id}: ${detail}`)
    }

    const session = {} as Session
    session.targetId = target.id
    session.debugger = target.debugger
    session.protocolVersion = attachedVersion
    session.developerModeConsumer = requiresDeveloperMode
    session.messageListeners = new Set()
    session.onMessage = (event, method, params, sessionId) => {
      for (const listener of session.messageListeners) {
        listener(event, method, params, sessionId)
      }
    }
    session.onDetach = (_event, _reason) => {
      this.forget(target.id, false)
    }

    target.debugger.on('message', session.onMessage)
    target.debugger.on('detach', session.onDetach)
    this.sessions.set(target.id, session)
    this.targetByDebugger.set(target.debugger as object, target.id)
    this.bindAbort(session, options.signal)
    return this.snapshot(session, false)
  }

  subscribe(targetId: string, listener: CdpMessageListener): () => void {
    const session = this.sessions.get(targetId)
    if (!session) throw new Error(`No CDP session for target ${targetId}`)
    session.messageListeners.add(listener)
    return () => session.messageListeners.delete(listener)
  }

  async sendCommand(
    targetId: string,
    method: string,
    params?: Record<string, unknown>,
    options: { signal?: AbortSignal; sessionId?: string } = {}
  ): Promise<unknown> {
    const session = this.sessions.get(targetId)
    if (!session) throw new Error(`No CDP session for target ${targetId}`)
    if (options.signal?.aborted) throw abortError()

    const command = session.debugger.sendCommand(method, params, options.sessionId)
    if (!options.signal) return command
    return await Promise.race([
      command,
      new Promise<never>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(abortError()), { once: true })
      })
    ])
  }

  detach(targetId: string): boolean {
    return this.forget(targetId, true)
  }

  detachAll(): void {
    for (const targetId of [...this.sessions.keys()]) this.detach(targetId)
  }

  detachDeveloperSessions(): void {
    for (const session of [...this.sessions.values()]) {
      if (session.developerModeConsumer) this.detach(session.targetId)
    }
  }

  get(targetId: string): BrowserCdpSessionSnapshot | null {
    const session = this.sessions.get(targetId)
    return session ? this.snapshot(session, false) : null
  }

  list(): BrowserCdpSessionSnapshot[] {
    return [...this.sessions.values()].map((session) => this.snapshot(session, false))
  }

  private bindAbort(session: Session, signal?: AbortSignal): void {
    if (!signal) return
    session.abortCleanup?.()
    const onAbort = () => this.detach(session.targetId)
    signal.addEventListener('abort', onAbort, { once: true })
    session.abortCleanup = () => signal.removeEventListener('abort', onAbort)
  }

  private forget(targetId: string, detachDebugger: boolean): boolean {
    const session = this.sessions.get(targetId)
    if (!session) return false
    this.sessions.delete(targetId)
    this.targetByDebugger.delete(session.debugger as object)
    session.abortCleanup?.()
    session.debugger.removeListener('message', session.onMessage)
    session.debugger.removeListener('detach', session.onDetach)
    session.messageListeners.clear()
    if (detachDebugger && session.debugger.isAttached()) {
      try {
        session.debugger.detach()
      } catch {
        // target may already be closing
      }
    }
    return true
  }

  private snapshot(session: Session, reattached: boolean): BrowserCdpSessionSnapshot {
    return {
      targetId: session.targetId,
      protocolVersion: session.protocolVersion,
      attached: session.debugger.isAttached(),
      reattached
    }
  }
}

export const browserCdpSessions = new BrowserCdpSessionService()
