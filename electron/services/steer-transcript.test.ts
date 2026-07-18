import { describe, expect, it, vi } from 'vitest'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import {
  deliverRootSteersAtBoundary,
  prepareSteerInput,
  recoverUndeliveredSteers,
  type SteerDeliveryCommitInput
} from './steer-transcript'
import { TurnRuntimeRegistry, type PendingSteer } from './turn-runtime'
import type { FollowUpRecord } from './turn-control-store'
import type { FollowUpId, TurnId } from './turn-control-types'

function runtimeHarness() {
  const registry = new TurnRuntimeRegistry({ createTurn: () => null, settleTurn: () => true })
  const runtime = registry.register({
    conversationId: 'conversation-1',
    correlationId: 'correlation-1',
    turnId: 'turn-1' as TurnId
  })
  return { registry, runtime }
}

function steer(
  id: string,
  input: PendingSteer['input'] = [{ type: 'text', text: id }],
  targetAgentRunId: string | null = null
): PendingSteer {
  return {
    followUpId: id as FollowUpId,
    input,
    clientUserMessageId: null,
    targetAgentRunId,
    receivedAt: 10
  }
}

function recordFor(input: SteerDeliveryCommitInput): FollowUpRecord {
  return {
    id: input.steer.followUpId,
    conversationId: 'conversation-1',
    turnId: 'turn-1' as TurnId,
    expectedTurnId: 'turn-1' as TurnId,
    clientUserMessageId: input.steer.clientUserMessageId,
    deliveryMode: 'steer',
    status: 'delivered',
    inputVersion: 1,
    input: input.steer.input,
    position: null,
    actor: 'user',
    sourceConversationId: null,
    sourceTaskId: null,
    targetAgentRunId: input.steer.targetAgentRunId,
    rejectionReason: null,
    rejectionMessage: null,
    recoveryReason: null,
    createdAt: 10,
    updatedAt: 20,
    deliveredAt: 20,
    finalizedAt: 20
  }
}

