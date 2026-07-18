import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: electronMocks.handle } }))

import {
  createTurnControlActions,
  recoverTurnControlOnStartup,
  registerTurnControlHandlers,
  type TurnControlDependencies,
  type TurnControlStoreLike
} from './turn-control'
import { TurnRuntimeRegistry } from '../services/turn-runtime'
import type {
  CreateFollowUpResult,
  FollowUpRecord,
  FollowUpTransitionDetails
} from '../services/turn-control-store'
import type {
  FollowUpId,
  FollowUpStatus,
  FollowUpSubmission,
  TurnId,
  TurnInputItem
} from '../services/turn-control-types'

class FakeStore implements TurnControlStoreLike {
  records = new Map<string, FollowUpRecord>()
  createCalls = 0
  activeTurn: ReturnType<TurnControlStoreLike['getActiveTurn']> = null

  createFollowUp(input: {
    id: FollowUpId
    submission: FollowUpSubmission
    createdAt: number
  }): CreateFollowUpResult {
    this.createCalls += 1
    const existing = input.submission.clientUserMessageId
      ? this.findByClientMessageId(
          input.submission.conversationId,
          input.submission.clientUserMessageId
        )
      : null
    if (existing) return { record: existing, duplicate: true }
    const queued = [...this.records.values()].filter(
      (row) => row.conversationId === input.submission.conversationId && row.status === 'queued'
    )
    const record: FollowUpRecord = {
      id: input.id,
      conversationId: input.submission.conversationId,
      turnId:
        input.submission.deliveryMode === 'steer'
          ? (input.submission.expectedTurnId ?? null)
          : null,
      expectedTurnId: input.submission.expectedTurnId ?? null,
      clientUserMessageId: input.submission.clientUserMessageId ?? null,
      deliveryMode: input.submission.deliveryMode,
      status: input.submission.deliveryMode === 'steer' ? 'accepted' : 'queued',
      inputVersion: 1,
      input: input.submission.input.map((item) => ({ ...item })),
      position: input.submission.deliveryMode === 'queue' ? queued.length : null,
      actor: input.submission.actor,
      sourceConversationId: input.submission.sourceConversationId ?? null,
      sourceTaskId: input.submission.sourceTaskId ?? null,
      targetAgentRunId: input.submission.targetAgentRunId ?? null,
      rejectionReason: null,
      rejectionMessage: null,
      recoveryReason: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      deliveredAt: null,
      finalizedAt: null
    }
    this.records.set(record.id, record)
    return { record, duplicate: false }
  }

  findByClientMessageId(conversationId: string, clientUserMessageId: string) {
    return (
      [...this.records.values()].find(
        (row) =>
          row.conversationId === conversationId && row.clientUserMessageId === clientUserMessageId
      ) ?? null
    )
  }

  getFollowUp(id: string) {
    return this.records.get(id) ?? null
  }

  listFollowUps(conversationId: string) {
    return [...this.records.values()].filter((row) => row.conversationId === conversationId)
  }

  getActiveTurn(conversationId: string) {
    return this.activeTurn?.conversationId === conversationId ? this.activeTurn : null
  }

  updateFollowUpInput(id: string, input: TurnInputItem[], updatedAt: number) {
    const current = this.records.get(id)
    if (!current || !['queued', 'rejected', 'recovered'].includes(current.status)) {
      throw new Error('follow-up is not editable')
    }
    const updated = { ...current, input, updatedAt }
    this.records.set(id, updated)
    return updated
  }

  reorderQueuedFollowUps(conversationId: string, orderedIds: readonly string[], updatedAt: number) {
    const queued = this.listFollowUps(conversationId).filter((row) => row.status === 'queued')
    if (
      orderedIds.length !== queued.length ||
      [...orderedIds].sort().join() !==
        queued
          .map((row) => row.id)
          .sort()
          .join()
    ) {
      throw new Error('reorder must contain every queued follow-up exactly once')
    }
    orderedIds.forEach((id, position) => {
      const current = this.records.get(id)!
      this.records.set(id, { ...current, position, updatedAt })
    })
    return orderedIds.map((id) => this.records.get(id)!)
  }

