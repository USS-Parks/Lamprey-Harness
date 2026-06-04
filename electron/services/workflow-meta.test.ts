import { describe, expect, it } from 'vitest'
import {
  evaluateMetaLiteral,
  findMetaRange,
  parseWorkflowScript,
  WorkflowMetaError
} from './workflow-meta'

describe('findMetaRange', () => {
  it('finds the range of a simple meta declaration', () => {
    const src = `export const meta = { name: 'x', description: 'y' }\n\nawait agent('go')`
    const range = findMetaRange(src)!
    expect(range).not.toBeNull()
    expect(src.slice(range.exprStart, range.exprEnd).trim()).toBe(
      "{ name: 'x', description: 'y' }"
    )
  })

  it('handles braces inside strings and comments without confusing balance', () => {
    const src = `export const meta = {
      name: 'x',
      description: 'has } and { in it',
      // also { in a comment }
      /* and {} in a block comment */
    }
    rest`
    const range = findMetaRange(src)!
    expect(range).not.toBeNull()
    expect(src.slice(range.exprStart, range.exprEnd).endsWith('}')).toBe(true)
  })

  it('returns null when no declaration is present', () => {
    expect(findMetaRange('const meta = {}; await agent()')).toBeNull()
  })

  it('skips a commented-out declaration (regex anchors to start-of-line)', () => {
    const src = `// export const meta = { name: 'x' }\nawait agent()`
    expect(findMetaRange(src)).toBeNull()
  })
})

describe('evaluateMetaLiteral — pure-literal enforcement', () => {
  it('accepts a well-formed object literal', () => {
    const meta = evaluateMetaLiteral(`{
      name: 'find-flaky-tests',
      description: 'find and propose fixes',
      phases: [{ title: 'Scan' }, { title: 'Fix' }]
    }`)
    expect(meta.name).toBe('find-flaky-tests')
    expect(meta.description).toBe('find and propose fixes')
    expect(meta.phases).toHaveLength(2)
  })

  it('rejects a template string (REQUIRED verify-gate bullet)', () => {
    expect(() =>
      evaluateMetaLiteral('{ name: `find-${target}`, description: "x" }')
    ).toThrow(WorkflowMetaError)
    expect(() =>
      evaluateMetaLiteral('{ name: `no-interp`, description: "x" }')
    ).toThrow(/backticks/)
  })

  it('rejects a function call', () => {
    expect(() => evaluateMetaLiteral('{ name: makeName(), description: "x" }')).toThrow(
      WorkflowMetaError
    )
  })

  it('rejects a variable reference', () => {
    expect(() => evaluateMetaLiteral('{ name: someVar, description: "x" }')).toThrow(
      WorkflowMetaError
    )
  })

  it('rejects a spread', () => {
    expect(() => evaluateMetaLiteral('{ ...defaults, name: "x", description: "y" }')).toThrow(
      /spread/
    )
  })

  it('rejects missing required fields', () => {
    expect(() => evaluateMetaLiteral('{ description: "x" }')).toThrow(/name/)
    expect(() => evaluateMetaLiteral('{ name: "x" }')).toThrow(/description/)
  })

  it('rejects non-string name / description', () => {
    expect(() => evaluateMetaLiteral('{ name: 1, description: "x" }')).toThrow(/name/)
    expect(() => evaluateMetaLiteral('{ name: "x", description: null }')).toThrow(/description/)
  })

  it('validates phases array shape when present', () => {
    expect(() =>
      evaluateMetaLiteral('{ name: "x", description: "y", phases: [{}] }')
    ).toThrow(/title/)
    expect(() =>
      evaluateMetaLiteral('{ name: "x", description: "y", phases: "string" }')
    ).toThrow(/array/)
  })

  it('tolerates unknown forward-additive keys', () => {
    const meta = evaluateMetaLiteral(
      '{ name: "x", description: "y", futureFlag: "v2" }'
    )
    expect((meta as Record<string, unknown>).futureFlag).toBe('v2')
  })
})

describe('parseWorkflowScript', () => {
  it('returns meta + body with the meta line elided', () => {
    const src = `export const meta = { name: 'x', description: 'y' }

const xs = [1, 2, 3]
return xs.length`
    const parsed = parseWorkflowScript(src)
    expect(parsed.meta.name).toBe('x')
    expect(parsed.body).not.toContain('export const meta')
    expect(parsed.body).toContain('const xs = [1, 2, 3]')
  })

  it('throws when no meta declaration is present', () => {
    expect(() => parseWorkflowScript('await agent("go")')).toThrow(/meta/)
  })

  it('throws on bad inputs', () => {
    expect(() => parseWorkflowScript(undefined as unknown as string)).toThrow(/string/)
  })
})
