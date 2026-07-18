import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('ST-6 agent Steering wiring locks', () => {
  it('continues a selected child inside the existing forkAgent handle and run id', () => {
    const source = read('electron/services/subagent-runner.ts')
    expect(source).toContain('steeringRuntime.registerSteerableAgent(runId)')
    expect(source).toContain('await deps.runner({ ...runnerInput, messages: currentMessages })')
    expect(source).toContain('await deps.consumeSteers!(')
    expect(source).toContain('steeringRuntime.unregisterSteerableAgent(runId)')
    const providerLoop = source.slice(
      source.indexOf('const runProviderPass = async'),
      source.indexOf('// B5: schema-mode retry loop')
    )
    expect(providerLoop).not.toContain('forkAgent(')
  })

  it('wires root wait release and child persistence without dropping governance', () => {
    const executor = read('electron/services/multi-agent-run-tool.ts')
    const pack = read('electron/services/multi-agent-run-tool-pack.ts')
    expect(executor).toContain('waitForAgentWork(completion, opts.turnRuntime, opts.parentSignal)')
    expect(executor).toContain('pendingAgentRunIds: runs')
    expect(pack).toContain('identityId = governFork({')
    expect(pack).toContain('agentRunStore: realAgentRunStore')
    expect(pack).toContain('notify: broadcastAgentRunEvent')
    expect(pack).toContain('consumeSteersAtBoundary(turn, messages, modelId, targetAgentRunId)')
    expect(pack).toContain('settleRunSpend(identityId, tokens, wallMs)')
  })

  it('routes every strategy wait through the root-only non-aborting wait helper', () => {
    const strategies = read('electron/services/orchestration-tool-pack.ts')
    const wait = read('electron/services/agent-wait.ts')
    expect(strategies.match(/waitForStrategyWork\(\{/g)).toHaveLength(3)
    expect(wait).toContain('targetAgentRunId: null')
    expect(wait).not.toMatch(/\.abort\(|controller\.abort/)
  })

  it('rejects completed and unknown targets before creating a sibling or follow-up row', () => {
    const control = read('electron/ipc/turn-control.ts')
    const validation = control.slice(
      control.indexOf('if (submission.targetAgentRunId)'),
      control.indexOf('try {\n      const created = deps.store.createFollowUp')
    )
    expect(validation).toContain("reason: 'targetNotFound'")
    expect(validation).toContain("reason: 'targetNotSteerable'")
    expect(validation).not.toContain('forkAgent(')
  })

  it('preserves the existing live-handle kill path', () => {
    const tasks = read('electron/ipc/tasks.ts')
    expect(tasks).toContain('const handle = getLiveHandle(id)')
    expect(tasks).toContain("handle.abort('user-stop')")
    expect(tasks).toContain('const childrenAborted = killTree(id)')
  })
})
