import type { Goal, GoalAction } from './plan-goal-store'

export type GoalLoopTransitionHandler = (
  conversationId: string | undefined,
  goal: Goal,
  action: GoalAction
) => void

let handler: GoalLoopTransitionHandler | null = null

export function setGoalLoopTransitionHandler(next: GoalLoopTransitionHandler | null): void {
  handler = next
}

export function applyGoalLoopTransition(
  conversationId: string | undefined,
  goal: Goal,
  action: GoalAction
): void {
  handler?.(conversationId, goal, action)
}
