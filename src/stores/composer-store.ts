import { create } from 'zustand'
import type { ProcessedFile } from '@/lib/types'

export interface ComposerDraft {
  text: string
  attachments: ProcessedFile[]
  processing: number
  loaded: boolean
  error: string | null
}
export const EMPTY_COMPOSER_DRAFT: ComposerDraft = { text: '', attachments: [], processing: 0, loaded: false, error: null }
export const composerOwnerKey = (owner: string | null) => owner ?? '__new__'
type DraftPatch = Partial<Pick<ComposerDraft, 'text' | 'attachments'>>
interface ComposerState {
  drafts: Record<string, ComposerDraft>
  load: (owner: string | null) => Promise<void>
  patch: (owner: string | null, patch: DraftPatch) => void
  processing: (owner: string | null, active: boolean) => void
  retry: (owner: string | null) => Promise<void>
  forget: (owner: string | null) => void
  move: (from: string | null, to: string) => Promise<void>
}
const loads = new Map<string, Promise<void>>()
const writes = new Map<string, Promise<void>>()
export const useComposerStore = create<ComposerState>((set, get) => {
  const update = (owner: string | null, patch: Partial<ComposerDraft>) => set(state => {
    const key = composerOwnerKey(owner)
    return { drafts: { ...state.drafts, [key]: { ...(state.drafts[key] ?? EMPTY_COMPOSER_DRAFT), ...patch } } }
  })
  const save = (owner: string | null, patch: DraftPatch) => {
    const key = composerOwnerKey(owner)
    const operation = (writes.get(key) ?? Promise.resolve()).then(async () => {
      if (!window.api?.conversation?.setDraft) return
      const result = await window.api.conversation.setDraft(owner, patch)
      if (!result.success) throw new Error(result.error ?? 'Draft could not be saved.')
    }).catch(error => { update(owner, { error: `Draft is retained here but could not be saved: ${String(error)}` }) })
    writes.set(key, operation)
    void operation.finally(() => { if (writes.get(key) === operation) writes.delete(key) })
    return operation
  }
  return {
    drafts: {},
    load: owner => {
      const key = composerOwnerKey(owner)
      if (get().drafts[key]?.loaded) return Promise.resolve()
      if (loads.has(key)) return loads.get(key)!
      const operation = (async () => {
        try {
          await writes.get(key)
          if (!window.api?.conversation?.getDraft) { update(owner, { loaded: true }); return }
          const result = await window.api.conversation.getDraft(owner)
          if (!result.success) throw new Error(result.error ?? 'Draft could not be loaded.')
          if (get().drafts[key]?.loaded) return
          update(owner, { text: result.data.text, attachments: result.data.attachments as ProcessedFile[], loaded: true, error: null })
        } catch (error) { update(owner, { error: `Could not load this task's draft: ${String(error)}` }) }
        finally { loads.delete(key) }
      })()
      loads.set(key, operation)
      return operation
    },
    patch: (owner, patch) => { update(owner, { ...patch, loaded: true }); void save(owner, patch) },
    processing: (owner, active) => {
      const draft = get().drafts[composerOwnerKey(owner)] ?? EMPTY_COMPOSER_DRAFT
      update(owner, { processing: Math.max(0, draft.processing + (active ? 1 : -1)) })
    },
    retry: async owner => {
      const draft = get().drafts[composerOwnerKey(owner)]
      if (!draft?.loaded) { await get().load(owner); return }
      update(owner, { error: null })
      await save(owner, { text: draft.text, attachments: draft.attachments })
    },
    move: async (from, to) => {
      const draft = get().drafts[composerOwnerKey(from)]
      if (!draft || from === to) return
      get().patch(to, { text: draft.text, attachments: draft.attachments })
      await writes.get(composerOwnerKey(to))
      const current = get().drafts[composerOwnerKey(from)]
      if (!get().drafts[composerOwnerKey(to)]?.error && current?.text === draft.text && current.attachments === draft.attachments) get().patch(from, { text: '', attachments: [] })
    },
    forget: owner => set(state => ({ drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== composerOwnerKey(owner))) }))
  }
})
