import { drainPendingArtifacts } from './pending-turn-artifacts'
import { drainPendingDocuments } from './pending-turn-documents'
import { recoverPendingRuntimeSteers } from './steer-delivery'
import { emitTurnSettled } from './turn-lifecycle-events'
import {
  turnRuntimeRegistry,
  type SettledTurnStatus,
  type TurnRuntime
} from './turn-runtime'

export interface FinalizeTurnQueueInput {
  conversationId: string
  model: string
  activeSkillIds?: string[]
}

export interface FinalizeTurnInput {
  runtime: TurnRuntime
  status: SettledTurnStatus
  conversationId: string
  model?: string
  activeSkillIds?: string[]
  correlationId?: string
  steerRecoveryReason?: string
  completedAt?: number
  dispatchQueue?: (input: FinalizeTurnQueueInput) => void
}

export interface FinalizeTurnResult {
  settled: boolean
  recoveredFollowUps: number
}

export interface FinalizeTurnDependencies {
  recoverPendingSteers: (runtime: TurnRuntime, reason: string) => number
  settle: (runtime: TurnRuntime, status: SettledTurnStatus, completedAt: number) => boolean
  emitSettled: (
    runtime: TurnRuntime,
    status: SettledTurnStatus,
    completedAt: number,
    persisted: boolean
  ) => void
  drainDocuments: (correlationId: string | undefined) => unknown
  drainArtifacts: (correlationId: string | undefined) => unknown
  reportError: (message: string, error: unknown) => void
}

function defaultSettle(
  runtime: TurnRuntime,
  status: SettledTurnStatus,
  completedAt: number
): boolean {
  return turnRuntimeRegistry.settle(runtime, status, completedAt)
}

export const defaultFinalizeTurnDependencies: FinalizeTurnDependencies = {
  recoverPendingSteers: recoverPendingRuntimeSteers,
  settle: defaultSettle,
  emitSettled: emitTurnSettled,
  drainDocuments: drainPendingDocuments,
  drainArtifacts: drainPendingArtifacts,
  reportError: (message, error) => console.error(message, error)
}

function defaultSteerReason(status: SettledTurnStatus): string {
  return status === 'completed'
    ? 'turn completed before pending Steering was delivered'
    : `turn settled as ${status} before pending Steering was delivered`
}

export function finalizeTurn(
  input: FinalizeTurnInput,
  deps: FinalizeTurnDependencies = defaultFinalizeTurnDependencies
): FinalizeTurnResult {
  const completedAt = input.completedAt ?? Date.now()
  const correlationId = input.correlationId ?? input.runtime.correlationId
  let recoveredFollowUps = 0

  if (input.runtime.pendingSteers.length > 0) {
    try {
      recoveredFollowUps = deps.recoverPendingSteers(
        input.runtime,
        input.steerRecoveryReason ?? defaultSteerReason(input.status)
      )
    } catch (error) {
      deps.reportError('[finalize-turn] pending Steer recovery failed', error)
    }
  }

  let settled: boolean
  try {
    settled = deps.settle(input.runtime, input.status, completedAt)
    if (settled) deps.emitSettled(input.runtime, input.status, completedAt, true)
  } catch (error) {
    settled = false
    deps.reportError('[finalize-turn] settlement persistence failed', error)
    deps.emitSettled(input.runtime, input.status, completedAt, false)
  }

  deps.drainDocuments(correlationId)
  deps.drainArtifacts(correlationId)

  if (settled && input.status === 'completed' && input.model && input.dispatchQueue) {
    input.dispatchQueue({
      conversationId: input.conversationId,
      model: input.model,
      activeSkillIds: input.activeSkillIds
    })
  }

  return { settled, recoveredFollowUps }
}
