import { create } from 'zustand'
import { toast } from '@/stores/toast-store'

// Loop Phase LP-7 — renderer store for the recurring loop entities (distinct
// from the wake-up snapshots in activity-store). Mirrors the main-side
// loop-store shapes (tsconfig project boundary forbids a cross-import).

export type LoopMode = 'interval' | 'self_paced' | 'autonomous'
export type LoopStatus = 'running' | 'paused' | 'stopped' | 'done' | 'error'
export type BacklogStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'error'

export interface LoopEntity {
  id: string
  conversationId: string
  mode: LoopMode
  status: LoopStatus
  instruction: string | null
  model: string | null
  intervalSeconds: number | null
  maxIterations: number | null
  maxWallclockMs: number | null
  tokenBudget: number | null
  iteration: number
  tokensUsed: number
  startedAt: number | null
  lastIterationAt: number | null
  nextFireAt: number | null
  stopReason: string | null
  createdAt: number
  updatedAt: number
}

export interface LoopBacklogItem {
  id: string
  loopId: string
  position: number
  task: string
  status: BacklogStatus
  result: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface CreateLoopInput {
  mode: LoopMode
  conversationId?: string
  instruction?: string
  model?: string
  intervalSeconds?: number
  tasks?: string[]
}

interface LoopsState {
  loops: LoopEntity[]
  loading: boolean
  refresh: () => Promise<void>
  create: (input: CreateLoopInput) => Promise<LoopEntity | null>
  pause: (id: string) => Promise<void>
  resume: (id: string) => Promise<void>
  stop: (id: string, reason?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  listBacklog: (loopId: string) => Promise<LoopBacklogItem[]>
  enqueue: (loopId: string, tasks: string[]) => Promise<void>
  reorderBacklog: (loopId: string, orderedIds: string[]) => Promise<void>
  removeBacklog: (id: string) => Promise<void>
}

export const useLoopsStore = create<LoopsState>((set, get) => ({
  loops: [],
  loading: false,

  refresh: async () => {
    if (!window.api?.loops?.listLoops) return
    set({ loading: true })
    const res = await window.api.loops.listLoops({ limit: 100 })
    if (res.success) set({ loops: (res.data as LoopEntity[]) ?? [] })
    set({ loading: false })
  },

  create: async (input) => {
    if (!window.api?.loops?.create) return null
    const res = await window.api.loops.create(input)
    if (!res.success) {
      toast.error(`Create loop failed: ${res.error}`)
      return null
    }
    await get().refresh()
    return (res.data as LoopEntity) ?? null
  },

  // JM-22 (RD-13) — every mutation checks its envelope + toasts on failure;
  // the state change (or refresh) only runs on success. remove() in
  // particular used to filter the row out unconditionally, so a failed
  // delete made the loop vanish from the panel until reload.
  pause: async (id) => {
    const res = await window.api?.loops?.pause(id)
    if (res && !res.success) {
      toast.error(`Pause failed: ${res.error}`)
      return
    }
    await get().refresh()
  },

  resume: async (id) => {
    const res = await window.api?.loops?.resume(id)
    if (res && !res.success) {
      toast.error(`Resume failed: ${res.error}`)
      return
    }
    await get().refresh()
  },

  stop: async (id, reason) => {
    const res = await window.api?.loops?.stop(id, reason)
    if (res && !res.success) {
      toast.error(`Stop failed: ${res.error}`)
      return
    }
    await get().refresh()
  },

  remove: async (id) => {
    const res = await window.api?.loops?.deleteLoop(id)
    if (res && !res.success) {
      toast.error(`Delete failed: ${res.error}`)
      return
    }
    set((s) => ({ loops: s.loops.filter((l) => l.id !== id) }))
  },

  listBacklog: async (loopId) => {
    const res = await window.api?.loops?.listBacklog(loopId)
    return res && res.success ? ((res.data as LoopBacklogItem[]) ?? []) : []
  },

  enqueue: async (loopId, tasks) => {
    const res = await window.api?.loops?.enqueue(loopId, tasks)
    if (res && !res.success) toast.error(`Enqueue failed: ${res.error}`)
  },

  reorderBacklog: async (loopId, orderedIds) => {
    await window.api?.loops?.reorderBacklog(loopId, orderedIds)
  },

  removeBacklog: async (id) => {
    await window.api?.loops?.removeBacklog(id)
  }
}))
