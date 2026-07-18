import { randomUUID } from 'crypto'
import { TurnControlStore, type CreateTurnInput } from './turn-control-store'
import {
  guardExpectedTurn,
  type ClientUserMessageId,
  type ExpectedTurnGuardResult,
  type FollowUpId,
  type TurnId,
  type TurnInputItem,
  type TurnKind,
  type TurnStatus
} from './turn-control-types'

export type SettledTurnStatus = Exclude<TurnStatus, 'running'>
export type TurnWakeReason = 'steer' | 'external' | 'aborted' | 'settled'
export type AgentSteerTargetDisposition = 'steerable' | 'completed' | 'unknown'

const SETTLED_AGENT_TARGET_CAP = 64

export interface PendingSteer {
  followUpId: FollowUpId
  input: TurnInputItem[]
  clientUserMessageId: ClientUserMessageId | null
  targetAgentRunId: string | null
  receivedAt: number
}

export interface TurnWake {
  turnId: TurnId
  reason: TurnWakeReason
  targetAgentRunId: string | null
  pendingSteerCount: number
}

export interface RegisterTurnRuntimeInput {
  conversationId: string
  correlationId: string
  kind?: TurnKind
  turnId?: TurnId
  controller?: AbortController
  startedAt?: number
  activeAgentRunId?: string | null
}

export interface TurnRuntimePersistence {
  createTurn(input: CreateTurnInput): unknown
  settleTurn(
    id: string,
    status: SettledTurnStatus,
    completedAt: number,
    recoveryReason?: string
  ): boolean
}

interface WakeWaiter {
  targetAgentRunId: string | null | undefined
  resolve: (wake: TurnWake) => void
  cleanup: () => void
}

function cloneInput(items: TurnInputItem[]): TurnInputItem[] {
  return items.map((item) => ({ ...item }))
}

export class TurnRuntime {
  readonly conversationId: string
  readonly turnId: TurnId
  readonly correlationId: string
  readonly kind: TurnKind
  readonly controller: AbortController
  readonly startedAt: number

  #status: TurnStatus = 'running'
  #activeAgentRunId: string | null
  #steerableAgentRunIds = new Set<string>()
  #settledAgentRunIds = new Set<string>()
  #steerInbox: PendingSteer[] = []
  #waiters = new Set<WakeWaiter>()

  constructor(
    input: Required<Pick<RegisterTurnRuntimeInput, 'conversationId' | 'correlationId'>> & {
      turnId: TurnId
      kind: TurnKind
      controller: AbortController
      startedAt: number
      activeAgentRunId: string | null
    }
  ) {
    this.conversationId = input.conversationId
    this.turnId = input.turnId
    this.correlationId = input.correlationId
    this.kind = input.kind
    this.controller = input.controller
    this.startedAt = input.startedAt
    this.#activeAgentRunId = input.activeAgentRunId
  }

