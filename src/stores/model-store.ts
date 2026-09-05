import { create } from 'zustand'
import type { ModelInfo } from '@/lib/types'

interface ModelState {
  models: ModelInfo[]
  activeModel: string
  loadModels: () => Promise<void>
  setActiveModel: (id: string) => Promise<void>
}

let writes = Promise.resolve()
export const useModelStore = create<ModelState>((set) => ({
  models: [],
  activeModel: 'deepseek-v4-pro',

  loadModels: async () => {
    await writes
    const [modelsResult, activeResult] = await Promise.all([
      window.api.model.list(),
      window.api.model.getActive()
    ])
    if (!modelsResult.success) throw new Error(modelsResult.error || 'Could not load models.')
    if (!activeResult.success) throw new Error(activeResult.error || 'Could not load the selected model.')
    set({ models: modelsResult.data, activeModel: activeResult.data })
  },

  setActiveModel: (id: string) => {
    const operation = writes.then(async () => {
      const result = await window.api.model.setActive(id)
      if (!result.success) throw new Error(result.error || 'Could not save the selected model.')
      set({ activeModel: id })
    })
    writes = operation.catch(() => {})
    return operation
  }
}))
