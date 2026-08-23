import { recordEvent, type RecordEventInput } from './event-log'
import { finalizeTurn, type FinalizeTurnDependencies } from './finalize-turn'
import { drainPendingArtifacts } from './pending-turn-artifacts'
import { drainPendingDocuments } from './pending-turn-documents'
import { recoverPendingRuntimeSteers } from './steer-delivery'
import { emitTurnSettled } from './turn-lifecycle-events'
import { turnRuntimeRegistry, type TurnRuntime, type TurnRuntimeRegistry } from './turn-runtime'
import type {
  FollowUpRejection,
  InterruptTurnRequest,
  InterruptTurnResult
} from './turn-control-types'

export type TurnInterruptEnvelope =
  | { success: true; data: InterruptTurnResult }
  | { success: false; error: string; rejection: FollowUpRejection }

export interface TurnInterruptRuntimeRegistry {
  lookupActive(conversationId: string): TurnRuntime | null
  settle: TurnRuntimeRegistry['settle']
}

export interface TurnInterruptDependencies {
  runtimes: TurnInterruptRuntimeRegistry
  now: () => number
  recoverPendingSteers: (runtime: TurnRuntime, reason: string) => number
  drainDocuments: (correlationId: string | undefined) => unknown
  drainArtifacts: (correlationId: string | undefined) => unknown
  record: (input: RecordEventInput) => unknown
  reportError: (message: string, error: unknown) => void
  emitSettled: FinalizeTurnDependencies['emitSettled']
}

const MAX_ID_LENGTH = 256
const INTERRUPT_KEYS = new Set(['conversationId', 'expectedTurnId'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStrictId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value
  )
}

function reject(rejection: FollowUpRejection): TurnInterruptEnvelope {
  return { success: false, error: rejection.message, rejection }
}

export function validateInterruptTurnRequest(
  raw: unknown
): { ok: true; value: InterruptTurnRequest } | { ok: false; rejection: FollowUpRejection } {
  if (!isRecord(raw)) {
    return {
      ok: false,
      rejection: { reason: 'invalidInput', message: 'interrupt request must be an object' }
    }
  }
  const unsupported = Object.keys(raw).find((key) => !INTERRUPT_KEYS.has(key))
  if (unsupported) {
    return {
      ok: false,
      rejection: {
        reason: 'invalidInput',
        message: `unsupported interrupt field: ${unsupported}`,
        field: unsupported
      }
    }
  }
  if (!isStrictId(raw.conversationId)) {
    return {
      ok: false,
      rejection: {
        reason: 'invalidInput',
        message: 'conversationId must be a non-empty bounded ID',
        field: 'conversationId'
      }
    }
  }
  if (!isStrictId(raw.expectedTurnId)) {
    return {
      ok: false,
      rejection: {
        reason: 'invalidInput',
        message: 'interrupt requires expectedTurnId',
        field: 'expectedTurnId'
      }
    }
  }
  return { ok: true, value: raw as unknown as InterruptTurnRequest }
}

export function createTurnInterruptAction(deps: TurnInterruptDependencies) {
  return (raw: unknown): TurnInterruptEnvelope => {
    const validated = validateInterruptTurnRequest(raw)
    if (!validated.ok) return reject(validated.rejection)
    const request = validated.value
    const runtime = deps.runtimes.lookupActive(request.conversationId)
    if (!runtime) {
      return reject({
        reason: 'noActiveTurn',
        message: 'There is no active turn to interrupt.',
        expectedTurnId: request.expectedTurnId
      })
    }
    if (runtime.turnId !== request.expectedTurnId) {
      return reject({
        reason: 'turnMismatch',
        message: 'The active turn no longer matches the requested turn.',
        expectedTurnId: request.expectedTurnId,
        activeTurnId: runtime.turnId
      })
    }

    const interruptedAt = deps.now()
    runtime.abort('user-interrupt')
    const { settled: persisted, recoveredFollowUps } = finalizeTurn(
      {
        runtime,
        status: 'cancelled',
        conversationId: runtime.conversationId,
        correlationId: runtime.correlationId,
        completedAt: interruptedAt,
        steerRecoveryReason: 'turn interrupted before pending Steering was delivered'
      },
      {
        recoverPendingSteers: deps.recoverPendingSteers,
        settle: (next, status, completedAt) => deps.runtimes.settle(next, status, completedAt),
        emitSettled: deps.emitSettled,
        drainDocuments: deps.drainDocuments,
        drainArtifacts: deps.drainArtifacts,
        reportError: deps.reportError
      }
    )

    try {
      deps.record({
        type: 'turn.interrupted',
        actorKind: 'user',
        severity: 'warning',
        conversationId: runtime.conversationId,
        correlationId: runtime.correlationId,
        entityKind: 'turn',
        entityId: runtime.turnId,
        payload: {
          disposition: 'interrupted',
          expectedTurnId: request.expectedTurnId,
          activeTurnId: runtime.turnId,
          interruptedAt,
          elapsedMs: Math.max(0, interruptedAt - runtime.startedAt),
          recoveredFollowUps,
          persisted
        }
      })
    } catch (error) {
      deps.reportError('[turn-interrupt] turn.interrupted event failed', error)
    }

    return {
      success: true,
      data: {
        turnId: runtime.turnId,
        status: 'cancelled',
        recoveredFollowUps,
        persisted
      }
    }
  }
}

export const interruptTurn = createTurnInterruptAction({
  runtimes: turnRuntimeRegistry,
  now: Date.now,
  recoverPendingSteers: recoverPendingRuntimeSteers,
  drainDocuments: drainPendingDocuments,
  drainArtifacts: drainPendingArtifacts,
  record: recordEvent,
  reportError: (message, error) => console.error(message, error),
  emitSettled: emitTurnSettled
})
