import type {
  ActiveTurnSnapshot,
  TurnControlSnapshot,
  TurnFollowUpRecord,
  TurnSettledEvent,
  TurnStartedEvent
} from './turn-control-types'
import type { TurnInputItem } from './turn-control-types'

export interface ConversationFollowUpState {
  activeTurn: ActiveTurnSnapshot | null
  followUps: TurnFollowUpRecord[]
  observedAt: number
  revision: number
}

export type FollowUpStateByConversation = Record<string, ConversationFollowUpState>

export const EMPTY_CONVERSATION_FOLLOW_UP_STATE: ConversationFollowUpState = Object.freeze({
  activeTurn: null,
  followUps: [],
  observedAt: 0,
  revision: 0
})

function cloneFollowUps(followUps: readonly TurnFollowUpRecord[]): TurnFollowUpRecord[] {
  return followUps.map((followUp) => ({
    ...followUp,
    input: followUp.input.map((item) => ({ ...item }))
  }))
}

export function getConversationFollowUpState(
  states: FollowUpStateByConversation,
  conversationId: string
): ConversationFollowUpState {
  return states[conversationId] ?? EMPTY_CONVERSATION_FOLLOW_UP_STATE
}

export function reconcileTurnControlSnapshot(
  current: ConversationFollowUpState | undefined,
  snapshot: TurnControlSnapshot
): ConversationFollowUpState {
  if (current && current.revision >= snapshot.revision) return current
  return {
    activeTurn: snapshot.activeTurn ? { ...snapshot.activeTurn } : null,
    followUps: cloneFollowUps(snapshot.followUps),
    observedAt: snapshot.observedAt,
    revision: snapshot.revision
  }
}

export function applyTurnStartedEvent(
  current: ConversationFollowUpState | undefined,
  event: TurnStartedEvent
): ConversationFollowUpState {
  const state = current ?? EMPTY_CONVERSATION_FOLLOW_UP_STATE
  if (event.revision <= state.revision) return state
  if (
    state.activeTurn &&
    state.activeTurn.turnId !== event.turnId &&
    state.activeTurn.startedAt > event.startedAt
  ) {
    return { ...state, observedAt: event.occurredAt, revision: event.revision }
  }
  return {
    ...state,
    activeTurn: {
      conversationId: event.conversationId,
      turnId: event.turnId,
      kind: event.kind,
      status: 'running',
      startedAt: event.startedAt
    },
    observedAt: event.occurredAt,
    revision: event.revision
  }
}

export function applyTurnSettledEvent(
  current: ConversationFollowUpState | undefined,
  event: TurnSettledEvent
): ConversationFollowUpState {
  const state = current ?? EMPTY_CONVERSATION_FOLLOW_UP_STATE
  if (event.revision <= state.revision) return state
  if (state.activeTurn && state.activeTurn.turnId !== event.turnId) {
    return { ...state, observedAt: event.occurredAt, revision: event.revision }
  }
  return {
    ...state,
    activeTurn: null,
    observedAt: event.occurredAt,
    revision: event.revision
  }
}

export function selectQueuedFollowUps(state: ConversationFollowUpState): TurnFollowUpRecord[] {
  return state.followUps
    .filter((followUp) => followUp.deliveryMode === 'queue' && followUp.status === 'queued')
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
}

export function selectRecoverableDrafts(state: ConversationFollowUpState): TurnFollowUpRecord[] {
  return state.followUps.filter((followUp) => ['rejected', 'recovered'].includes(followUp.status))
}

export function replaceFollowUpText(
  input: readonly TurnInputItem[],
  text: string
): TurnInputItem[] {
  const next = input.map((item) => ({ ...item }))
  const textIndex = next.findIndex((item) => item.type === 'text')
  if (textIndex === -1) return [{ type: 'text', text }, ...next]
  next[textIndex] = { type: 'text', text }
  return next
}

export function moveQueuedFollowUp(
  queued: readonly TurnFollowUpRecord[],
  followUpId: string,
  direction: -1 | 1
): string[] {
  const ordered = [...queued].sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
  const index = ordered.findIndex((item) => item.id === followUpId)
  const target = index + direction
  if (index === -1 || target < 0 || target >= ordered.length) {
    return ordered.map((item) => item.id)
  }
  ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
  return ordered.map((item) => item.id)
}

export function followUpText(input: readonly TurnInputItem[]): string {
  return (
    input.find((item): item is Extract<TurnInputItem, { type: 'text' }> => item.type === 'text')
      ?.text ?? ''
  )
}
