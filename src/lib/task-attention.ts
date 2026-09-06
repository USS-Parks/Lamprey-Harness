import type { ToolApprovalRequest } from './types'
import type { FollowUpStateByConversation } from './follow-up-state'
import type { AgentRunSnapshot, LoopWakeupSnapshot } from '@/stores/activity-store'
export interface AttentionItem {
  id: string
  owner?: string
  kind: 'approval' | 'failure' | 'completion'
  title: string
  detail: string
  destination?: 'agents' | 'loop'
}
export function taskAttention(input: { approvals: ToolApprovalRequest[]; turns: FollowUpStateByConversation; agents: AgentRunSnapshot[]; wakeups: LoopWakeupSnapshot[]; readIds: string[] }): AttentionItem[] {
  const items = new Map<string, AttentionItem>()
  const add = (item: AttentionItem) => { if (item.kind !== 'completion' || !input.readIds.includes(item.id)) items.set(item.id, item) }
  for (const request of input.approvals) add({ id: `approval:${request.callId}`, owner: request.conversationId, kind: 'approval', title: request.name, detail: 'Waiting for your decision' })
  for (const [owner, state] of Object.entries(input.turns)) {
    const result = state.lastOutcome
    if (!result || state.activeTurn) continue
    if (result.status === 'completed' && result.persisted) add({ id: `turn:${result.turnId}`, owner, kind: 'completion', title: 'Task completed', detail: 'Unread completion' })
    else if (result.status === 'failed' || result.status === 'interrupted' || !result.persisted) add({ id: `turn:${result.turnId}`, owner, kind: 'failure', title: 'Task needs review', detail: !result.persisted ? 'Outcome could not be saved' : result.status })
  }
  for (const agent of input.agents) {
    if (agent.status === 'done' || agent.status === 'error') add({ id: `agent:${agent.id}`, owner: agent.parentConvId ?? undefined, kind: agent.status === 'error' ? 'failure' : 'completion', title: agent.label || agent.agentType, detail: agent.error || 'Agent completed', destination: 'agents' })
  }
  for (const wakeup of input.wakeups) if (wakeup.status === 'error') add({ id: `loop:${wakeup.id}`, owner: wakeup.conversationId, kind: 'failure', title: wakeup.reason || 'Scheduled wake-up failed', detail: wakeup.error || 'Open Loops for details', destination: 'loop' })
  const priority = { approval: 0, failure: 1, completion: 2 }
  return [...items.values()].sort((a, b) => priority[a.kind] - priority[b.kind])
}
