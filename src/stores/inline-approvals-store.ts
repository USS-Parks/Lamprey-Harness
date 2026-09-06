import { create } from 'zustand'
import type { ToolApprovalRequest } from '@/lib/types'

// Shared pending approval identities. App chooses modal or inline presentation;
// task attention reads both queues. Acknowledged decisions and terminal tool
// results remove the exact call, including calls owned by an inactive task.

interface InlineApprovalsState {
  queue: ToolApprovalRequest[]
  modalQueue: ToolApprovalRequest[]
  pushModal: (request: ToolApprovalRequest) => void
  push: (request: ToolApprovalRequest) => void
  dismiss: (callId: string) => void
  clear: () => void
}

export const useInlineApprovalsStore = create<InlineApprovalsState>((set) => ({
  queue: [],
  modalQueue: [],
  pushModal: (request) => set(s => s.modalQueue.some(q => q.callId === request.callId) || s.queue.some(q => q.callId === request.callId) ? s : { modalQueue: [...s.modalQueue, request] }),
  push: (request) =>
    set((s) =>
      // De-dupe defensively — the IPC fan-out has been seen to redeliver
      // events on listener re-attach; the chip is keyed on callId so a
      // double-push would render two of them.
      s.queue.some((q) => q.callId === request.callId) || s.modalQueue.some(q => q.callId === request.callId)
        ? s
        : { queue: [...s.queue, request] }
    ),
  dismiss: (callId) =>
    set((s) => ({ queue: s.queue.filter((q) => q.callId !== callId), modalQueue: s.modalQueue.filter(q => q.callId !== callId) })),
  clear: () => set({ queue: [], modalQueue: [] })
}))
