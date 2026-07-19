import { describe, expect, it } from 'vitest'
import { buildLiveModelImports } from './model-import'

describe('live model import', () => {
  it('deduplicates input and skips an exact provider/apiModelId match', () => {
    const result = buildLiveModelImports('host', [' alpha ', 'alpha', 'beta'], [
      { id: 'already-local', apiModelId: 'alpha', provider: 'host' }
    ])
    expect(result.skipped).toBe(1)
    expect(result.additions.map((m) => m.apiModelId)).toEqual(['beta'])
  })

  it('namespaces a local collision while preserving the verbatim API id', () => {
    const result = buildLiveModelImports('second-host', ['shared/model'], [
      { id: 'shared/model', provider: 'first-host' }
    ])
    expect(result.additions[0]).toMatchObject({
      id: 'second-host:shared/model',
      apiModelId: 'shared/model',
      provider: 'second-host'
    })
  })

  it('imports volatile catalogs with conservative capability defaults', () => {
    const ids = Array.from({ length: 150 }, (_, index) => `model-${index}`)
    const result = buildLiveModelImports('large-host', ids, [])
    expect(result.additions).toHaveLength(150)
    expect(result.additions.every((m) => !m.supportsTools && !m.supportsVision)).toBe(true)
  })
})