describe('ST-5 Steering transcript input', () => {
  it('preserves mixed item order and metadata while keeping bytes and local paths out of display metadata', async () => {
    const prepared = await prepareSteerInput(
      [
        { type: 'text', text: 'before' },
        {
          type: 'image',
          imageUrl: 'data:image/png;base64,REMOTE_BYTES',
          mimeType: 'image/png',
          name: 'remote.png',
          sizeBytes: 12,
          width: 4,
          height: 3
        },
        {
          type: 'localImage',
          path: 'C:\\secret\\local.jpg',
          mimeType: 'image/jpeg',
          name: 'local.jpg',
          sizeBytes: 34
        },
        { type: 'text', text: 'after' }
      ],
      async () => ({
        dataUrl: 'data:image/jpeg;base64,LOCAL_BYTES',
        mimeType: 'image/jpeg',
        sizeBytes: 34,
        name: 'local.jpg'
      })
    )

    expect((prepared.apiMessage as { content: unknown }).content).toEqual([
      { type: 'text', text: 'before' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,REMOTE_BYTES', detail: 'auto' }
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,LOCAL_BYTES', detail: 'auto' }
      },
      { type: 'text', text: 'after' }
    ])
    expect(prepared.inputMetadata).toEqual([
      { type: 'text' },
      {
        type: 'image',
        name: 'remote.png',
        mimeType: 'image/png',
        sizeBytes: 12,
        width: 4,
        height: 3
      },
      { type: 'localImage', name: 'local.jpg', mimeType: 'image/jpeg', sizeBytes: 34 },
      { type: 'text' }
    ])
    expect(JSON.stringify(prepared.inputMetadata)).not.toContain('REMOTE_BYTES')
    expect(JSON.stringify(prepared.inputMetadata)).not.toContain('LOCAL_BYTES')
    expect(prepared.displayContent).not.toContain('C:\\secret')
  })

  it('drains a Steer accepted during local-image loading before the same next dispatch', async () => {
    const { runtime } = runtimeHarness()
    runtime.enqueueSteer(steer('follow-up-1', [{ type: 'localImage', path: 'C:\\tmp\\one.png' }]))
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const loaderStarted = vi.fn()
    const committed: string[] = []
    const emitted: string[] = []
    const messages: ChatCompletionMessageParam[] = []
    const delivery = deliverRootSteersAtBoundary(runtime, messages, {
      loadLocalImage: async () => {
        loaderStarted()
        await blocked
        return {
          dataUrl: 'data:image/png;base64,AA==',
          mimeType: 'image/png',
          sizeBytes: 1,
          name: 'one.png'
        }
      },
      commit: (input) => {
        committed.push(input.steer.followUpId)
        return { message: { id: input.steer.followUpId }, followUp: recordFor(input) }
      },
      reject: vi.fn(),
      emit: (input) => emitted.push(input.steer.followUpId)
    })

    await vi.waitFor(() => expect(loaderStarted).toHaveBeenCalledOnce())
    runtime.enqueueSteer(steer('follow-up-2'))
    release()

    await expect(delivery).resolves.toEqual({ delivered: 2, rejected: 0 })
    expect(committed).toEqual(['follow-up-1', 'follow-up-2'])
    expect(emitted).toEqual(committed)
    expect(messages.map((message) => message.role)).toEqual(['user', 'user'])
    expect(runtime.pendingSteers).toHaveLength(0)
  })

  it('rejects an unreadable item without dropping a later valid Steer', async () => {
    const { runtime } = runtimeHarness()
    runtime.enqueueSteer(steer('bad', [{ type: 'localImage', path: 'C:\\tmp\\missing.unknown' }]))
    runtime.enqueueSteer(steer('good'))
    const rejected: string[] = []
    const committed: string[] = []
    const messages: ChatCompletionMessageParam[] = []

    const result = await deliverRootSteersAtBoundary(runtime, messages, {
      loadLocalImage: async () => {
        throw new Error('image disappeared')
      },
      commit: (input) => {
        committed.push(input.steer.followUpId)
        return { message: {}, followUp: recordFor(input) }
      },
      reject: (item) => rejected.push(item.followUpId),
      emit: vi.fn()
    })

    expect(result).toEqual({ delivered: 1, rejected: 1 })
    expect(rejected).toEqual(['bad'])
    expect(committed).toEqual(['good'])
    expect(messages).toHaveLength(1)
  })

  it('keeps a durable delivery committed when its renderer notification fails', async () => {
    const { runtime } = runtimeHarness()
    runtime.enqueueSteer(steer('delivered-before-reload'))
    const rejected = vi.fn()
    const messages: ChatCompletionMessageParam[] = []

    await expect(
      deliverRootSteersAtBoundary(runtime, messages, {
        commit: (input) => ({ message: {}, followUp: recordFor(input) }),
        reject: rejected,
        emit: () => {
          throw new Error('renderer reloaded')
        }
      })
    ).resolves.toEqual({ delivered: 1, rejected: 0 })
    expect(rejected).not.toHaveBeenCalled()
    expect(messages).toHaveLength(1)
  })

  it('retains the failed and later items when rejection persistence fails', async () => {
    const { runtime } = runtimeHarness()
    runtime.enqueueSteer(steer('bad', [{ type: 'localImage', path: 'missing.png' }]))
    runtime.enqueueSteer(steer('later'))

    await expect(
      deliverRootSteersAtBoundary(runtime, [], {
        loadLocalImage: async () => {
          throw new Error('unreadable')
        },
        commit: (input) => ({ message: {}, followUp: recordFor(input) }),
        reject: () => {
          throw new Error('database busy')
        },
        emit: vi.fn()
      })
    ).rejects.toThrow('database busy')
    expect(runtime.pendingSteers.map((item) => item.followUpId)).toEqual(['bad', 'later'])
  })

  it('recovers every pending target on provider failure and re-retains on persistence failure', () => {
    const { runtime } = runtimeHarness()
    runtime.enqueueSteer(steer('root'))
    runtime.enqueueSteer(steer('child', undefined, 'child-1'))
    const recovered: string[] = []
    expect(
      recoverUndeliveredSteers(
        runtime,
        (item) => recovered.push(item.followUpId),
        'provider failed'
      )
    ).toBe(2)
    expect(recovered).toEqual(['root', 'child'])
    expect(runtime.pendingSteers).toHaveLength(0)

    runtime.enqueueSteer(steer('retry'))
    expect(() =>
      recoverUndeliveredSteers(
        runtime,
        () => {
          throw new Error('database busy')
        },
        'provider failed'
      )
    ).toThrow('database busy')
    expect(runtime.pendingSteers.map((item) => item.followUpId)).toEqual(['retry'])
  })
})
