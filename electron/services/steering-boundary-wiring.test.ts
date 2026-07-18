import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('ST-5 same-turn Steering boundary wiring', () => {
  it('threads one TurnRuntime through the initial and every recursive model dispatch', () => {
    const chat = read('electron/ipc/chat.ts')
    const run = chat.slice(chat.indexOf('export async function runChatRound('))
    expect(run).toMatch(
      /charCounter\?: \{ sent: number; received: number \},\s*\n\s*runtime\?: TurnRuntime/
    )
    const calls = run.match(/await runChatRound\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3)
    expect(run.match(/charCounter,\s*\n\s*runtime/g)?.length).toBeGreaterThanOrEqual(3)
    expect(chat).not.toMatch(/turn:started|turn-start/)
  })

  it('turns a streamed final answer into an intermediate row before delivering Steering', () => {
    const chat = read('electron/ipc/chat.ts')
    const finalBranch = chat.slice(
      chat.indexOf('if (!effectiveToolCalls || effectiveToolCalls.length === 0)'),
      chat.indexOf('const persistedToolCalls = effectiveToolCalls.map')
    )
    const save = finalBranch.indexOf('const assistantMsg = convStore.saveMessage({')
    const roundEvent = finalBranch.indexOf("emitChatEvent('chat:round-complete'")
    const consume = finalBranch.indexOf('await consumeRootSteersAtBoundary(')
    const recurse = finalBranch.lastIndexOf('await runChatRound(')
    expect(save).toBeGreaterThan(-1)
    expect(roundEvent).toBeGreaterThan(save)
    expect(consume).toBeGreaterThan(roundEvent)
    expect(recurse).toBeGreaterThan(consume)
  })

  it('waits for every tool side effect and result append before consuming Steering', () => {
    const chat = read('electron/ipc/chat.ts')
    const tools = chat.slice(
      chat.indexOf('const resolved: ResolvedToolCall[]'),
      chat.indexOf('const nextRoundReasonings =')
    )
    const dispatch = tools.lastIndexOf('resolveSingleToolCall(')
    const persistResult = tools.indexOf("role: 'tool'")
    const consume = tools.indexOf('await consumeRootSteersAtBoundary(')
    expect(dispatch).toBeGreaterThan(-1)
    expect(persistResult).toBeGreaterThan(dispatch)
    expect(consume).toBeGreaterThan(persistResult)
  })

  it('recovers any undelivered accepted items before runtime settlement', () => {
    const chat = read('electron/ipc/chat.ts')
    const finallyBlock = chat.slice(
      chat.indexOf('} finally {', chat.indexOf('export async function runHeadlessTurn')),
      chat.indexOf('/**\n * HY2', chat.indexOf('export async function runHeadlessTurn'))
    )
    expect(finallyBlock.indexOf('recoverPendingRuntimeSteers(')).toBeGreaterThan(-1)
    expect(finallyBlock.indexOf('recoverPendingRuntimeSteers(')).toBeLessThan(
      finallyBlock.indexOf('settleTurnRuntimeSafely(')
    )
  })

  it('emits a bounded user-message event with metadata but no URL, bytes, or path', () => {
    const delivery = read('electron/services/steer-delivery.ts')
    const emit = delivery.slice(
      delivery.indexOf("emitChatEvent('chat:user-message'"),
      delivery.indexOf("emitChatEvent('chat:user-message'") + 700
    )
    expect(emit).toContain('clientUserMessageId: input.steer.clientUserMessageId')
    expect(emit).toContain('inputMetadata: input.inputMetadata')
    expect(emit).not.toMatch(/imageUrl|dataUrl|\.path\b|input\.steer\.input/)
  })

  it('keeps the renderer streaming across an intermediate round and renders the Steer once', () => {
    const preload = read('electron/preload.ts')
    const hook = read('src/hooks/useChat.ts')
    const store = read('src/stores/chat-store.ts')
    expect(preload).toContain("ipcRenderer.on('chat:round-complete'")
    expect(preload).toContain("ipcRenderer.on('chat:user-message'")
    expect(hook).toContain('continueStreamAfterRound(e.message as any)')
    expect(hook).toContain('appendSteerUserMessage(e.message as any)')
    expect(store).toMatch(
      /continueStreamAfterRound:[\s\S]*?isStreaming: true,[\s\S]*?streamingContent: ''/
    )
    expect(store).toMatch(
      /appendSteerUserMessage:[\s\S]*?some\(\(existing\) => existing\.id === message\.id\)/
    )
    expect(store).toMatch(
      /finishStream:[\s\S]*?some\(\(existing\) => existing\.id === message\.id\)/
    )
  })
})
