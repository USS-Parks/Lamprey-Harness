import { useEffect } from 'react'
import { useMemoryStore } from '@/stores/memory-store'
import type { MemoryEntry } from '@/lib/types'

export function useMemory(): void {
  useEffect(() => {
    if (!window.api) return
    useMemoryStore.getState().loadMemories()
    window.api.memory.onAdded((entry: unknown) => {
      useMemoryStore.getState().receiveMemory(entry as MemoryEntry)
    })
  }, [])
}
