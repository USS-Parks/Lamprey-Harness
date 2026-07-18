import type { TurnRuntime, TurnWake } from './turn-runtime'

export type AgentWaitResult<T> =
  | { disposition: 'completed'; value: T }
  | { disposition: 'steered'; wake: TurnWake; completion: Promise<T> }

/**
 * Wait for agent work unless root-directed Steering arrives first. Steering
 * releases only the parent's wait; it never aborts the work or its tool side
 * effects. Targeted child Steering is ignored by this root-only waiter.
 */
export async function waitForAgentWork<T>(
  work: Promise<T>,
  runtime?: TurnRuntime | null,
  signal?: AbortSignal
): Promise<AgentWaitResult<T>> {
  if (!runtime) return { disposition: 'completed', value: await work }

  const settledWork = work.then(
    (value) => ({ kind: 'completed' as const, value }),
    (error: unknown) => ({ kind: 'failed' as const, error })
  )

  while (true) {
    const winner = await Promise.race([
      settledWork,
      runtime
        .waitForWake({ targetAgentRunId: null, signal })
        .then((wake) => ({ kind: 'wake' as const, wake }))
    ])
    if (winner.kind === 'completed') {
      return { disposition: 'completed', value: winner.value }
    }
    if (winner.kind === 'failed') throw winner.error
    if (winner.wake.reason === 'steer') {
      return { disposition: 'steered', wake: winner.wake, completion: work }
    }
    // Cancellation/settlement is enforced by the existing parent signal and
    // work promise. External wakes carry no transcript input, so wait again.
    if (winner.wake.reason === 'aborted' || winner.wake.reason === 'settled') {
      return { disposition: 'completed', value: await work }
    }
  }
}
