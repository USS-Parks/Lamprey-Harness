import { describe, expect, it, vi } from 'vitest'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { deliverRootSteersAtBoundary } from './steer-transcript'
import type { SteerDeliveryCommitInput } from './steer-transcript'
import { TurnRuntimeRegistry } from './turn-runtime'
import type { FollowUpRecord } from './turn-control-store'
import type { FollowUpId, TurnId } from './turn-control-types'

function harness() {
  const registry = new TurnRuntimeRegistry({ createTurn: () => null, settleTurn: () => true })
  const runtime = registry.register({
    conversationId: 'conversation-1',
    correlationId: 'correlation-1',
    turnId: 'turn-1' as TurnId
  })
  const commits: string[] = []
  const messages: ChatCompletionMessageParam[] = []
  const deps = {
    commit: (input: SteerDeliveryCommitInput) => {
      commits.push(input.steer.followUpId)
      return {
        message: { id: input.steer.followUpId },
        followUp: { id: input.steer.followUpId } as FollowUpRecord
      }
    },
    reject: vi.fn(),
    emit: vi.fn()
  }
  const enqueue = (id: string) =>
    runtime.enqueueSteer({
      followUpId: id as FollowUpId,
      input: [{ type: 'text', text: id }],
      clientUserMessageId: null,
      targetAgentRunId: null,
      receivedAt: 1
    })
  return { registry, runtime, commits, messages, deps, enqueue }
}

describe('ST-5 deterministic multi-round timing harness', () => {
  it('holds a streaming Steer until output reaches the continuation boundary', async () => {
    const h = harness()
    const chunks = ['working ', 'still working ', 'done']
    h.enqueue('during-stream')
    for (const _chunk of chunks) {
      expect(h.commits).toEqual([])
    }

    await deliverRootSteersAtBoundary(h.runtime, h.messages, h.deps)
    expect(h.commits).toEqual(['during-stream'])
    expect(h.messages).toHaveLength(1)
  })

  it('never preempts a mutating tool and delivers before the following model dispatch', async () => {
    const h = harness()
    const order: string[] = []
    let finishTool!: () => void
    const tool = new Promise<void>((resolve) => {
      finishTool = () => {
        order.push('tool-side-effect-complete')
        resolve()
      }
    })
    h.enqueue('during-tool')
    order.push('tool-started')
    expect(h.commits).toEqual([])
    finishTool()
    await tool
    order.push('tool-result-appended')
    await deliverRootSteersAtBoundary(h.runtime, h.messages, {
      ...h.deps,
      commit: (input: SteerDeliveryCommitInput) => {
        order.push('steer-committed')
        return h.deps.commit(input)
      }
    })
    order.push('next-model-dispatch')

    expect(order).toEqual([
      'tool-started',
      'tool-side-effect-complete',
      'tool-result-appended',
      'steer-committed',
      'next-model-dispatch'
    ])
  })

  it('lets completion win atomically and rejects post-completion injection', () => {
    const h = harness()
    h.registry.settle(h.runtime, 'completed', 20)

    expect(h.registry.lookupExpected('conversation-1', 'turn-1')).toMatchObject({
      ok: false,
      rejection: { reason: 'noActiveTurn' }
    })
    expect(() => h.enqueue('too-late')).toThrow(/cannot steer a completed turn/)
    expect(h.commits).toEqual([])
  })
})
