import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useModelStore } from './model-store'
import { useChatStore } from './chat-store'
import { useProvidersStore } from './providers-store'

const setActive = vi.fn()
beforeEach(() => {
  setActive.mockReset()
  vi.stubGlobal('window', { setTimeout: vi.fn(), api: { model: { setActive } } })
  useModelStore.setState({ activeModel: 'original' })
  useChatStore.setState({ activeModel: 'original', activeConversationId: null, messages: [] })
})
afterEach(() => vi.unstubAllGlobals())
describe('acknowledged model selection', () => {
  it('keeps the previous chat model on rejection or failure envelope', async () => {
    setActive.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ success: false, error: 'write failed' })
    await useChatStore.getState().setModel('first')
    await useChatStore.getState().setModel('second')
    expect(useChatStore.getState().activeModel).toBe('original')
    expect(useModelStore.getState().activeModel).toBe('original')
  })
  it('waits for acknowledgement and preserves rapid selection order', async () => {
    let finish!: (value: unknown) => void
    setActive.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ success: true })
    const first = useChatStore.getState().setModel('first')
    const second = useChatStore.getState().setModel('original')
    await vi.waitFor(() => expect(setActive).toHaveBeenCalledTimes(1))
    expect(useChatStore.getState().activeModel).toBe('original')
    finish({ success: true })
    await Promise.all([first, second])
    expect(setActive.mock.calls.map(call => call[0])).toEqual(['first', 'original'])
    expect(useChatStore.getState().activeModel).toBe('original')
  })
  it('allows keyless providers while retaining cloud key requirements', () => {
    useProvidersStore.getState().setProviders([{ id: 'local', keyOptional: true, hasKey: false }, { id: 'cloud', hasKey: false }] as any)
    expect(useProvidersStore.getState().canUse('local')).toBe(true)
    expect(useProvidersStore.getState().hasKey('local')).toBe(false)
    expect(useProvidersStore.getState().canUse('cloud')).toBe(false)
    expect(useProvidersStore.getState().canUse('unknown')).toBe(false)
  })
})
