import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildLiveModelImports } from './model-import'

const root = join(__dirname, '../../..')

describe('TL-C4 local/custom capability defaults', () => {
  it('live imports default tools and vision off', () => {
    const { additions } = buildLiveModelImports('ollama', ['llama3.2:latest'], [])
    expect(additions).toHaveLength(1)
    expect(additions[0]?.supportsTools).toBe(false)
    expect(additions[0]?.supportsVision).toBe(false)
  })

  it('custom-model reader only enables tools/vision on an explicit true', () => {
    const src = readFileSync(join(__dirname, 'registry.ts'), 'utf-8')
    expect(src).toMatch(/supportsTools: m\.supportsTools === true/)
    expect(src).toMatch(/supportsVision: m\.supportsVision === true/)
  })

  it('manual custom-model draft in ModelSettings starts tools and vision off', () => {
    const src = readFileSync(join(root, 'src/components/settings/ModelSettings.tsx'), 'utf-8')
    expect(src).toMatch(/supportsTools:\s*false/)
    expect(src).toMatch(/supportsVision:\s*false/)
  })
})
