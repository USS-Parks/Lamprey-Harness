import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ORCHESTRATION_CONFIG_DEFAULTS, resolveOrchestrationConfig } from './orchestration-config'

// AO-1 seed → completed at AO-11. Orchestration is a deliberate past-era
// extension that ships OFF by default; this suite source-locks the master
// toggle default and — as later prompts land — the gate at every entry point
// enumerated in AO_BASELINE §3 (dispatch-array strip, slash commands, agents:*
// IPC, loop outcome envelope), so a future edit can't silently arm it.
//
// Per-feature gate assertions accrete here through AO-6..AO-9; AO-11 completes
// the enumeration and re-measures the prompt-surface byte baseline.

const root = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(root, p), 'utf-8')

describe('AO-1 orchestration safety — defaults + config', () => {
  it('the master toggle defaults OFF', () => {
    expect(ORCHESTRATION_CONFIG_DEFAULTS.enabled).toBe(false)
  })

  it('resolveOrchestrationConfig returns OFF + bounded for an empty/null settings object', () => {
    expect(resolveOrchestrationConfig(null).enabled).toBe(false)
    const empty = resolveOrchestrationConfig({})
    expect(empty.enabled).toBe(false)
    expect(empty.maxTokensPerRun).toBe(ORCHESTRATION_CONFIG_DEFAULTS.maxTokensPerRun)
    expect(empty.maxCandidates).toBe(ORCHESTRATION_CONFIG_DEFAULTS.maxCandidates)
    expect(empty.maxDepth).toBe(ORCHESTRATION_CONFIG_DEFAULTS.maxDepth)
    expect(empty.advisorModel).toBe('')
  })

  it('resolveOrchestrationConfig honours an explicit enable + ceilings', () => {
    const cfg = resolveOrchestrationConfig({
      orchestrationEnabled: true,
      orchMaxTokensPerRun: 50_000,
      orchMaxCandidates: 3,
      orchMaxDepth: 1,
      orchAdvisorModel: '  claude-opus-4-8  '
    })
    expect(cfg.enabled).toBe(true)
    expect(cfg.maxTokensPerRun).toBe(50_000)
    expect(cfg.maxCandidates).toBe(3)
    expect(cfg.maxDepth).toBe(1)
    expect(cfg.advisorModel).toBe('claude-opus-4-8')
  })

  it('a ceiling of 0 is preserved (0 = that individual cap disabled)', () => {
    const cfg = resolveOrchestrationConfig({ orchMaxTokensPerRun: 0 })
    expect(cfg.maxTokensPerRun).toBe(0)
  })

  it('garbage ceiling values fall back to defaults', () => {
    const cfg = resolveOrchestrationConfig({
      orchMaxTokensPerRun: 'lots' as unknown as number,
      orchMaxCandidates: -5
    })
    expect(cfg.maxTokensPerRun).toBe(ORCHESTRATION_CONFIG_DEFAULTS.maxTokensPerRun)
    expect(cfg.maxCandidates).toBe(ORCHESTRATION_CONFIG_DEFAULTS.maxCandidates)
  })

  it('the Settings dialog registers an Orchestration tab', () => {
    const src = read('src/components/settings/SettingsDialog.tsx')
    expect(src).toMatch(/id: 'orchestration'/)
    expect(src).toMatch(/activeTab === 'orchestration' && <OrchestrationSettings/)
  })

  it('AO-3: agents:list gates on the master toggle (empty when off)', () => {
    const src = read('electron/ipc/agents.ts')
    expect(src).toMatch(
      /'agents:list'[\s\S]*?if \(!readOrchestrationConfig\(\)\.enabled\) return \{ success: true, data: \[\] \}/
    )
  })

  it('AO-5: multi_agent_run governance is a side-channel (governFork gated, envelope after it)', () => {
    const src = read('electron/services/multi-agent-run-tool-pack.ts')
    expect(src).toMatch(/governFork\(\{/)
    expect(src).toMatch(/if \(identityId\) \{[\s\S]*?settleRunSpend/)
    const govIdx = src.indexOf('governFork(')
    const returnIdx = src.lastIndexOf('return {')
    expect(govIdx).toBeGreaterThan(-1)
    expect(returnIdx).toBeGreaterThan(govIdx) // envelope return comes after governance
  })

  it('AO-5: tasks:stop propagates the kill to running children', () => {
    const src = read('electron/ipc/tasks.ts')
    expect(src).toMatch(/killTree/)
    expect(src).toMatch(/listRunningChildRunIds/)
  })

  it('AO-6: chat dispatch strips orchestration tools via the toggle', () => {
    const src = read('electron/ipc/chat.ts')
    // Both dispatch build paths wrap the tool array in the strip.
    const matches = src.match(/filterOrchestrationTools\(/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  it('AO-6: agent_fanout handler refuses when orchestration is off', () => {
    const src = read('electron/services/orchestration-tool-pack.ts')
    expect(src).toMatch(/if \(!readOrchestrationConfig\(\)\.enabled\)[\s\S]*?throw new Error/)
  })

  it('AO-7: agent_critique runs the critic with an empty tool floor (read-only by construction)', () => {
    const src = read('electron/services/orchestration-tool-pack.ts')
    // The critique governance mints an identity whose floor is empty — the
    // critic/generator are tool-less, so they cannot mutate regardless of prompt.
    expect(src).toMatch(/agentType: 'agent_critique'[\s\S]*?floor: new Set<string>\(\)/)
    expect(src).toMatch(/agent_critique requires Orchestration to be enabled/)
  })

  it('AO-8: agent_advisor refuses when off and honestly reports an unset advisor', () => {
    const src = read('electron/services/orchestration-tool-pack.ts')
    expect(src).toMatch(/agent_advisor requires Orchestration to be enabled/)
    expect(src).toMatch(/No advisor model is configured/)
  })
})
