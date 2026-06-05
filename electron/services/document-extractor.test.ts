import { describe, it, expect } from 'vitest'
import {
  buildFallbackDocuments,
  extractDocumentsFromBody
} from './document-extractor'

const LINES_15 = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`).join('\n')

describe('document-extractor', () => {
  it('returns [] for empty / casual replies', () => {
    expect(extractDocumentsFromBody('')).toEqual([])
    expect(extractDocumentsFromBody('Just a chat reply, no file.')).toEqual([])
  })

  it('ignores short fenced blocks even with a filename hint', () => {
    const body = '```python:foo.py\nprint(1)\nprint(2)\n```'
    expect(extractDocumentsFromBody(body)).toEqual([])
  })

  it('ignores fenced blocks without any filename hint', () => {
    const body = '```python\n' + LINES_15 + '\n```'
    expect(extractDocumentsFromBody(body)).toEqual([])
  })

  it('ignores diff blocks (those are review, not files)', () => {
    const body =
      '## src/foo.ts\n```diff\n' +
      ['--- a/src/foo.ts', '+++ b/src/foo.ts', ...Array.from({ length: 14 }, (_, i) => ` line ${i}`)].join('\n') +
      '\n```'
    expect(extractDocumentsFromBody(body)).toEqual([])
  })

  it('detects fence-line filename hint (```lang:name.ext)', () => {
    const body = '```typescript:src/auth.ts\n' + LINES_15 + '\n```'
    const docs = extractDocumentsFromBody(body)
    expect(docs).toHaveLength(1)
    expect(docs[0].name).toBe('auth.ts')
    expect(docs[0].mimeType).toBe('text/x-typescript')
    expect(docs[0].content.split('\n')).toHaveLength(15)
  })

  it('detects heading-above hint (## foo.py)', () => {
    const body = '## scripts/run.py\n```python\n' + LINES_15 + '\n```'
    const docs = extractDocumentsFromBody(body)
    expect(docs).toHaveLength(1)
    expect(docs[0].name).toBe('run.py')
    expect(docs[0].mimeType).toBe('text/x-python')
  })

  it('detects first-line filename comment (# foo.py)', () => {
    const body = '```python\n# data_export.py\n' + Array.from({ length: 14 }, (_, i) => `print(${i})`).join('\n') + '\n```'
    const docs = extractDocumentsFromBody(body)
    expect(docs).toHaveLength(1)
    expect(docs[0].name).toBe('data_export.py')
  })

  it('detects bareword files (Dockerfile)', () => {
    const body = '## Dockerfile\n```dockerfile\n' + LINES_15 + '\n```'
    const docs = extractDocumentsFromBody(body)
    expect(docs).toHaveLength(1)
    expect(docs[0].name).toBe('Dockerfile')
    expect(docs[0].mimeType).toBe('text/x-dockerfile')
  })

  it('extracts multiple qualifying blocks', () => {
    const body =
      '```python:a.py\n' + LINES_15 + '\n```\n\nSome prose.\n\n## b.ts\n```typescript\n' + LINES_15 + '\n```'
    const docs = extractDocumentsFromBody(body)
    expect(docs.map((d) => d.name)).toEqual(['a.py', 'b.ts'])
  })

  it('buildFallbackDocuments returns StoredDocument shapes', () => {
    const body = '```python:foo.py\n' + LINES_15 + '\n```'
    const docs = buildFallbackDocuments(body)
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(docs[0].sizeBytes).toBeGreaterThan(0)
    expect(typeof docs[0].createdAt).toBe('number')
  })
})
