import type { TurnId } from './turn-control-types'
import { expect, it } from 'vitest'
import { taskAttention } from './task-attention'
import type { ToolApprovalRequest } from './types'
import type { FollowUpStateByConversation } from './follow-up-state'
const approval: ToolApprovalRequest = { callId: 'call', toolId: 'shell_command', name: 'shell_command', serverId: 'internal', providerKind: 'native', risks: ['write'], args: {}, conversationId: 'task' }
const turns: FollowUpStateByConversation = {
  failed: { activeTurn: null, followUps: [], observedAt: 1, revision: 1, lastOutcome: { turnId: 'failed-turn' as TurnId, status: 'failed', completedAt: 1, persisted: true } },
  completed: { activeTurn: null, followUps: [], observedAt: 1, revision: 1, lastOutcome: { turnId: 'done-turn' as TurnId, status: 'completed', completedAt: 1, persisted: true } }
}
it('deduplicates approval identity and sorts decisions before outcomes', () => {
  const items = taskAttention({ approvals: [approval, approval], turns, agents: [], wakeups: [], readIds: [] })
  expect(items.map(item => item.id)).toEqual(['approval:call', 'turn:failed-turn', 'turn:done-turn'])
  expect(items[0].owner).toBe('task')
})
it('reading completions removes unread state but reading failure never resolves it', () => {
  expect(taskAttention({ approvals: [], turns, agents: [], wakeups: [], readIds: ['turn:failed-turn', 'turn:done-turn'] }).map(item => item.id)).toEqual(['turn:failed-turn'])
})
it('does not show an unpersisted completion as successful', () => {
  const items = taskAttention({ approvals: [], turns: { task: { ...turns.completed, lastOutcome: { ...turns.completed.lastOutcome!, persisted: false } } }, agents: [], wakeups: [], readIds: [] })
  expect(items[0].kind).toBe('failure')
})
