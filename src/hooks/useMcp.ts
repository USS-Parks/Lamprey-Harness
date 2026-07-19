import { useEffect } from 'react'
import { useMcpStore } from '@/stores/mcp-store'
import type { McpAuthStatusEvent, McpElicitationEvent, McpStatusEvent } from '@/lib/types'

export function useMcp(): void {
  const loadServers = useMcpStore((s) => s.loadServers)
  const updateServerStatus = useMcpStore((s) => s.updateServerStatus)
  const updateAuthStatus = useMcpStore((s) => s.updateAuthStatus)
  const updateElicitation = useMcpStore((s) => s.updateElicitation)

  useEffect(() => {
    loadServers()

    if (!window.api) return

    const disposeStatus = window.api.mcp.onStatusChanged((e: unknown) => {
      updateServerStatus(e as McpStatusEvent)
    })
    const disposeAuth = window.api.mcp.onAuthStatusChanged((e: unknown) => {
      updateAuthStatus(e as McpAuthStatusEvent)
    })
    const disposeElicitation = window.api.mcp.onElicitationChanged((e: unknown) => {
      updateElicitation(e as McpElicitationEvent)
    })
    const disposeResource = window.api.mcp.onResourceChanged(() => {
      // The notification carries metadata only. Reload visible inventories so
      // resource bodies never cross the activity/event boundary.
      const state = useMcpStore.getState()
      for (const serverId of Object.keys(state.inventories)) {
        void state.loadInventory(serverId)
      }
    })

    return () => {
      disposeStatus()
      disposeAuth()
      disposeElicitation()
      disposeResource()
    }
  }, [loadServers, updateAuthStatus, updateElicitation, updateServerStatus])
}