  transitionFollowUp(
    id: string,
    status: FollowUpStatus,
    updatedAt: number,
    details: FollowUpTransitionDetails = {}
  ) {
    const current = this.records.get(id)
    if (!current) throw new Error('follow-up not found')
    if (status === 'deleted' && !['queued', 'rejected', 'recovered'].includes(current.status)) {
      throw new Error(`${current.status} follow-up cannot be deleted`)
    }
    const updated: FollowUpRecord = {
      ...current,
      status,
      turnId: details.turnId ?? current.turnId,
      expectedTurnId: details.expectedTurnId ?? current.expectedTurnId,
      rejectionReason: details.rejectionReason ?? null,
      rejectionMessage: details.rejectionMessage ?? null,
      recoveryReason: details.recoveryReason ?? null,
      updatedAt,
      deliveredAt: status === 'delivered' ? updatedAt : null,
      finalizedAt: ['delivered', 'rejected', 'cancelled', 'recovered', 'deleted'].includes(status)
        ? updatedAt
        : null
    }
    this.records.set(id, updated)
    return updated
  }
}

function makeHarness() {
  const store = new FakeStore()
  const runtimes = new TurnRuntimeRegistry({ createTurn: () => null, settleTurn: () => true })
  let now = 100
  let id = 0
  const deps: TurnControlDependencies = {
    store,
    runtimes,
    now: () => now++,
    newId: () => `follow-up-${++id}` as FollowUpId
  }
  return { store, runtimes, deps, actions: createTurnControlActions(deps) }
}

function submission(
  deliveryMode: 'steer' | 'queue',
  overrides: Partial<FollowUpSubmission> = {}
): FollowUpSubmission {
  return {
    conversationId: 'conversation-1',
    deliveryMode,
    input: [
      { type: 'text', text: 'first' },
      {
        type: 'localImage',
        path: 'C:\\tmp\\image.png',
        mimeType: 'image/png',
        name: 'image.png',
        sizeBytes: 42
      }
    ],
    actor: 'user',
    ...(deliveryMode === 'steer' ? { expectedTurnId: 'turn-1' as TurnId } : {}),
    ...overrides
  }
}

