import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'http'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const fixture = vi.hoisted(() => ({ directory: '', handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({
  app: { getPath: () => fixture.directory },
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => fixture.handlers.set(name, handler) }
}))
vi.mock('../keychain', () => ({ getKey: () => 'fixture-only-key', hasKey: () => true }))
vi.mock('../debug-trace', () => ({ trace: vi.fn() }))
vi.mock('../event-log', () => ({ recordEvent: vi.fn() }))
vi.mock('../settings-helper', () => ({
  readSettings: () => JSON.parse(readFileSync(join(fixture.directory, 'settings.json'), 'utf8')),
  writeSettingsFile: (settings: unknown) => writeFileSync(join(fixture.directory, 'settings.json'), JSON.stringify(settings))
}))
import { chatOnce, chatStream, resetProviderClients, resolveModel, setUserDataPathProvider } from './registry'
import { registerModelHandlers } from '../../ipc/model'
import { trace } from '../debug-trace'

const servers: Server[] = []
let revision = 0
function settings(value: unknown) {
  const path = join(fixture.directory, 'settings.json')
  writeFileSync(path, JSON.stringify(value))
  const time = new Date(Date.now() + ++revision * 1000)
  utimesSync(path, time, time)
}
async function receiver() {
  const requests: unknown[] = []
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push(JSON.parse(body))
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ choices: [{ message: { content: 'fixture response' }, finish_reason: 'stop' }] }))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return { url: `http://127.0.0.1:${port}/v1`, requests }
}
beforeEach(() => {
  fixture.directory = mkdtempSync(join(tmpdir(), 'lamprey-destination-'))
  setUserDataPathProvider(() => fixture.directory)
  resetProviderClients()
  registerModelHandlers()
})
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
  resetProviderClients()
  setUserDataPathProvider(null)
  rmSync(fixture.directory, { recursive: true, force: true })
})
const invoke = (name: string, ...args: unknown[]) => fixture.handlers.get(name)!(null, ...args)

describe('custom model destination authority', () => {
  it.each(['rate-limit', 'broken-stream'])('cancels %s backoff without another HTTP request', async (failure) => {
    let requests = 0
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) { /* drain the request */ }
      requests++
      if (failure === 'rate-limit') {
        response.writeHead(429, { 'Content-Type': 'application/json', 'x-should-retry': 'false' })
        response.end(JSON.stringify({ error: { message: 'fixture rate limit' } }))
      } else {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"content":"partial"},"index":0}]}\n\n')
        setTimeout(() => response.destroy(), 30)
      }
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    settings({ customProviders: [{ id: 'fixture-provider', baseURL: `http://127.0.0.1:${port}/v1` }], customModels: [{ id: 'retry-fixture', name: 'Fixture', provider: 'fixture-provider', contextWindow: 8192 }] })
    vi.mocked(trace).mockClear()
    const controller = new AbortController()
    const callbacks = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
    const pending = chatStream([{ role: 'user', content: 'fixture' }], 'retry-fixture', undefined, callbacks, controller.signal)
    await vi.waitFor(() => expect(vi.mocked(trace).mock.calls.some(call => call[0] === 'chatStream.catch.entered')).toBe(true))
    const start = Date.now()
    controller.abort()
    await pending
    expect(Date.now() - start).toBeLessThan(500)
    expect(requests).toBe(1)
    expect(callbacks.onDone).toHaveBeenCalledExactlyOnceWith(failure === 'broken-stream' ? 'partial [cancelled]' : ' [cancelled]', undefined, undefined)
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it('sends only to the configured receiver and refuses removed or unknown destinations', async () => {
    const intended = await receiver()
    const unintended = await receiver()
    const model = { id: 'fixture-model', name: 'Fixture', provider: 'fixture-provider', contextWindow: 8192 }
    const base = { customModels: [model], defaultModel: model.id, providerBaseUrlOverrides: { deepseek: unintended.url } }
    settings({ ...base, customProviders: [{ id: model.provider, baseURL: intended.url }] })
    expect((await chatOnce([{ role: 'user', content: 'fixture only' }], model.id)).content).toBe('fixture response')
    expect(intended.requests).toHaveLength(1)
    settings(base)
    expect(() => resolveModel(model.id)).toThrow(/provider.*unavailable/)
    await expect(chatOnce([{ role: 'user', content: 'must not leave' }], model.id)).rejects.toThrow(/unavailable/)
    await expect(chatStream([], model.id, undefined, { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() })).rejects.toThrow(/unavailable/)
    await expect(chatOnce([], 'unknown-model')).rejects.toThrow(/Unknown model/)
    expect((await invoke('model:list')).data.find((m: any) => m.id === model.id).provider).toBe(model.provider)
    expect(await invoke('model:getActive')).toEqual({ success: true, data: model.id })
    expect(await invoke('model:setActive', model.id)).toMatchObject({ success: false })
    expect(await invoke('model:addCustom', { ...model, id: 'new-model' })).toMatchObject({ success: false })
    expect(unintended.requests).toEqual([])
    expect(intended.requests).toHaveLength(1)
  })

  it('resolves a custom override to the same destination shown in the model list', async () => {
    const intended = await receiver()
    const id = 'deepseek-v4-pro'
    settings({ customProviders: [{ id: 'fixture-provider', baseURL: intended.url }], customModels: [{ id, name: 'Override', provider: 'fixture-provider', contextWindow: 8192 }] })
    expect((await invoke('model:list')).data.find((m: any) => m.id === id).provider).toBe('fixture-provider')
    await chatOnce([{ role: 'user', content: 'fixture only' }], id)
    expect(intended.requests).toHaveLength(1)
  })
})
