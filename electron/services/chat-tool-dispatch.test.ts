import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const state = vi.hoisted(() => ({
  preHook: vi.fn(async () => ({ blocked: false })),
  approval: vi.fn(async () => ({ decision: 'allow', source: 'test' })),
  end: vi.fn(), events: vi.fn(), plan: false, unknown: false, needsApproval: false
}))
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('No user directory in fixture') } }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./debug-trace', () => ({ trace: vi.fn() }))
vi.mock('./conversation-store', () => ({ isPlanModeActive: () => state.plan }))
vi.mock('./hooks-runner', () => ({ fireHooks: () => state.preHook() }))
vi.mock('./chat-events', () => ({ emitChatEvent: (...args: unknown[]) => state.events(...args) }))
vi.mock('./permissions-store', () => ({
  descriptorNeedsApproval: () => state.needsApproval,
  permissionsService: { requestApprovalDetailed: () => state.approval() }
}))
vi.mock('./tool-registry', () => ({
  isMutatingDescriptor: (descriptor: unknown) => !!descriptor,
  isParallelizableDescriptor: () => false,
  toolRegistry: {
    getById: (id: string) => state.unknown ? undefined : ({ id, name: id, providerId: 'fixture', providerKind: 'mcp', risks: [], inputSchema: { type: 'object' } }),
    recordCallStart: vi.fn(), recordCallEnd: (...args: unknown[]) => state.end(...args), hasHandler: () => false
  }
}))
import { mcpManager, __setMcpCallTimeoutForTesting } from './mcp-manager'
import { resolveSingleToolCall, resolveToolCallWindows } from './chat-tool-dispatch'
import { TurnRuntimeRegistry } from './turn-runtime'
import type { TurnId } from './turn-control-types'

let client: Client | undefined
afterEach(async () => {
  await client?.close()
  client = undefined
  ;(mcpManager as any).servers.clear()
  __setMcpCallTimeoutForTesting(null)
  state.preHook.mockReset().mockResolvedValue({ blocked: false })
  state.approval.mockReset().mockResolvedValue({ decision: 'allow', source: 'test' })
  state.end.mockClear(); state.events.mockClear()
  state.plan = false; state.unknown = false; state.needsApproval = false
})
const call = (name: string) => ({ id: name, function: { name: `fixture__${name}`, arguments: '{}' } })
async function connect() {
  client = new Client({ name: 'lamprey-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('electron/services/fixtures/mcp-tool-server.cjs')] }))
  ;(mcpManager as any).servers.set('fixture', { client, status: 'connected' })
  __setMcpCallTimeoutForTesting(2000)
}
async function observedCalls(): Promise<string[]> {
  const result = await client!.callTool({ name: 'stats', arguments: {} })
  return JSON.parse((result.content as { text: string }[])[0].text)
}

describe('tool dispatch authority and cancellation', () => {
  it('stops the next real stdio operation and preserves replacement turn ownership', async () => {
    await connect()
    const registry = new TurnRuntimeRegistry({ createTurn: () => null, settleTurn: () => true })
    const old = registry.register({ conversationId: 'c', correlationId: 'old', turnId: 'old' as TurnId })
    const pending = resolveToolCallWindows([call('first'),call('second')], 'c','model','.',old.signal)
    const rejected = expect(pending).rejects.toBeDefined()
    await vi.waitFor(async () => expect(await observedCalls()).toEqual(['first']))
    old.abort('cancel fixture')
    registry.settle(old, 'cancelled')
    const replacement = registry.register({ conversationId: 'c', correlationId: 'new', turnId: 'new' as TurnId })
    await rejected
    expect(await observedCalls()).toEqual(['first'])
    expect(registry.settle(old, 'completed')).toBe(false)
    expect(registry.lookupActive('c')).toBe(replacement)
    expect(state.events.mock.calls.some(([event]) => event === 'chat:tool-call-result')).toBe(false)
    expect(state.end).toHaveBeenCalledWith('first', expect.objectContaining({ status: 'error' }))
  })
  it('rechecks abort after an asynchronous pre-tool hook', async () => {
    await connect()
    const controller = new AbortController()
    state.preHook.mockImplementationOnce(async () => { controller.abort(); return { blocked: false } })
    await expect(resolveSingleToolCall(call('second'),'c','model','.',controller.signal)).rejects.toBeDefined()
    expect(await observedCalls()).toEqual([])
  })
  it('rechecks abort after approval and before any tool or hook executes', async () => {
    await connect()
    const controller = new AbortController()
    state.needsApproval = true
    state.approval.mockImplementationOnce(async () => { controller.abort(); return { decision: 'allow', source: 'test' } })
    await expect(resolveSingleToolCall(call('second'),'c','model','.',controller.signal)).rejects.toBeDefined()
    expect(await observedCalls()).toEqual([])
    expect(state.preHook).not.toHaveBeenCalled()
  })
})
