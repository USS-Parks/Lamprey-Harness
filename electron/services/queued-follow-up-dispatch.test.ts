import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import {
  dispatchNextQueuedFollowUp,
  type QueuedFollowUpDispatchDependencies
} from './queued-follow-up-dispatch'
import type { FollowUpRecord } from './turn-control-store'
import type { FollowUpStatus, TurnId, TurnInputItem } from './turn-control-types'
import { TurnRuntime } from './turn-runtime'

function queuedRecord(
  id: string,
  position: number,
  input: TurnInputItem[] = [{ type: 'text', text: id }]
): FollowUpRecord {
  return {
    id: id as FollowUpRecord['id'],
    conversationId: 'conversation-1',
    turnId: null,
    expectedTurnId: null,
    clientUserMessageId: `client-${id}` as FollowUpRecord['clientUserMessageId'],
    deliveryMode: 'queue',
    status: 'queued',
    inputVersion: 1,
    input,
    position,
    actor: 'user',
    sourceConversationId: null,
    sourceTaskId: null,
    targetAgentRunId: null,
    rejectionReason: null,
    rejectionMessage: null,
    recoveryReason: null,
    createdAt: 1,
    updatedAt: 1,
    deliveredAt: null,
    finalizedAt: null
  }
}

function runtime(id = 'queued-turn-1'): TurnRuntime {
  return new TurnRuntime({
    conversationId: 'conversation-1',
    correlationId: `correlation-${id}`,
    turnId: id as TurnId,
    kind: 'regular',
    controller: new AbortController(),
    startedAt: 10,
    activeAgentRunId: null
  })
}

function harness(initial: FollowUpRecord[]): {
  deps: QueuedFollowUpDispatchDependencies
  records: FollowUpRecord[]
  calls: string[]
  runInputs: Parameters<QueuedFollowUpDispatchDependencies['runTurn']>[0][]
  committedDisplays: string[]
  rejectionMessages: string[]
} {
  const records = initial.map((record) => ({
    ...record,
    input: record.input.map((item) => ({ ...item }))
  }))
  const calls: string[] = []
  const runInputs: Parameters<QueuedFollowUpDispatchDependencies['runTurn']>[0][] = []
  const committedDisplays: string[] = []
  const rejectionMessages: string[] = []
  let turnNumber = 0

  const deps: QueuedFollowUpDispatchDependencies = {
    store: {
      listQueuedFollowUps: (conversationId) =>
        records
          .filter(
            (record) => record.conversationId === conversationId && record.status === 'queued'
          )
          .sort((left, right) => (left.position ?? 0) - (right.position ?? 0)),
      transitionFollowUp: (id, status, updatedAt, details = {}) => {
        const index = records.findIndex((record) => record.id === id)
        if (index < 0) throw new Error('missing follow-up')
        const previous = records[index]
        calls.push(`transition:${previous.id}:${previous.status}->${status}`)
        records[index] = {
          ...previous,
          status: status as FollowUpStatus,
          updatedAt,
          turnId: (details.turnId as TurnId | undefined) ?? previous.turnId,
          rejectionReason: details.rejectionReason ?? null,
          rejectionMessage: details.rejectionMessage ?? null,
          deliveredAt: status === 'delivered' ? updatedAt : previous.deliveredAt,
          finalizedAt: ['delivered', 'rejected'].includes(status) ? updatedAt : previous.finalizedAt
        }
        if (details.rejectionMessage) rejectionMessages.push(details.rejectionMessage)
        return records[index]
      }
    },
    registerTurn: () => {
      turnNumber += 1
      calls.push('register')
      return runtime(`queued-turn-${turnNumber}`)
    },
    emitTurnStarted: () => calls.push('start'),
    prepareInput: async (input) => {
      calls.push('prepare')
      return {
        apiMessage: {
          role: 'user',
          content: input.map((item) =>
            item.type === 'text'
              ? { type: 'text' as const, text: item.text }
              : {
                  type: 'image_url' as const,
                  image_url: {
                    url: item.type === 'image' ? item.imageUrl : 'data:image/png;base64,cXVldWU=',
                    detail: 'auto' as const
                  }
                }
          )
        } as ChatCompletionMessageParam,
        displayContent: input
          .map((item) => (item.type === 'text' ? item.text : `[Image: ${item.name ?? 'image'}]`))
          .join('\n\n'),
        inputMetadata: input.map((item) => ({
          type: item.type,
          ...(item.type === 'text' ? {} : { name: item.name })
        }))
      }
    },
    commitDelivery: ({ followUp, runtime: activeRuntime, prepared }) => {
      calls.push('commit')
      committedDisplays.push(prepared.displayContent)
      const delivered = deps.store.transitionFollowUp(followUp.id, 'delivered', 30, {
        turnId: activeRuntime.turnId
      })
      return { message: { id: `message-${followUp.id}` }, followUp: delivered }
    },
    emitUserMessage: () => calls.push('emit-user-message'),
    recordDisposition: (followUp, disposition) => calls.push(`audit:${followUp.id}:${disposition}`),
    settleTurn: (_activeRuntime, status) => calls.push(`settle:${status}`),
    runTurn: async (input) => {
      calls.push('run')
      runInputs.push(input)
    },
    now: () => 20,
    reportError: (message) => calls.push(`error:${message}`)
  }

  return { deps, records, calls, runInputs, committedDisplays, rejectionMessages }
}

