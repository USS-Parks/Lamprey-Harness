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
})
