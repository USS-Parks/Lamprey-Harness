import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CORE_SURFACE_NAMES } from './core-tool-names'
import { CORE_SURFACE_NAMES as WIZARD_CORE } from '../../src/data/core-surface-names'

const wizard = readFileSync(
  join(__dirname, '..', '..', 'src', 'components', 'customize', 'NewSkillWizard.tsx'),
  'utf-8'
)

describe('TR-5 CORE surface hints', () => {
  it('wizard shared export equals electron CORE_SURFACE_NAMES', () => {
    expect([...WIZARD_CORE]).toEqual([...CORE_SURFACE_NAMES])
  })

  it('NewSkillWizard uses the shared CORE export, not a local hint list', () => {
    expect(wizard).toMatch(/from '@\/data\/core-surface-names'/)
    expect(wizard).toMatch(/\[\.\.\.CORE_SURFACE_NAMES, \.\.\.fromMcp\]/)
    expect(wizard).not.toMatch(/NATIVE_TOOL_HINTS/)
    expect(wizard).not.toMatch(/web_find/)
  })
})