describe('dispatchNextQueuedFollowUp', () => {
  it('does nothing when no queued follow-up exists', async () => {
    const state = harness([])
    await expect(
      dispatchNextQueuedFollowUp({ conversationId: 'conversation-1', model: 'model-1' }, state.deps)
    ).resolves.toEqual({ status: 'empty' })
    expect(state.calls).toEqual([])
  })

  it('claims the first position synchronously and dispatches exactly one item', async () => {
    const state = harness([queuedRecord('second', 1), queuedRecord('first', 0)])
    let releasePreparation!: () => void
    const preparationGate = new Promise<void>((resolve) => {
      releasePreparation = resolve
    })
    const originalPrepare = state.deps.prepareInput
    state.deps.prepareInput = async (input) => {
      await preparationGate
      return originalPrepare(input)
    }

    const dispatch = dispatchNextQueuedFollowUp(
      { conversationId: 'conversation-1', model: 'model-1', activeSkillIds: ['skill-1'] },
      state.deps
    )

    expect(state.calls).toEqual([
      'register',
      'start',
      'transition:first:queued->accepted',
      'audit:first:accepted'
    ])
    releasePreparation()
    await expect(dispatch).resolves.toEqual({
      status: 'dispatched',
      followUpId: 'first',
      turnId: 'queued-turn-1'
    })
    expect(state.records.find((record) => record.id === 'first')?.status).toBe('delivered')
    expect(state.records.find((record) => record.id === 'second')?.status).toBe('queued')
    expect(state.calls.filter((call) => call === 'start')).toHaveLength(1)
    expect(state.calls.filter((call) => call === 'commit')).toHaveLength(1)
    expect(state.calls.filter((call) => call === 'emit-user-message')).toHaveLength(1)
    expect(state.calls.filter((call) => call === 'run')).toHaveLength(1)
    expect(state.runInputs[0].activeSkillIds).toEqual(['skill-1'])
  })

  it('preserves structured input order while persisting only metadata-safe display content', async () => {
    const localPath = 'C:\\secret\\camera.png'
    const input: TurnInputItem[] = [
      { type: 'text', text: 'before' },
      { type: 'localImage', path: localPath, name: 'camera.png' },
      { type: 'text', text: 'after' }
    ]
    const state = harness([queuedRecord('mixed', 0, input)])

    await dispatchNextQueuedFollowUp(
      { conversationId: 'conversation-1', model: 'model-1' },
      state.deps
    )

    const content = state.runInputs[0].injectedUserMessage.apiMessage.content
    expect(Array.isArray(content) ? content.map((item) => item.type) : []).toEqual([
      'text',
      'image_url',
      'text'
    ])
    expect(state.committedDisplays).toEqual(['before\n\n[Image: camera.png]\n\nafter'])
    expect(state.committedDisplays[0]).not.toContain(localPath)
    expect(state.runInputs[0].injectedUserMessage.messageId).toBe('message-mixed')
  })

  it('rejects an unreadable input without exposing its path and leaves later items queued', async () => {
    const secretPath = 'C:\\secret\\missing.png'
    const state = harness([
      queuedRecord('broken', 0, [{ type: 'localImage', path: secretPath }]),
      queuedRecord('later', 1)
    ])
    state.deps.prepareInput = async () => {
      throw new Error(`ENOENT: ${secretPath}`)
    }

    await expect(
      dispatchNextQueuedFollowUp({ conversationId: 'conversation-1', model: 'model-1' }, state.deps)
    ).resolves.toEqual({
      status: 'rejected',
      followUpId: 'broken',
      turnId: 'queued-turn-1'
    })
    expect(state.records.find((record) => record.id === 'broken')?.status).toBe('rejected')
    expect(state.records.find((record) => record.id === 'later')?.status).toBe('queued')
    expect(state.calls).toContain('settle:failed')
    expect(state.calls).not.toContain('commit')
    expect(state.calls).not.toContain('run')
    expect(state.rejectionMessages.join(' ')).not.toContain(secretPath)
  })

  it('does not relabel an already-delivered follow-up when the canonical turn fails', async () => {
    const state = harness([queuedRecord('provider-failure', 0)])
    state.deps.runTurn = async () => {
      state.calls.push('run')
      throw new Error('canonical turn failed')
    }

    await expect(
      dispatchNextQueuedFollowUp({ conversationId: 'conversation-1', model: 'model-1' }, state.deps)
    ).rejects.toThrow('canonical turn failed')
    expect(state.records[0].status).toBe('delivered')
    expect(state.calls).not.toContain('settle:failed')
  })

  it('continues the durable turn when renderer notification fails', async () => {
    const state = harness([queuedRecord('renderer-reload', 0)])
    state.deps.emitUserMessage = () => {
      state.calls.push('emit-user-message')
      throw new Error('renderer disappeared')
    }

    await expect(
      dispatchNextQueuedFollowUp({ conversationId: 'conversation-1', model: 'model-1' }, state.deps)
    ).resolves.toMatchObject({ status: 'dispatched', followUpId: 'renderer-reload' })
    expect(state.records[0].status).toBe('delivered')
    expect(state.calls).toContain('run')
    expect(state.calls).toContain('error:[queue] queued follow-up renderer notification failed')
  })
})

describe('queued follow-up production seam', () => {
  it('runs only through runHeadlessTurn and injects the structured message exactly once', () => {
    const chat = readFileSync(join(process.cwd(), 'electron/ipc/chat.ts'), 'utf8')
    const dispatcher = readFileSync(
      join(process.cwd(), 'electron/services/queued-follow-up-dispatch.ts'),
      'utf8'
    )

    expect(chat).toContain('runTurn: (queued: QueuedFollowUpRunInput) =>\n      runHeadlessTurn({')
    expect(chat).toContain('message.id !== input.injectedUserMessage?.messageId')
    expect(chat).toContain('apiMessages.push(input.injectedUserMessage.apiMessage)')
    expect(chat).toContain("settled && settlementStatus === 'completed'")
    expect(chat).toContain('dispatchQueuedFollowUpAfterCompletedTurn({ conversationId, model')
    expect(dispatcher).toContain("transitionFollowUp(followUp.id, 'accepted'")
    expect(dispatcher).toContain("transitionFollowUp(followUp.id, 'delivered'")
    expect(dispatcher).toContain("role: 'user'")
    expect(dispatcher).not.toMatch(/\b(?:chatStream|chatOnce|getProviderForModel)\s*\(/)
  })
})
