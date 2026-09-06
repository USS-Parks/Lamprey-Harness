import { useRef, useState } from 'react'
import type { ApprovalDecision, ApprovalScope, ToolApprovalRequest } from '@/lib/types'
export function useApprovalResponse(request: ToolApprovalRequest, onResolved: () => void, onAllowed?: (request: ToolApprovalRequest) => void) {
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const respond = async (decision: ApprovalDecision, scope: ApprovalScope) => {
    if (inFlight.current) return
    inFlight.current = true; setPending(true); setError(null)
    try {
      const result = await window.api.tools.respondToApproval({ callId: request.callId, decision, scope })
      if (!result?.success) throw new Error(result?.error ?? 'The decision was not acknowledged. Try again.')
      if (decision === 'allow') onAllowed?.(request)
      onResolved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send decision. Try again.') }
    finally { inFlight.current = false; setPending(false) }
  }
  return { respond, pending, error }
}