describe('ST-4 typed Steering and Queue actions', () => {
  beforeEach(() => electronMocks.handle.mockClear())

  it('accepts a validated Steer, persists it once, and retains ordered input in the inbox', () => {
    const { actions, runtimes, store } = makeHarness()
    const runtime = runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })

    const result = actions.steer(submission('steer', { clientUserMessageId: 'client-1' as any }))

    expect(result).toMatchObject({
      success: true,
      data: { duplicate: false, followUp: { status: 'accepted', turnId: 'turn-1' } }
    })
    expect(store.createCalls).toBe(1)
    expect(runtime.pendingSteers).toHaveLength(1)
    expect(runtime.pendingSteers[0]?.input).toEqual(submission('steer').input)
  })

  it.each([
    ['no active turn', null, 'turn-1', 'noActiveTurn'],
    ['turn mismatch', 'regular', 'wrong-turn', 'turnMismatch'],
    ['non-steerable kind', 'review', 'turn-1', 'nonSteerableTurn']
  ] as const)('rejects %s before persistence', (_label, kind, expectedTurnId, reason) => {
    const { actions, runtimes, store } = makeHarness()
    if (kind) {
      runtimes.register({
        conversationId: 'conversation-1',
        correlationId: 'correlation-1',
        turnId: 'turn-1' as TurnId,
        kind
      })
    }
    const result = actions.steer(submission('steer', { expectedTurnId: expectedTurnId as TurnId }))
    expect(result).toMatchObject({ success: false, rejection: { reason } })
    expect(store.createCalls).toBe(0)
  })

  it('rejects unsupported input and settings overrides before persistence', () => {
    const { actions, store } = makeHarness()
    expect(
      actions.steer({ ...submission('steer'), input: [{ type: 'audio', data: 'secret' }] })
    ).toMatchObject({ success: false, rejection: { reason: 'unsupportedInput' } })
    expect(actions.queue({ ...submission('queue'), model: 'override' })).toMatchObject({
      success: false,
      rejection: { reason: 'settingsOverride', field: 'model' }
    })
    expect(store.createCalls).toBe(0)
  })

  it('accepts only the selected live child and rejects completed or unknown targets', () => {
    const { actions, runtimes, store } = makeHarness()
    const runtime = runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })
    runtime.registerSteerableAgent('child-live')

    expect(actions.steer(submission('steer', { targetAgentRunId: 'child-live' }))).toMatchObject({
      success: true,
      data: { followUp: { targetAgentRunId: 'child-live' } }
    })
    expect(runtime.pendingSteers).toHaveLength(1)
    expect(runtime.listSteerableAgentRunIds()).toEqual(['child-live'])

    runtime.unregisterSteerableAgent('child-live')
    expect(actions.steer(submission('steer', { targetAgentRunId: 'child-live' }))).toMatchObject({
      success: false,
      rejection: { reason: 'targetNotSteerable' }
    })
    expect(actions.steer(submission('steer', { targetAgentRunId: 'never-spawned' }))).toMatchObject(
      { success: false, rejection: { reason: 'targetNotFound' } }
    )
    expect(store.createCalls).toBe(1)
  })

  it('deduplicates an exact client retry even after the target turn settles', () => {
    const { actions, runtimes, store } = makeHarness()
    const runtime = runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })
    const request = submission('steer', { clientUserMessageId: 'client-1' as any })
    const first = actions.steer(request)
    runtimes.settle(runtime, 'completed', 500)

    expect(actions.steer(request)).toMatchObject({
      success: true,
      data: { duplicate: true, followUp: { id: 'follow-up-1' } }
    })
    expect(
      actions.steer({ ...request, input: [{ type: 'text', text: 'changed retry' }] })
    ).toMatchObject({
      success: false,
      rejection: { reason: 'duplicateClientMessage' }
    })
    expect(first).toMatchObject({ success: true })
    expect(store.createCalls).toBe(1)
  })

  it('settles a persisted Steer as rejected if inbox retention fails', () => {
    const { actions, runtimes, store } = makeHarness()
    const runtime = runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })
    vi.spyOn(runtime, 'enqueueSteer').mockImplementation(() => {
      throw new Error('turn settled')
    })

    expect(actions.steer(submission('steer'))).toMatchObject({
      success: false,
      rejection: { reason: 'turnNotRunning' }
    })
    expect(store.getFollowUp('follow-up-1')).toMatchObject({
      status: 'rejected',
      rejectionReason: 'turnNotRunning'
    })
  })

  it('queues deterministically without an active runtime and enforces channel mode', () => {
    const { actions } = makeHarness()
    expect(actions.queue(submission('queue'))).toMatchObject({
      success: true,
      data: { followUp: { status: 'queued', position: 0 } }
    })
    expect(
      actions.queue(submission('queue', { input: [{ type: 'text', text: 'second' }] }))
    ).toMatchObject({
      success: true,
      data: { followUp: { position: 1 } }
    })
    expect(actions.steer(submission('queue'))).toMatchObject({
      success: false,
      rejection: { reason: 'invalidInput', field: 'deliveryMode' }
    })
  })

  it('lists, edits, reorders, and deletes owned queued records', () => {
    const { actions } = makeHarness()
    actions.queue(submission('queue'))
    actions.queue(submission('queue', { input: [{ type: 'text', text: 'second' }] }))

    expect(actions.listFollowUps('conversation-1')).toMatchObject({
      success: true,
      data: [{ id: 'follow-up-1' }, { id: 'follow-up-2' }]
    })
    expect(
      actions.updateFollowUp({
        conversationId: 'conversation-1',
        followUpId: 'follow-up-1',
        input: [{ type: 'text', text: 'edited' }]
      })
    ).toMatchObject({ success: true, data: { input: [{ text: 'edited' }] } })
    expect(
      actions.reorderFollowUps({
        conversationId: 'conversation-1',
        orderedIds: ['follow-up-2', 'follow-up-1']
      })
    ).toMatchObject({
      success: true,
      data: [
        { id: 'follow-up-2', position: 0 },
        { id: 'follow-up-1', position: 1 }
      ]
    })
    expect(
      actions.deleteFollowUp({ conversationId: 'conversation-1', followUpId: 'follow-up-1' })
    ).toMatchObject({ success: true, data: { status: 'deleted' } })
  })

  it('hydrates one conversation snapshot with active identity and ordered follow-ups', () => {
    const { actions, runtimes, store } = makeHarness()
    store.activeTurn = {
      id: 'turn-1' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      status: 'running',
      correlationId: 'correlation-1',
      activeAgentRunId: null,
      startedAt: 50,
      completedAt: null,
      recoveryReason: null,
      createdAt: 50,
      updatedAt: 50
    }
    runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId,
      startedAt: 50
    })
    actions.queue(submission('queue'))
    expect(actions.getState('conversation-1')).toMatchObject({
      success: true,
      data: {
        conversationId: 'conversation-1',
        activeTurn: { turnId: 'turn-1', status: 'running', startedAt: 50 },
        followUps: [{ id: 'follow-up-1', status: 'queued', position: 0 }],
        observedAt: expect.any(Number)
      }
    })
  })

  it('does not resurrect a durable orphan without a matching live runtime', () => {
    const { actions, store } = makeHarness()
    store.activeTurn = {
      id: 'orphan-turn' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      status: 'running',
      correlationId: 'correlation-orphan',
      activeAgentRunId: null,
      startedAt: 10,
      completedAt: null,
      recoveryReason: null,
      createdAt: 10,
      updatedAt: 10
    }
    expect(actions.getState('conversation-1')).toMatchObject({
      success: true,
      data: { activeTurn: null }
    })
  })

  it('send-now requires the exact active turn and never silently consumes a queue item', () => {
    const { actions, runtimes, store } = makeHarness()
    actions.queue(submission('queue'))

    expect(
      actions.sendFollowUpNow({
        conversationId: 'conversation-1',
        followUpId: 'follow-up-1',
        expectedTurnId: 'turn-1'
      })
    ).toMatchObject({ success: false, rejection: { reason: 'noActiveTurn' } })
    expect(store.getFollowUp('follow-up-1')).toMatchObject({ status: 'queued' })

    const runtime = runtimes.register({
      conversationId: 'conversation-1',
      correlationId: 'correlation-1',
      turnId: 'turn-1' as TurnId
    })
    expect(
      actions.sendFollowUpNow({
        conversationId: 'conversation-1',
        followUpId: 'follow-up-1',
        expectedTurnId: 'turn-1'
      })
    ).toMatchObject({
      success: true,
      data: { status: 'accepted', turnId: 'turn-1', expectedTurnId: 'turn-1' }
    })
    expect(runtime.pendingSteers.map((item) => item.followUpId)).toEqual(['follow-up-1'])
  })

  it('registers all nine IPC channels with standard envelope-returning handlers', async () => {
    const { deps } = makeHarness()
    registerTurnControlHandlers(deps)
    expect(electronMocks.handle.mock.calls.map(([channel]) => channel)).toEqual([
      'turn:interrupt',
      'turn:steer',
      'turn:queue',
      'turn:listFollowups',
      'turn:getState',
      'turn:updateFollowup',
      'turn:reorderFollowups',
      'turn:sendFollowupNow',
      'turn:deleteFollowup'
    ])
    const listHandler = electronMocks.handle.mock.calls[3]?.[1]
    await expect(listHandler({}, '')).resolves.toMatchObject({
      success: false,
      error: expect.any(String),
      rejection: { reason: 'invalidInput' }
    })
  })

  it('recovers startup orphans once and emits only bounded recovery counts', () => {
    const recoverOrphans = vi.fn(() => ({ turns: 2, followUps: 3 }))
    const record = vi.fn()
    expect(recoverTurnControlOnStartup({ recoverOrphans }, 500, record)).toEqual({
      turns: 2,
      followUps: 3
    })
    expect(recoverOrphans).toHaveBeenCalledWith(
      500,
      'application restart: in-flight delivery was not confirmed'
    )
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'persistence.recovery',
        payload: expect.objectContaining({ recoveredTurns: 2, recoveredFollowUps: 3 })
      })
    )

    record.mockClear()
    recoverTurnControlOnStartup({ recoverOrphans: () => ({ turns: 0, followUps: 0 }) }, 501, record)
    expect(record).not.toHaveBeenCalled()
  })
})
