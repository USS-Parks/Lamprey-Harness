import { useEffect } from 'react'
import { useMcpStore } from '@/stores/mcp-store'
import type { McpStatusEvent } from '@/lib/types'

export function useMcp(): void {
  const loadServers = useMcpStore((s) => s.loadServers)
  const updateServerStatus = useMcpStore((s) => s.updateServerStatus)

  useEffect(() => {
    loadServers()

    if (!window.api) return

    window.api.mcp.onStatusChanged((e: unknown) => {
      updateServerStatus(e as McpStatusEvent)
    })

    return () => {
      // statusChanged listener cleaned up when component unmounts
    }
  }, [])
}
