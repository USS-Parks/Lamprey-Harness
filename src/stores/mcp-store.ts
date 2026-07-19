import { create } from 'zustand'
import type {
  McpAuthStatusEvent,
  McpElicitationEvent,
  McpResource,
  McpResourceContent,
  McpResourceTemplate,
  McpServerConfig,
  McpStatusEvent
} from '@/lib/types'

export type ServerWithStatus = McpServerConfig & { error?: string }

export interface McpResourceInventory {
  resources: McpResource[]
  resourceTemplates: McpResourceTemplate[]
  nextResourceCursor?: string
  nextTemplateCursor?: string
  loading: boolean
  error?: string
}

export interface McpResourcePreview {
  serverId: string
  uri: string
  contents: McpResourceContent[]
  loading: boolean
  error?: string
}

interface McpState {
  servers: ServerWithStatus[]
  inventories: Record<string, McpResourceInventory>
  preview: McpResourcePreview | null
  latestElicitation: Record<string, McpElicitationEvent>
  loaded: boolean
  loadServers: () => Promise<void>
  updateServerStatus: (event: McpStatusEvent) => void
  updateAuthStatus: (event: McpAuthStatusEvent) => void
  updateElicitation: (event: McpElicitationEvent) => void
  reconnect: (id: string) => Promise<void>
  reauthorize: (id: string) => Promise<{ success: boolean; error?: string }>
  loadInventory: (id: string) => Promise<void>
  loadMoreResources: (id: string) => Promise<void>
  loadMoreTemplates: (id: string) => Promise<void>
  readResource: (id: string, uri: string) => Promise<void>
  closePreview: () => void
}

const EMPTY_INVENTORY: McpResourceInventory = {
  resources: [],
  resourceTemplates: [],
  loading: false
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  inventories: {},
  preview: null,
  latestElicitation: {},
  loaded: false,

  loadServers: async () => {
    if (!window.api) return
    const result = await window.api.mcp.list()
    if (result.success && result.data) {
      set({ servers: result.data, loaded: true })
    }
  },

  updateServerStatus: (event) => {
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === event.serverId
          ? { ...server, status: event.status, error: event.error }
          : server
      )
    }))
  },

  updateAuthStatus: (event) => {
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === event.serverId
          ? { ...server, authStatus: event.status, authError: event.error }
          : server
      )
    }))
  },

  updateElicitation: (event) => {
    set((state) => ({
      latestElicitation: { ...state.latestElicitation, [event.serverId]: event }
    }))
  },

  reconnect: async (id) => {
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === id ? { ...server, status: 'connecting' } : server
      )
    }))
    await window.api.mcp.reconnect(id)
  },

  reauthorize: async (id) => {
    set((state) => ({
      servers: state.servers.map((server) =>
        server.id === id ? { ...server, authStatus: 'authorizing', authError: undefined } : server
      )
    }))
    const result = await window.api.mcp.reauthorize(id)
    await get().loadServers()
    return result.success ? { success: true } : { success: false, error: result.error }
  },

  loadInventory: async (id) => {
    set((state) => ({
      inventories: {
        ...state.inventories,
        [id]: { ...(state.inventories[id] ?? EMPTY_INVENTORY), loading: true, error: undefined }
      }
    }))
    const [resources, templates] = await Promise.all([
      window.api.mcp.listResources(id),
      window.api.mcp.listResourceTemplates(id)
    ])
    if (!resources.success || !templates.success) {
      set((state) => ({
        inventories: {
          ...state.inventories,
          [id]: {
            ...(state.inventories[id] ?? EMPTY_INVENTORY),
            loading: false,
            error: resources.success ? templates.error : resources.error
          }
        }
      }))
      return
    }
    set((state) => ({
      inventories: {
        ...state.inventories,
        [id]: {
          resources: resources.data.items,
          resourceTemplates: templates.data.items,
          nextResourceCursor: resources.data.nextCursor,
          nextTemplateCursor: templates.data.nextCursor,
          loading: false
        }
      }
    }))
  },

  loadMoreResources: async (id) => {
    const current = get().inventories[id]
    if (!current?.nextResourceCursor || current.loading) return
    set((state) => ({
      inventories: { ...state.inventories, [id]: { ...current, loading: true } }
    }))
    const result = await window.api.mcp.listResources(id, current.nextResourceCursor)
    set((state) => ({
      inventories: {
        ...state.inventories,
        [id]: result.success
          ? {
              ...current,
              resources: [...current.resources, ...result.data.items],
              nextResourceCursor: result.data.nextCursor,
              loading: false,
              error: undefined
            }
          : { ...current, loading: false, error: result.error }
      }
    }))
  },

  loadMoreTemplates: async (id) => {
    const current = get().inventories[id]
    if (!current?.nextTemplateCursor || current.loading) return
    set((state) => ({
      inventories: { ...state.inventories, [id]: { ...current, loading: true } }
    }))
    const result = await window.api.mcp.listResourceTemplates(id, current.nextTemplateCursor)
    set((state) => ({
      inventories: {
        ...state.inventories,
        [id]: result.success
          ? {
              ...current,
              resourceTemplates: [...current.resourceTemplates, ...result.data.items],
              nextTemplateCursor: result.data.nextCursor,
              loading: false,
              error: undefined
            }
          : { ...current, loading: false, error: result.error }
      }
    }))
  },

  readResource: async (id, uri) => {
    set({ preview: { serverId: id, uri, contents: [], loading: true } })
    const result = await window.api.mcp.readResource(id, uri)
    set({
      preview: result.success
        ? { serverId: id, uri, contents: result.data, loading: false }
        : { serverId: id, uri, contents: [], loading: false, error: result.error }
    })
  },

  closePreview: () => set({ preview: null })
}))
