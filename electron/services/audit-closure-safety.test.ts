import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CORE_NORMALIZE_NAMES, CORE_SURFACE_NAMES } from './core-tool-names'
import { resolveModel } from './providers/registry'

function read(rel: string): string {
  return readFileSync(join(__dirname, '..', '..', rel), 'utf-8')
}

describe('AC-37 Audit Closure invariants', () => {
  it('cap path is not completed', () => {
    const src = read('electron/ipc/chat.ts')
    expect(src).toMatch(/throw new ToolRoundCapError\(/)
    expect(src).toMatch(
      /settlementStatus = runtime\.signal\.aborted \|\| isUserAbortError\(errObj\) \? 'cancelled' : 'failed'/
    )
    expect(src).not.toMatch(/ToolRoundCapError[\s\S]{0,80}status:\s*'completed'/)
  })

  it('CORE lists live in one module and are not silently equal', () => {
    expect([...CORE_SURFACE_NAMES]).toEqual([
      'shell_command',
      'apply_patch',
      'workspace_context',
      'view_image',
      'web_search',
      'ask_user_question',
      'update_plan',
      'enter_plan_mode',
      'exit_plan_mode',
      'get_goal',
      'read_tool_result',
      'skill_open'
    ])
    expect([...CORE_NORMALIZE_NAMES]).toEqual([
      'workspace_context',
      'view_image',
      'shell_command',
      'apply_patch',
      'verify_workspace',
      'shell_list',
      'shell_monitor',
      'shell_stop',
      'shell_output'
    ])
    expect([...CORE_SURFACE_NAMES].sort().join(',')).not.toBe(
      [...CORE_NORMALIZE_NAMES].sort().join(',')
    )
    const surface = read('electron/services/model-tool-surface.ts')
    const normalizer = read('electron/services/providers/schema-normalizer.ts')
    expect(surface).toMatch(/CORE_SURFACE_NAMES/)
    expect(normalizer).toMatch(/CORE_NORMALIZE_NAMES/)
  })

  it('gated packs are stripped in dispatch', () => {
    const src = read('electron/ipc/chat.ts')
    expect(src).toMatch(/function buildDispatchTools/)
    expect(src).toMatch(/filterLoopTools/)
    expect(src).toMatch(/filterBrowserDeveloperTools/)
    expect(src).toMatch(/filterOrchestrationTools/)
  })

  it('unknown model supportsTools is false', () => {
    expect(resolveModel('ac-37-unknown-model-id').supportsTools).toBe(false)
  })

  it('suppressDoneEvent is absent', () => {
    expect(read('electron/ipc/chat.ts')).not.toMatch(/suppressDoneEvent/)
    expect(read('electron/services/chat-tool-dispatch.ts')).not.toMatch(/suppressDoneEvent/)
  })

  it('custom-model draft defaults tools off', () => {
    const src = read('src/components/settings/ModelSettings.tsx')
    expect(src).toMatch(/useState<ModelInfo>\(\{[\s\S]*?supportsTools: false/)
  })

  it('pipeline-orphans is not imported from production electron/', () => {
    const chat = read('electron/ipc/chat.ts')
    const main = read('electron/main.ts')
    expect(chat).not.toMatch(/pipeline-orphans/)
    expect(main).not.toMatch(/pipeline-orphans/)
  })
})
