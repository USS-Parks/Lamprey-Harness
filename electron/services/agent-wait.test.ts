import { describe, expect, it, vi } from 'vitest'
import { waitForAgentWork } from './agent-wait'
import { TurnRuntimeRegistry } from './turn-runtime'
import type { FollowUpId } from './turn-control-types'

function runtimeHarness() {
  const registry = new TurnRuntimeRegistry({ createTurn: () => null, settleTurn: () => true })
  const runtime = registry.register({ conversationId: 'conversation-1', correlationId: 'run-1' })
  return { registry, runtime }
}

function pending(targetAgentRunId: string | null) {
  return {
    followUpId: 'follow-up-1' as FollowUpId,
    input: [{ type: 'text' as const, text: 'new direction' }],
    clientUserMessageId: null,
    targetAgentRunId,
    receivedAt: 1
  }
}

describe('ST-6 agent wait Steering', () => {
  it('returns ordinary work directly when no turn runtime owns the wait', async () => {
    await expect(waitForAgentWork(Promise.resolve('done'))).resolves.toEqual({
      disposition: 'completed',
      value: 'done'
    })
  })

  it('releases a root wait without aborting the in-flight work', async () => {
    const { runtime } = runtimeHarness()
    let finish!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finish = resolve
    })
    const observed = vi.fn()
    void work.then(observed)
    const waiting = waitForAgentWork(work, runtime)

    runtime.enqueueSteer(pending(null))
    const result = await waiting
    expect(result.disposition).toBe('steered')
    expect(observed).not.toHaveBeenCalled()

    finish('background result')
    if (result.disposition === 'steered') {
      await expect(result.completion).resolves.toBe('background result')
    }
    expect(observed).toHaveBeenCalledWith('background result')
  })

  it('does not release the root for child-targeted Steering', async () => {
    const { runtime } = runtimeHarness()
    runtime.registerSteerableAgent('child-1')
    let finish!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finish = resolve
    })
    const waiting = waitForAgentWork(work, runtime)

    runtime.enqueueSteer(pending('child-1'))
    finish('all children done')
    await expect(waiting).resolves.toEqual({
      disposition: 'completed',
      value: 'all children done'
    })
  })

  it('ignores an external wake and keeps waiting for work', async () => {
    const { runtime } = runtimeHarness()
    let finish!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finish = resolve
    })
    const waiting = waitForAgentWork(work, runtime)

    runtime.wakeExternal(null)
    finish('done')
    await expect(waiting).resolves.toEqual({ disposition: 'completed', value: 'done' })
  })
})
