import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const fixture = vi.hoisted(() => ({
  directory: '', roots: [] as { pluginId: string; rootPath: string }[],
  listener: undefined as (() => void) | undefined,
  unsubscribe: vi.fn()
}))
vi.mock('electron', () => ({ app: { getPath: () => fixture.directory }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./plugin-loader', () => ({
  enabledPluginRoots: () => fixture.roots,
  subscribeToPluginChanges: (listener: () => void) => {
    fixture.listener = listener
    return fixture.unsubscribe
  }
}))
vi.mock('./debug-trace', () => ({ trace: vi.fn() }))
vi.mock('./event-log', () => ({ recordEvent: vi.fn() }))
import { McpManager } from './mcp-manager'

let manager: McpManager
const id = 'fixture:server'
function configure(delay = 0, name = 'Fixture') {
  writeFileSync(join(fixture.directory, 'plugin', 'connectors.json'), JSON.stringify([{
    id: 'server', name, transport: 'stdio', command: process.execPath,
    args: [resolve('electron/services/fixtures/mcp-tool-server.cjs')],
    env: { FIXTURE_INIT_DELAY: String(delay) }
  }]))
}
async function connected() {
  await vi.waitFor(() => expect(manager.getServers().find((s) => s.id === id)?.status).toBe('connected'))
}
function pid(): number {
  return (manager as any).pluginServers.get(id).transport.pid
}
function expectExited(child: number) {
  expect(() => process.kill(child, 0)).toThrow()
}
beforeEach(() => {
  fixture.directory = mkdtempSync(join(tmpdir(), 'lamprey-plugin-'))
  mkdirSync(join(fixture.directory, 'plugin'))
  writeFileSync(join(fixture.directory, 'mcp-servers.json'), '[]')
  fixture.roots = [{ pluginId: 'fixture', rootPath: join(fixture.directory, 'plugin') }]
  fixture.unsubscribe.mockReset()
  fixture.listener = undefined
  configure()
  manager = new McpManager()
})
afterEach(async () => {
  await manager.shutdown()
  rmSync(fixture.directory, { recursive: true, force: true })
})

describe('plugin MCP lifecycle with a real stdio child', () => {
  it('discovers, calls, reconnects, disables, enables, uninstalls and drains subscriptions', async () => {
    await manager.initialize()
    await connected()
    expect(manager.getServers()).toHaveLength(1)
    expect(manager.listTools(id).map((t) => t.name)).toContain('second')
    expect(manager.getAllTools().map((s) => s.serverId)).toEqual([id])
    expect(await manager.callTool(id, 'second', {})).toBe('second completed')
    const first = pid()
    await manager.reconnect(id)
    await connected()
    expectExited(first)
    const second = pid()
    fixture.roots = []
    fixture.listener!()
    await vi.waitFor(() => expect(manager.getServers()).toEqual([]))
    expectExited(second)
    fixture.roots = [{ pluginId: 'fixture', rootPath: join(fixture.directory, 'plugin') }]
    fixture.listener!()
    await connected()
    const third = pid()
    rmSync(join(fixture.directory, 'plugin', 'connectors.json'))
    fixture.listener!()
    await vi.waitFor(() => expect(manager.getAllTools()).toEqual([]))
    await vi.waitFor(() => expect(manager.getServers()).toEqual([]))
    expectExited(third)
    configure()
    fixture.listener!()
    await connected()
    const fourth = pid()
    await manager.shutdown()
    expectExited(fourth)
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1)
    fixture.listener!()
    await (manager as any).pluginRefresh
    expect(manager.getServers()).toEqual([])
  })

  it('replaces changed connectors without leaving the old process alive', async () => {
    await manager.initialize()
    await connected()
    const old = pid()
    configure(0, 'Changed')
    fixture.listener!()
    await (manager as any).pluginRefresh
    await connected()
    expectExited(old)
    expect(manager.getServers()[0].name).toBe('Changed')
    expect(await manager.callTool(id, 'stats', {})).toBe('[]')
  })

  it('drains a pending handshake and does not resurrect a child after quit', async () => {
    configure(500)
    await manager.initialize()
    await vi.waitFor(() => expect(pid()).toBeTypeOf('number'))
    const child = pid()
    await manager.shutdown()
    expectExited(child)
    expect(manager.getServers()).toEqual([])
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
