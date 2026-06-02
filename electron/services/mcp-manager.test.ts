import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// mcp-manager imports electron at module load (and constructs the singleton).
// Stub electron so the import resolves without a real Electron host.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', on: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { mcpManager } from './mcp-manager'

// Minimal ServerState shape for scheduleRestart. `transport` is a sentinel
// object; scheduleRestart itself doesn't read it (the transport-identity guard
// lives in the onerror/onclose handlers).
function fakeState(over: Record<string, unknown> = {}) {
  return {
    config: { id: 'srv', command: 'x', args: [] },
    status: 'connected',
    client: null,
    transport: {},
    tools: [],
    restartCount: 0,
    restarting: false,
    ...over
  } as never
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('mcp-manager scheduleRestart — single reconnect (BUG-2)', () => {
  let connectSpy: ReturnType<typeof vi.spyOn>
  let cleanupSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    connectSpy = vi
      .spyOn(mcpManager as never as Record<string, () => Promise<void>>, 'connectServer' as never)
      .mockResolvedValue(undefined as never)
    cleanupSpy = vi
      .spyOn(mcpManager as never as Record<string, () => Promise<void>>, 'cleanupServer' as never)
      .mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reconnects once when the paired error+close events both schedule a restart', async () => {
    const state = fakeState()
    // Simulate transport.onerror then transport.onclose firing back-to-back.
    ;(mcpManager as never as Record<string, (s: unknown) => void>).scheduleRestart(state)
    ;(mcpManager as never as Record<string, (s: unknown) => void>).scheduleRestart(state)

    await flush()

    expect(cleanupSpy).toHaveBeenCalledTimes(1)
    expect(connectSpy).toHaveBeenCalledTimes(1)
    expect((state as unknown as { restartCount: number }).restartCount).toBe(1)
    // Flag is cleared once the reconnect settles, so a later genuine drop can retry.
    expect((state as unknown as { restarting: boolean }).restarting).toBe(false)
  })

  it('does not restart once MAX_RESTARTS is reached', async () => {
    const state = fakeState({ restartCount: 3 }) // MAX_RESTARTS === 3
    ;(mcpManager as never as Record<string, (s: unknown) => void>).scheduleRestart(state)
    await flush()
    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('allows a fresh restart after the previous one settled', async () => {
    const state = fakeState()
    ;(mcpManager as never as Record<string, (s: unknown) => void>).scheduleRestart(state)
    await flush()
    ;(mcpManager as never as Record<string, (s: unknown) => void>).scheduleRestart(state)
    await flush()
    expect(connectSpy).toHaveBeenCalledTimes(2)
    expect((state as unknown as { restartCount: number }).restartCount).toBe(2)
  })
})
