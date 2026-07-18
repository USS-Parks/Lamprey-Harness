import { emitChatEvent } from './chat-events'
import type { SettledTurnStatus, TurnRuntime } from './turn-runtime'

let turnControlRevision = 0

export function nextTurnControlRevision(): number {
  turnControlRevision += 1
  return turnControlRevision
}

export function emitTurnStarted(runtime: TurnRuntime): void {
  emitChatEvent('chat:turn-started', {
    conversationId: runtime.conversationId,
    turnId: runtime.turnId,
    kind: runtime.kind,
    status: 'running',
    startedAt: runtime.startedAt,
    occurredAt: Date.now(),
    revision: nextTurnControlRevision()
  })
}

export function emitTurnSettled(
  runtime: TurnRuntime,
  status: SettledTurnStatus,
  completedAt: number,
  persisted: boolean
): void {
  emitChatEvent('chat:turn-settled', {
    conversationId: runtime.conversationId,
    turnId: runtime.turnId,
    status,
    completedAt,
    occurredAt: Date.now(),
    persisted,
    revision: nextTurnControlRevision()
  })
}
