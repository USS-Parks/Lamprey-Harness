import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from './chat-store'
import { useComposerStore } from './composer-store'
import type { ProcessedFile } from '@/lib/types'
import type { TurnFollowUpRecord } from '@/lib/turn-control-types'

const queue = vi.fn()
const steer = vi.fn()
const deleteFollowup = vi.fn()
const file = (name: string): ProcessedFile => ({ name, kind: 'text', mimeType: 'text/plain', size: 4, content: name, previewText: name })
beforeEach(() => {
  vi.resetAllMocks()
  useComposerStore.setState({ drafts: {} })
  vi.stubGlobal('window', { api: { turn: { queue, steer, deleteFollowup, getState: vi.fn().mockResolvedValue({ success: false }) } } })
  useChatStore.setState({ activeConversationId: 'owner', activeTurn: null, pendingAttachments: [], followUps: [], turnControlByConversation: {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('follow-up submission ownership and recovery', () => {
  it('clears only the attachments submitted, keeping later additions', async () => {
    let finish!: (value: unknown) => void
    queue.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const submitted = file('submitted.txt')
    const later = file('later.txt')
    useChatStore.setState({ pendingAttachments: [submitted] })
    const pending = useChatStore.getState().submitFollowUp('First', 'queue', 'retry-id')
    useChatStore.setState({ pendingAttachments: [submitted, later] })
    finish({ success: true })
    expect((await pending).success).toBe(true)
    expect(useChatStore.getState().pendingAttachments).toEqual([later])
  })
  it('does not clear another task attachments after delayed acknowledgement', async () => {
    let finish!: (value: unknown) => void
    queue.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const first = file('first.txt')
    const other = file('other.txt')
    useChatStore.setState({ pendingAttachments: [first] })
    const pending = useChatStore.getState().submitFollowUp('First', 'queue', 'owner-id')
    useComposerStore.getState().patch('other', { attachments: [other] })
    useChatStore.setState({ activeConversationId: 'other' })
    finish({ success: true })
    await pending
    expect(queue.mock.calls[0][0].conversationId).toBe('owner')
    expect(useChatStore.getState().pendingAttachments).toEqual([other])
  })
  it('retains attachments on rejection and thrown IPC, with no chat fallback', async () => {
    const attachment = file('keep.txt')
    useChatStore.setState({ pendingAttachments: [attachment] })
    queue.mockResolvedValueOnce({ success: false, error: 'Rejected' }).mockRejectedValueOnce(new Error('IPC unavailable'))
    expect(await useChatStore.getState().submitFollowUp('First', 'queue', 'same-id')).toEqual({ success: false, error: 'Rejected' })
    expect(await useChatStore.getState().submitFollowUp('First', 'queue', 'same-id')).toEqual({ success: false, error: 'IPC unavailable' })
    expect(queue.mock.calls.map(call => call[0].clientUserMessageId)).toEqual(['same-id', 'same-id'])
    expect(useChatStore.getState().pendingAttachments).toEqual([attachment])
  })
  it('rejects unreadable attachments before any turn IPC call', async () => {
    useChatStore.setState({ pendingAttachments: [{ ...file('unreadable.txt'), error: 'Access denied' }] })
    expect((await useChatStore.getState().submitFollowUp('First', 'queue')).success).toBe(false)
    expect(queue).not.toHaveBeenCalled()
    expect(steer).not.toHaveBeenCalled()
    expect(useChatStore.getState().pendingAttachments).toHaveLength(1)
  })
  it('retries recovered mixed input in order with the same identity after remount or uncertain acknowledgement', async () => {
    const record = { id: 'recovery-record', conversationId: 'owner', status: 'recovered', input: [{ type: 'text', text: 'Before' }, { type: 'image', imageUrl: 'data:image/png;base64,AAAA' }, { type: 'text', text: 'After' }] } as TurnFollowUpRecord
    useChatStore.setState({ followUps: [record] })
    queue.mockRejectedValueOnce(new Error('Acknowledgement lost')).mockResolvedValue({ success: true })
    deleteFollowup.mockResolvedValue({ success: true })
    expect((await useChatStore.getState().retryFollowUp(record.id)).success).toBe(false)
    expect((await useChatStore.getState().retryFollowUp(record.id)).success).toBe(true)
    expect(queue.mock.calls[0][0]).toEqual(queue.mock.calls[1][0])
    expect(queue.mock.calls[0][0].input).toEqual(record.input)
    expect(deleteFollowup).toHaveBeenCalledWith({ conversationId: 'owner', followUpId: record.id })
  })
})
