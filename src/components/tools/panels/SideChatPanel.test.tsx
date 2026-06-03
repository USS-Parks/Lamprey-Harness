// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { SideChatPanel } from './SideChatPanel'

const SIDE_CONV_KEY = 'lamprey.sidechat.conversationId'

let subscribe: ReturnType<typeof vi.fn>
let capturedCbs: {
  onChunk: (e: { conversationId: string; content: string }) => void
  onDone: (e: { conversationId: string; message: unknown }) => void
  onError: (e: { conversationId: string; error: string }) => void
}

beforeEach(() => {
  window.localStorage.setItem(SIDE_CONV_KEY, 'side-1')
  subscribe = vi.fn((_id: string, cbs: typeof capturedCbs) => {
    capturedCbs = cbs
    return () => {}
  })
  ;(window as unknown as { api: unknown }).api = {
    conversation: {
      get: vi.fn().mockResolvedValue({ success: true, data: { id: 'side-1' } }),
      getMessages: vi.fn().mockResolvedValue({ success: true, data: [] }),
      create: vi.fn().mockResolvedValue({ success: true, data: { id: 'side-1' } })
    },
    chat: { subscribe }
  }
})

describe('SideChatPanel subscription (BUG-4)', () => {
  it('subscribes once and does NOT re-subscribe on each streamed chunk', async () => {
    render(<SideChatPanel />)
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))

    act(() => {
      capturedCbs.onChunk({ conversationId: 'side-1', content: 'a' })
      capturedCbs.onChunk({ conversationId: 'side-1', content: 'b' })
      capturedCbs.onChunk({ conversationId: 'side-1', content: 'c' })
    })

    // The bug listed streamBuf in the effect deps, re-creating the IPC
    // subscription on every chunk.
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('onDone falls back to the accumulated buffer via the ref (not a stale capture)', async () => {
    render(<SideChatPanel />)
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))

    act(() => {
      capturedCbs.onChunk({ conversationId: 'side-1', content: 'Hel' })
      capturedCbs.onChunk({ conversationId: 'side-1', content: 'lo' })
      capturedCbs.onDone({ conversationId: 'side-1', message: {} }) // no string content
    })

    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
