import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useComposerStore } from './composer-store'
const getDraft = vi.fn()
const setDraft = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  getDraft.mockResolvedValue({ success: true, data: { text: '', attachments: [] } })
  setDraft.mockResolvedValue({ success: true })
  vi.stubGlobal('window', { api: { conversation: { getDraft, setDraft } } })
  useComposerStore.setState({ drafts: {} })
})
afterEach(() => vi.unstubAllGlobals())
describe('composer persistence under delayed IPC', () => {
  it('does not overwrite a new edit when an older load arrives', async () => {
    let finish!: (value: unknown) => void
    getDraft.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const loading = useComposerStore.getState().load('one')
    await vi.waitFor(() => expect(getDraft).toHaveBeenCalled())
    useComposerStore.getState().patch('one', { text: 'Newer local edit' })
    finish({ success: true, data: { text: 'Old saved draft', attachments: [] } })
    await loading
    expect(useComposerStore.getState().drafts.one.text).toBe('Newer local edit')
    await useComposerStore.getState().retry('one')
  })
  it('serializes writes and retains failed drafts for explicit retry', async () => {
    let finish!: (value: unknown) => void
    setDraft.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockRejectedValueOnce(new Error('Disk full'))
    useComposerStore.getState().patch('one', { text: 'First' })
    useComposerStore.getState().patch('one', { text: 'Second' })
    await vi.waitFor(() => expect(setDraft).toHaveBeenCalledTimes(1))
    finish({ success: true })
    await vi.waitFor(() => expect(useComposerStore.getState().drafts.one.error).toContain('Disk full'))
    expect(useComposerStore.getState().drafts.one.text).toBe('Second')
    await useComposerStore.getState().retry('one')
    expect(setDraft.mock.calls.map(call => call[1].text)).toEqual(['First', 'Second', 'Second'])
    expect(useComposerStore.getState().drafts.one.error).toBeNull()
  })
  it('keeps attachment processing and persistence independent across owners', async () => {
    useComposerStore.getState().processing('one', true)
    useComposerStore.getState().processing('one', true)
    useComposerStore.getState().patch('two', { text: 'Other owner' })
    useComposerStore.getState().processing('one', false)
    expect(useComposerStore.getState().drafts.one.processing).toBe(1)
    expect(useComposerStore.getState().drafts.two.processing).toBe(0)
    await useComposerStore.getState().retry('two')
    expect(setDraft.mock.calls.every(call => call[0] === 'two')).toBe(true)
  })
  it('does not clear an unsent new-task draft when its destination save fails', async () => {
    useComposerStore.getState().patch(null, { text: 'Keep new task' })
    await useComposerStore.getState().retry(null)
    setDraft.mockResolvedValueOnce({ success: false, error: 'No space' })
    await useComposerStore.getState().move(null, 'created')
    expect(useComposerStore.getState().drafts.__new__.text).toBe('Keep new task')
    expect(useComposerStore.getState().drafts.created.text).toBe('Keep new task')
    expect(useComposerStore.getState().drafts.created.error).toContain('No space')
  })
})
