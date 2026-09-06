import { useUiStore } from '@/stores/ui-store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import type { EnvironmentSnapshot } from '@/lib/types'

interface UseEnvironmentResult {
  changedFileCount: number
  snapshot: EnvironmentSnapshot
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const EMPTY: EnvironmentSnapshot = {
  branch: null,
  additions: 0,
  deletions: 0,
  hasChanges: false,
  ahead: 0,
  behind: 0,
  cwd: ''
}

interface ReviewStatus {
  files: Array<{ path: string }>
  branch: string | null
  ahead: number
  behind: number
  cwd: string
}

interface ReviewSummary {
  additions: number
  deletions: number
}

// Subscribes to the main process's review:changed event AND polls every 15s
// as a safety net (chokidar on Windows can miss events when files are atomic
// -replaced by git). Refreshes status + summary in parallel.
export function useEnvironment(): UseEnvironmentResult {
  const contextRevision = useUiStore(s => s.workspaceContextRevision)
  const conversationId = useChatStore(s => s.activeConversationId)
  const [changedFileCount, setChangedFileCount] = useState(0)
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return
    const request = ++requestRef.current
    setLoading(true)
    try {
      if (!window.api?.review) throw new Error('Review API unavailable')
      const [statusRes, summaryRes, folderRes] = await Promise.all([
        window.api.review.status({ conversationId }),
        window.api.review.summary?.({ conversationId }) ?? Promise.resolve({ success: false } as const),
        window.api.files.getWorkdir(conversationId)
      ])
      if (!mountedRef.current || request !== requestRef.current) return
      if (folderRes.success && folderRes.data) setSnapshot({ ...EMPTY, cwd: folderRes.data.path })
      if (!statusRes.success) throw new Error(statusRes.error || 'Repository status unavailable')
      if (!summaryRes.success) throw new Error('Repository summary unavailable')
      const status = statusRes.data as ReviewStatus
      const summary = summaryRes.data as ReviewSummary
      setChangedFileCount(status.files.length)
      setSnapshot({
        branch: status?.branch ?? null,
        additions: summary?.additions ?? 0,
        deletions: summary?.deletions ?? 0,
        hasChanges: (status?.files?.length ?? 0) > 0,
        ahead: status?.ahead ?? 0,
        behind: status?.behind ?? 0,
        cwd: status?.cwd ?? ''
      })
      setError(null)
    } catch (err) {
      if (mountedRef.current && request === requestRef.current) {
        setError(err instanceof Error ? err.message : 'Repository refresh failed')
      }
    } finally {
      if (mountedRef.current && request === requestRef.current) setLoading(false)
    }
  }, [conversationId, contextRevision])

  useEffect(() => {
    mountedRef.current = true
    setSnapshot(EMPTY)
    setChangedFileCount(0)
    void refresh()
    const unsubscribe = window.api?.review?.onChanged?.(() => {
      void refresh()
    })
    const id = window.setInterval(() => {
      void refresh()
    }, 15000)
    return () => {
      mountedRef.current = false
      requestRef.current++
      window.clearInterval(id)
      unsubscribe?.()
    }
  }, [refresh])

  return { snapshot, changedFileCount, loading, error, refresh }
}
