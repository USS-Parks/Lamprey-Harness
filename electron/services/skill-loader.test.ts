import { readFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import matter from 'gray-matter'

vi.mock('electron', () => ({
  app: { getPath: () => join(process.cwd(), '.tmp-test-user-data') },
  BrowserWindow: { getAllWindows: () => [] }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

import { __skillLoaderTest } from './skill-loader'

const BUNDLED_WORKFLOW_SKILL_IDS = [
  'context',
  'debug',
  'fan-out',
  'frontend-qa',
  'plan',
  'review',
  'verify'
] as const

describe('bundled workflow skills', () => {
  const bundledDir = join(process.cwd(), 'resources', 'skills')
  const workflowSet = new Set<string>(BUNDLED_WORKFLOW_SKILL_IDS)

  it('discovers all bundled workflow directory skills through the skill-loader scanner', () => {
    const files = __skillLoaderTest
      .discoverSkillFiles(bundledDir)
      .filter((file) => workflowSet.has(basename(dirname(file))))

    expect(files.map((file) => basename(dirname(file))).sort()).toEqual([
      ...BUNDLED_WORKFLOW_SKILL_IDS
    ])

    for (const file of files) {
      expect(basename(file)).toBe('SKILL.md')
      const parsed = __skillLoaderTest.parseSkillFile(file)
      expect(parsed?.id).toBe(basename(dirname(file)))
      expect(parsed?.name).not.toMatch(/codex/i)
      expect(parsed?.description.length).toBeGreaterThan(20)
      expect(parsed?.content).toContain('Stop when')
    }
  })

  it('parses required frontmatter including non-empty triggers', () => {
    const files = __skillLoaderTest
      .discoverSkillFiles(bundledDir)
      .filter((file) => workflowSet.has(basename(dirname(file))))

    for (const file of files) {
      const parsed = matter(readFileSync(file, 'utf-8'))
      expect(parsed.data.name).toEqual(expect.any(String))
      expect((parsed.data.name as string).length).toBeGreaterThan(0)
      expect(parsed.data.description).toEqual(expect.any(String))
      expect(parsed.data.triggers).toEqual(expect.any(Array))
      expect(parsed.data.triggers.length).toBeGreaterThan(0)
    }
  })
})
