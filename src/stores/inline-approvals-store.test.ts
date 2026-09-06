import { beforeEach, expect, it } from 'vitest'
import { useInlineApprovalsStore } from './inline-approvals-store'
import type { ToolApprovalRequest } from '@/lib/types'
const request: ToolApprovalRequest = { callId: 'one', toolId: 'shell_command', name: 'shell_command', serverId: 'internal', providerKind: 'native', risks: ['write'], args: {}, conversationId: 'owner' }
beforeEach(() => useInlineApprovalsStore.getState().clear())
it('deduplicates across modal and inline routes and removes only the settled identity', () => {
  const store = useInlineApprovalsStore.getState()
  store.pushModal(request); store.push(request); store.pushModal(request)
  store.push({ ...request, callId: 'two', conversationId: 'other' })
  expect(useInlineApprovalsStore.getState().modalQueue).toHaveLength(1)
  expect(useInlineApprovalsStore.getState().queue).toHaveLength(1)
  store.dismiss('one')
  expect(useInlineApprovalsStore.getState().modalQueue).toEqual([])
  expect(useInlineApprovalsStore.getState().queue[0].callId).toBe('two')
})

it('does not revive a settled approval after duplicate event delivery', () => {
  const store = useInlineApprovalsStore.getState()
  store.push(request); store.dismiss(request.callId)
  store.pushModal(request); store.push(request)
  expect(useInlineApprovalsStore.getState().queue).toEqual([])
  expect(useInlineApprovalsStore.getState().modalQueue).toEqual([])
})