  get status(): TurnStatus {
    return this.#status
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  get activeAgentRunId(): string | null {
    return this.#activeAgentRunId
  }

  get pendingSteers(): readonly PendingSteer[] {
    return this.#steerInbox
  }

  get identity(): {
    conversationId: string
    turnId: TurnId
    kind: TurnKind
    status: TurnStatus
  } {
    return {
      conversationId: this.conversationId,
      turnId: this.turnId,
      kind: this.kind,
      status: this.#status
    }
  }

  setActiveAgentTarget(agentRunId: string | null): void {
    this.#activeAgentRunId = agentRunId
  }

  registerSteerableAgent(agentRunId: string): void {
    if (this.#status !== 'running') {
      throw new Error(`turn-runtime: cannot register an agent on a ${this.#status} turn`)
    }
    this.#settledAgentRunIds.delete(agentRunId)
    this.#steerableAgentRunIds.add(agentRunId)
    this.#activeAgentRunId = agentRunId
  }

  unregisterSteerableAgent(agentRunId: string): void {
    if (!this.#steerableAgentRunIds.delete(agentRunId)) return
    this.#settledAgentRunIds.add(agentRunId)
    while (this.#settledAgentRunIds.size > SETTLED_AGENT_TARGET_CAP) {
      const oldest = this.#settledAgentRunIds.values().next().value
      if (oldest === undefined) break
      this.#settledAgentRunIds.delete(oldest)
    }
    if (this.#activeAgentRunId === agentRunId) {
      this.#activeAgentRunId = [...this.#steerableAgentRunIds].at(-1) ?? null
    }
  }

  classifyAgentTarget(agentRunId: string): AgentSteerTargetDisposition {
    if (this.#steerableAgentRunIds.has(agentRunId)) return 'steerable'
    if (this.#settledAgentRunIds.has(agentRunId)) return 'completed'
    return 'unknown'
  }

  listSteerableAgentRunIds(): string[] {
    return [...this.#steerableAgentRunIds]
  }

  enqueueSteer(steer: PendingSteer): void {
    if (this.#status !== 'running') {
      throw new Error(`turn-runtime: cannot steer a ${this.#status} turn`)
    }
    if (
      steer.targetAgentRunId !== null &&
      this.classifyAgentTarget(steer.targetAgentRunId) !== 'steerable'
    ) {
      throw new Error(`turn-runtime: agent target ${steer.targetAgentRunId} is not steerable`)
    }
    const retained: PendingSteer = {
      ...steer,
      input: cloneInput(steer.input)
    }
    this.#steerInbox.push(retained)
    this.#wake('steer', retained.targetAgentRunId)
  }

  drainSteers(targetAgentRunId: string | null = null): PendingSteer[] {
    const delivered: PendingSteer[] = []
    const retained: PendingSteer[] = []
    for (const steer of this.#steerInbox) {
      if (steer.targetAgentRunId === targetAgentRunId) delivered.push(steer)
      else retained.push(steer)
    }
    this.#steerInbox = retained
    return delivered
  }

  drainAllSteers(): PendingSteer[] {
    const drained = this.#steerInbox
    this.#steerInbox = []
    return drained
  }

  restoreSteers(steers: PendingSteer[]): void {
    if (steers.length === 0) return
    if (this.status !== 'running') {
      throw new Error(`cannot restore Steering to a ${this.status} turn`)
    }
    this.#steerInbox = [...steers, ...this.#steerInbox]
  }

  waitForWake(
    options: {
      signal?: AbortSignal
      /** undefined observes every wake; null observes only the root inbox. */
      targetAgentRunId?: string | null
    } = {}
  ): Promise<TurnWake> {
    const immediateSteer = this.#steerInbox.find(
      (steer) =>
        options.targetAgentRunId === undefined ||
        steer.targetAgentRunId === options.targetAgentRunId
    )
    if (immediateSteer) {
      return Promise.resolve(this.#buildWake('steer', immediateSteer.targetAgentRunId))
    }
    if (this.#status !== 'running') {
      return Promise.resolve(this.#buildWake('settled', options.targetAgentRunId ?? null))
    }
    if (this.signal.aborted || options.signal?.aborted) {
      return Promise.resolve(this.#buildWake('aborted', options.targetAgentRunId ?? null))
    }

    return new Promise<TurnWake>((resolve) => {
      const onAbort = (): void => {
        if (!this.#waiters.delete(waiter)) return
        waiter.cleanup()
        resolve(this.#buildWake('aborted', options.targetAgentRunId ?? null))
      }
      const cleanup = (): void => {
        this.signal.removeEventListener('abort', onAbort)
        options.signal?.removeEventListener('abort', onAbort)
      }
      const waiter: WakeWaiter = { targetAgentRunId: options.targetAgentRunId, resolve, cleanup }
      this.#waiters.add(waiter)
      this.signal.addEventListener('abort', onAbort, { once: true })
      options.signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  wakeExternal(targetAgentRunId: string | null = null): void {
    if (this.#status === 'running') this.#wake('external', targetAgentRunId)
  }

  abort(reason?: unknown): void {
    if (!this.signal.aborted) this.controller.abort(reason)
    this.#wake('aborted', null)
  }

  linkAbortSignal(signal: AbortSignal): () => void {
    const onAbort = (): void => this.abort(signal.reason)
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
    return () => signal.removeEventListener('abort', onAbort)
  }

  markSettled(status: SettledTurnStatus): boolean {
    if (this.#status !== 'running') return false
    this.#status = status
    this.#wake('settled', null)
    return true
  }

  #buildWake(reason: TurnWakeReason, targetAgentRunId: string | null): TurnWake {
    return {
      turnId: this.turnId,
      reason,
      targetAgentRunId,
      pendingSteerCount: this.#steerInbox.length
    }
  }

  #wake(reason: TurnWakeReason, targetAgentRunId: string | null): void {
    for (const waiter of [...this.#waiters]) {
      if (
        (reason === 'steer' || reason === 'external') &&
        waiter.targetAgentRunId !== undefined &&
        waiter.targetAgentRunId !== targetAgentRunId
      ) {
        continue
      }
      this.#waiters.delete(waiter)
      waiter.cleanup()
      waiter.resolve(this.#buildWake(reason, targetAgentRunId))
    }
  }
}

export class TurnRuntimeRegistry {
  #runtimes = new Map<string, TurnRuntime>()
  #persistence: TurnRuntimePersistence | null

  constructor(persistence: TurnRuntimePersistence | null = null) {
    this.#persistence = persistence
  }

  register(input: RegisterTurnRuntimeInput): TurnRuntime {
    const existing = this.lookupActive(input.conversationId)
    if (existing) {
      throw new Error(
        `turn-runtime: conversation ${input.conversationId} already has running turn ${existing.turnId}`
      )
    }

    const runtime = new TurnRuntime({
      conversationId: input.conversationId,
      correlationId: input.correlationId,
      turnId: input.turnId ?? (randomUUID() as TurnId),
      kind: input.kind ?? 'regular',
      controller: input.controller ?? new AbortController(),
      startedAt: input.startedAt ?? Date.now(),
      activeAgentRunId: input.activeAgentRunId ?? null
    })

    this.#getPersistence().createTurn({
      id: runtime.turnId,
      conversationId: runtime.conversationId,
      kind: runtime.kind,
      correlationId: runtime.correlationId,
      activeAgentRunId: runtime.activeAgentRunId,
      startedAt: runtime.startedAt
    })
    this.#runtimes.set(runtime.conversationId, runtime)
    return runtime
  }

  lookupActive(conversationId: string): TurnRuntime | null {
    const runtime = this.#runtimes.get(conversationId)
    return runtime?.status === 'running' ? runtime : null
  }

  lookupExpected(conversationId: string, expectedTurnId: string): ExpectedTurnGuardResult {
    return guardExpectedTurn(this.lookupActive(conversationId)?.identity, expectedTurnId)
  }

  abort(conversationId: string, expectedTurnId?: string): TurnRuntime | null {
    const runtime = this.lookupActive(conversationId)
    if (!runtime || (expectedTurnId !== undefined && runtime.turnId !== expectedTurnId)) return null
    runtime.abort()
    return runtime
  }

  settle(
    runtime: TurnRuntime,
    status: SettledTurnStatus,
    completedAt = Date.now(),
    recoveryReason?: string
  ): boolean {
    if (!runtime.markSettled(status)) return false
    if (this.#runtimes.get(runtime.conversationId) === runtime) {
      this.#runtimes.delete(runtime.conversationId)
    }
    this.#getPersistence().settleTurn(runtime.turnId, status, completedAt, recoveryReason)
    return true
  }

  #getPersistence(): TurnRuntimePersistence {
    this.#persistence ??= new TurnControlStore()
    return this.#persistence
  }
}

export const turnRuntimeRegistry = new TurnRuntimeRegistry()
