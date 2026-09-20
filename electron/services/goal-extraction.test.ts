// WM-7 — task understanding: intent gate, deterministic fast-path, schema
// validation with one retry, honest degradation.

import { describe, expect, it } from 'vitest'
import {
  extractDeterministic,
  extractGoals,
  looksMutatingIntent,
  parseExtractionReply
} from './goal-extraction'

describe('looksMutatingIntent', () => {
  it('accepts imperative coding asks', () => {
    expect(looksMutatingIntent('Fix the typo in README.md')).toBe(true)
    expect(looksMutatingIntent('implement a retry wrapper around fetch')).toBe(true)
    expect(looksMutatingIntent('rename the helper and update its callers')).toBe(true)
  })

  it('rejects questions and chatter', () => {
    expect(looksMutatingIntent('what does this function do?')).toBe(false)
    expect(looksMutatingIntent('hi')).toBe(false)
    expect(looksMutatingIntent('thanks!')).toBe(false)
  })

  it('a question that names a mutation verb still qualifies', () => {
    expect(looksMutatingIntent('can you fix the crash in app.ts?')).toBe(true)
  })
})

describe('extractDeterministic', () => {
  it('collects unique file mentions as targets', () => {
    const e = extractDeterministic('Update src/app.ts and src/app.ts plus README.md')
    expect(e.subtasks[0].targets).toEqual(['src/app.ts', 'README.md'])
    expect(e.source).toBe('deterministic')
    expect(e.subtasks[0].predicates).toEqual([])
  })
})

describe('parseExtractionReply', () => {
  it('parses a valid reply with every predicate kind', () => {
    const subtasks = parseExtractionReply(
      JSON.stringify({
        subtasks: [
          {
            title: 'do the thing',
            targets: ['a.ts'],
            predicates: [
              { kind: 'file-exists', path: 'a.ts' },
              { kind: 'file-absent', path: 'b.ts' },
              { kind: 'file-contains', path: 'a.ts', needle: 'export' },
              { kind: 'file-not-contains', path: 'a.ts', needle: 'TODO' },
              { kind: 'command-succeeds', command: 'npm test' }
            ]
          }
        ]
      })
    )!
    expect(subtasks).toHaveLength(1)
    expect(subtasks[0].predicates).toHaveLength(5)
  })

  it('tolerates prose around the JSON object', () => {
    const subtasks = parseExtractionReply(
      'Sure. {"subtasks":[{"title":"t","targets":[],"predicates":[]}]} Done.'
    )
    expect(subtasks).toHaveLength(1)
  })

  it('rejects malformed predicates as schema failures', () => {
    expect(
      parseExtractionReply(
        JSON.stringify({
          subtasks: [{ title: 't', predicates: [{ kind: 'file-exists' }] }]
        })
      )
    ).toBeNull()
  })

  it('drops unknown predicate kinds without failing the reply', () => {
    const subtasks = parseExtractionReply(
      JSON.stringify({
        subtasks: [
          { title: 't', predicates: [{ kind: 'exotic-check', path: 'x' }] }
        ]
      })
    )!
    expect(subtasks[0].predicates).toEqual([])
  })

  it('caps subtasks at six', () => {
    const subtasks = parseExtractionReply(
      JSON.stringify({
        subtasks: Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, predicates: [] }))
      })
    )!
    expect(subtasks).toHaveLength(6)
  })

  it('rejects empty and non-object replies', () => {
    expect(parseExtractionReply('no json here')).toBeNull()
    expect(parseExtractionReply('{"subtasks":[]}')).toBeNull()
  })
})

describe('extractGoals', () => {
  it('uses the model reply when valid on the first try', async () => {
    const e = await extractGoals(
      'add a util',
      'm',
      async () => ({
        content: '{"subtasks":[{"title":"add util","targets":["src/util.ts"],"predicates":[{"kind":"file-exists","path":"src/util.ts"}]}]}'
      })
    )
    expect(e.source).toBe('model')
    expect(e.subtasks[0].predicates[0]).toEqual({ kind: 'file-exists', path: 'src/util.ts' })
  })

  it('retries once with corrective feedback, then succeeds', async () => {
    let calls = 0
    const e = await extractGoals('add a util to lib.ts', 'm', async (messages) => {
      calls++
      if (calls === 1) return { content: 'not json at all' }
      expect(String(messages[messages.length - 1].content)).toContain('ONLY the JSON object')
      return { content: '{"subtasks":[{"title":"ok","targets":[],"predicates":[]}]}' }
    })
    expect(calls).toBe(2)
    expect(e.source).toBe('model')
  })

  it('degrades to the deterministic extraction after two schema failures', async () => {
    const e = await extractGoals('fix lib.ts', 'm', async () => ({ content: 'nope' }))
    expect(e.source).toBe('degraded')
    expect(e.subtasks[0].targets).toEqual(['lib.ts'])
  })

  it('degrades when the model call throws', async () => {
    const e = await extractGoals('fix lib.ts', 'm', async () => {
      throw new Error('provider down')
    })
    expect(e.source).toBe('degraded')
  })
})
