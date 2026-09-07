import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { SETTINGS_GROUPS, SETTINGS_LEAVES } from './settings-navigation'

const root = join(__dirname, '../..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const json = <T>(rel: string): T => JSON.parse(read(rel)) as T

const SCENARIOS = json<{ id: string }[]>('scripts/acceptance/ux-scenarios.json').map(s => s.id)

const DAILY_WORK: Record<string, string> = {
  'choose project': 'task-context-actions',
  'choose model': 'compact-model-picker',
  'attach file': 'compact-composer-controls',
  'controlled coding work': 'running-local-stream',
  'live status': 'current-task-status',
  'steer': 'compact-follow-up-controls',
  'queue edit reorder': 'compact-follow-up-controls',
  'approve an action': 'notices-approvals',
  'open file': 'direct-file-artifact-links',
  'open browser': 'browser-task-lifecycle',
  'open terminal': 'terminal-dock-lifecycle',
  'review a real diff': 'review-real-git',
  'contextual feedback': 'review-task-continuity',
  'failure and cancel': 'current-task-status',
  'find another task after reload': 'task-navigation',
  'second task ownership': 'task-data',
}

const EVIDENCE: Record<string, string> = {
  'task-context-actions': 'PLANNING/evidence/ux-simplification/UX15_RUN/LIFECYCLE.json',
  'compact-model-picker': 'PLANNING/evidence/ux-simplification/UX14_RUN/LIFECYCLE.json',
  'compact-composer-controls': 'PLANNING/evidence/ux-simplification/UX16_RUN2/LIFECYCLE.json',
  'running-local-stream': 'PLANNING/evidence/ux-simplification/UX33_RUN4/LIFECYCLE.json',
  'current-task-status': 'PLANNING/evidence/ux-simplification/UX17_RUN2/LIFECYCLE.json',
  'compact-follow-up-controls': 'PLANNING/evidence/ux-simplification/UX16_RUN2/LIFECYCLE.json',
  'notices-approvals': 'PLANNING/evidence/ux-simplification/UX20_RUN4/LIFECYCLE.json',
  'direct-file-artifact-links': 'PLANNING/evidence/ux-simplification/UX07_RUN/LIFECYCLE.json',
  'browser-task-lifecycle': 'PLANNING/evidence/ux-simplification/UX08_RUN4/LIFECYCLE.json',
  'terminal-dock-lifecycle': 'PLANNING/evidence/ux-simplification/UX09_RUN3/LIFECYCLE.json',
  'review-real-git': 'PLANNING/evidence/ux-simplification/UX33_RUN4/LIFECYCLE.json',
  'review-task-continuity': 'PLANNING/evidence/ux-simplification/UX10_RUN2/LIFECYCLE.json',
  'task-navigation': 'PLANNING/evidence/ux-simplification/UX23_RUN2/LIFECYCLE.json',
  'task-data': 'PLANNING/evidence/ux-simplification/UX21_RUN/LIFECYCLE.json',
  'workspace-capability-routes': 'PLANNING/evidence/ux-simplification/UX10_RUN2/LIFECYCLE.json',
  'settings-navigation': 'PLANNING/evidence/ux-simplification/UX32_SETTINGS2/LIFECYCLE.json',
  'keyboard-navigation': 'PLANNING/evidence/ux-simplification/UX32_KEYBOARD2/LIFECYCLE.json',
  'contextual-setup': 'PLANNING/evidence/ux-simplification/UX29_KEYLESS2/LIFECYCLE.json',
}

describe('UX-35 daily-work contract', () => {
  it('maps every PSPR daily-work step to a live acceptance scenario', () => {
    for (const [step, id] of Object.entries(DAILY_WORK)) {
      expect(SCENARIOS, step).toContain(id)
    }
  })

  it('keeps all thirteen tools and twenty-four settings leaves', () => {
    const ui = read('src/stores/ui-store.ts')
    const toolBlock = ui.split('export type ToolId =', 2)[1]?.split('export type', 1)[0] ?? ''
    const tools = [...toolBlock.matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1])
    expect(tools).toEqual([
      'files', 'sidechat', 'browser', 'review', 'terminal', 'environment',
      'sources', 'artifacts', 'plan', 'background', 'afterAction', 'loop', 'agents',
    ])
    expect(SETTINGS_GROUPS).toHaveLength(6)
    expect(SETTINGS_LEAVES).toHaveLength(24)
    expect(SETTINGS_LEAVES.map(leaf => leaf.id).sort()).toEqual([
      'activity', 'agenticCoding', 'api', 'appearance', 'automations', 'currentInfo',
      'general', 'github', 'hooks', 'imageGen', 'library', 'loops', 'models',
      'orchestration', 'permissions', 'persistence', 'planGoal', 'rag', 'reasoning',
      'seedBudget', 'snip', 'timeouts', 'tools', 'webTools',
    ])
  })

  it('retains passed Windows lifecycle receipts for every cited scenario', () => {
    for (const [id, path] of Object.entries(EVIDENCE)) {
      const life = json<{ passed: boolean }>(path)
      expect(life.passed, `${id} ${path}`).toBe(true)
    }
  })

  it('does not change default follow-up or coding authority', () => {
    const defaults = read('electron/services/default-app-settings.ts')
    expect(defaults).toContain("followUpBehavior: 'steer'")
    expect(defaults).toContain('agenticCodingMode: false')
  })
})
