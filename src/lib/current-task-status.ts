import type { ConversationFollowUpState } from './follow-up-state'
import type { AgentRunPhase } from './types'

export interface CurrentTaskStatus {
  label: string
  tone: 'muted' | 'active' | 'attention' | 'error' | 'success'
}
const PHASES: Partial<Record<AgentRunPhase, string>> = {
  understanding: 'Reading your message', gathering_context: 'Reading project', planning: 'Planning', acting: 'Working', verifying: 'Checking results', summarizing: 'Wrapping up'
}
export function currentTaskStatus(input: {
  owner: string | null
  state?: ConversationFollowUpState
  sending: boolean
  phase: AgentRunPhase | null
  approvalCount: number
}): CurrentTaskStatus {
  if (!input.owner) return { label: 'Ready', tone: 'muted' }
  const state = input.state
  if (input.approvalCount > 0) return { label: `Waiting for approval${input.approvalCount > 1 ? ` (${input.approvalCount})` : ''}`, tone: 'attention' }
  if (state?.hydrationError) return { label: 'Status unavailable', tone: 'error' }
  if (state?.orphaned) return { label: 'Interrupted work needs recovery', tone: 'attention' }
  if (state?.activeTurn?.conversationId === input.owner) return { label: input.phase ? PHASES[input.phase] ?? 'Working' : 'Working', tone: 'active' }
  if (input.sending) return { label: 'Starting turn', tone: 'active' }
  if (!state || !state.observedAt) return { label: 'Loading status', tone: 'muted' }
  const outcome = state.lastOutcome
  if (!outcome) return { label: 'Ready', tone: 'muted' }
  if (!outcome.persisted) return { label: 'Turn ended; saving failed', tone: 'error' }
  switch (outcome.status) {
    case 'completed': return { label: 'Completed', tone: 'success' }
    case 'failed': return { label: 'Failed', tone: 'error' }
    case 'cancelled': return { label: 'Cancelled', tone: 'muted' }
    case 'interrupted': return { label: 'Interrupted', tone: 'attention' }
    case 'recovered': return { label: 'Recovered after interruption', tone: 'attention' }
  }
}
