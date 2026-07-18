import { describe, expect, it, vi } from 'vitest'
import { createTaskDeliveryService } from './task-delivery'

function followUp(mode: 'queue' | 'steer') {
  return {
    id: 'f1',
    conversationId: 'target',
    turnId: null,
    expectedTurnId: null,
    clientUserMessageId: null,
    deliveryMode: mode,
    status: mode === 'queue' ? 'queued' : 'accepted',
    inputVersion: 1,
    input: [{ type: 'text', text: 'hello' }],
    position: 0,
    actor: 'model',
    sourceConversationId: 'source',
    sourceTaskId: 'source',
    targetAgentRunId: null,
    rejectionReason: null,
    rejectionMessage: null,
    recoveryReason: null,
    createdAt: 1,
    updatedAt: 1,
    deliveredAt: null,
    finalizedAt: null
  } as never
}

describe('shared task delivery', () => {
  it('queues with source attribution and retry identity', () => {
    const queue = vi.fn(() => ({
      success: true as const,
      data: { followUp: followUp('queue'), duplicate: false }
    }))
    const service = createTaskDeliveryService({
      actions: { queue, steer: vi.fn() },
      interrupt: vi.fn(),
      newClientId: () => 'client-1'
    })
    expect(
      service.send({
        targetConversationId: 'target',
        body: ' hello ',
        sourceConversationId: 'source',
        sourceTaskId: 'source'
      })
    ).toMatchObject({ mode: 'queue', status: 'queued' })
    expect(queue).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'target',
        deliveryMode: 'queue',
        actor: 'model',
        sourceConversationId: 'source',
        clientUserMessageId: 'client-1'
      })
    )
  })

  it('requires exact turn identity for Steer and never converts rejection to Queue', () => {
    const queue = vi.fn()
    const steer = vi.fn(() => ({ success: false as const, error: 'turn mismatch' }))
    const service = createTaskDeliveryService({ actions: { queue, steer }, interrupt: vi.fn() })
    expect(() =>
      service.send({ targetConversationId: 'target', body: 'x', mode: 'steer' })
    ).toThrow('Steer requires expectedTurnId')
    expect(() =>
      service.send({
        targetConversationId: 'target',
        body: 'x',
        mode: 'steer',
        expectedTurnId: 'old'
      })
    ).toThrow('turn mismatch')
    expect(queue).not.toHaveBeenCalled()
  })

  it('keeps Queue free of active-turn targeting', () => {
    const service = createTaskDeliveryService({
      actions: { queue: vi.fn(), steer: vi.fn() },
      interrupt: vi.fn()
    })
    expect(() =>
      service.send({
        targetConversationId: 'target',
        body: 'x',
        mode: 'queue',
        expectedTurnId: 't1'
      })
    ).toThrow('Queue cannot target')
  })

  it('routes interruption through the exact-turn action', () => {
    const interrupt = vi.fn(() => ({
      success: true as const,
      data: { turnId: 't1', status: 'interrupted' as const, recoveredFollowUps: 0, persisted: true }
    }))
    const service = createTaskDeliveryService({
      actions: { queue: vi.fn(), steer: vi.fn() },
      interrupt: interrupt as never
    })
    expect(service.interrupt('target', 't1')).toMatchObject({ status: 'interrupted' })
    expect(interrupt).toHaveBeenCalledWith({ conversationId: 'target', expectedTurnId: 't1' })
  })
})
