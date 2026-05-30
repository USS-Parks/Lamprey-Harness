import { create } from 'zustand'
import type { McpServerConfig, McpStatusEvent } from '@/lib/types'

type ServerWithStatus = McpServerConfig & { error?: string }

interface McpState {
  servers: ServerWithStatus[]
  loaded: boolean
  loadServers: () => Promise<void>
  updateServerStatus: (event: McpStatusEvent) => void
  reconnect: (id: string) => Promise<void>
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  loaded: false,

  loadServers: async () => {
    if (!window.api) return
    const result = await window.api.mcp.list()
    if (result.success && result.data) {
      set({ servers: result.data, loaded: true })
    }
  },

  updateServerStatus: (event: McpStatusEvent) => {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === event.serverId
          ? { ...s, status: event.status, error: event.error }
          : s
      )
    }))
  },

  reconnect: async (id: string) => {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, status: 'connecting' } : s
      )
    }))
    await window.api.mcp.reconnect(id)
  }
}))
