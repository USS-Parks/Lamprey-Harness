// WM-4 — deterministic repair: serializer roundtrip, the three edit
// families, cycle/budget safety, and best-candidate retention.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parsePatch } from './apply-patch-tool'
import {
  findByBasename,
  reanchorHunk,
  repairToolCall,
  serializeOps,
  trimMatchIndex
} from './world-model-repair'
import { dryRunUpdate } from './world-model-validate'
import { __resetWorldModelStateForTesting } from './workspace-world-model'

const CONV = 'conv-wm4'
let root: string

beforeEach(() => {
  __resetWorldModelStateForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm4-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const PATCH = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch`
const ctx = () => ({ workspaceRoot: root, conversationId: CONV })

describe('serializeOps', () => {
  it('roundtrips through parsePatch structurally', () => {
    const original = PATCH(
      '*** Add File: new.txt\n+hello\n+world\n' +
        '*** Update File: up.ts\n@@ anchor text\n ctx\n-old\n+new\n' +
        '*** Delete File: gone.txt'
    )
    const ops = parsePatch(original)
    const reparsed = parsePatch(serializeOps(ops))
    expect(reparsed).toEqual(ops)
  })
})

describe('edit family: normalize-path', () => {
  it('repairs backslash separators', () => {
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'a.ts'), 'old line\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: src\\a.ts\n@@\n-old line\n+new line') },
      ctx()
    )
    expect(r.outcome).toBe('repaired')
    expect(r.notes[0].kind).toBe('normalize-path')
    expect(String(r.args.patch)).toContain('src/a.ts')
  })

  it('an absolute path under the workspace root is already valid — zero edits', () => {
    // WM-4 finding: resolvePathWithinWorkspace accepts absolutes under the
    // root, so such a call needs no repair and dispatches as-is.
    writeFileSync(join(root, 'b.ts'), 'x\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH(`*** Update File: ${join(root, 'b.ts')}\n@@\n-x\n+y`) },
      ctx()
    )
    expect(r.outcome).toBe('repaired')
    expect(r.editsUsed).toBe(0)
  })
})

describe('edit family: resolve-basename', () => {
  it('resolves a missing target with exactly one basename match', () => {
    mkdirSync(join(root, 'src', 'deep'), { recursive: true })
    writeFileSync(join(root, 'src', 'deep', 'target.ts'), 'content\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: target.ts\n@@\n-content\n+changed') },
      ctx()
    )
    expect(r.outcome).toBe('repaired')
    expect(r.notes[0].kind).toBe('resolve-basename')
    expect(String(r.args.patch)).toContain('src/deep/target.ts')
  })

  it('refuses ambiguous basenames and returns a verdict', () => {
    mkdirSync(join(root, 'a'))
    mkdirSync(join(root, 'b'))
    writeFileSync(join(root, 'a', 'dup.ts'), 'x\n')
    writeFileSync(join(root, 'b', 'dup.ts'), 'x\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: dup.ts\n@@\n-x\n+y') },
      ctx()
    )
    expect(r.outcome).toBe('verdict')
  })

  it('repairs a simple shell read the same way', () => {
    mkdirSync(join(root, 'lib'))
    writeFileSync(join(root, 'lib', 'only.ts'), 'x\n')
    const r = repairToolCall('shell_command', { command: 'cat only.ts' }, ctx())
    expect(r.outcome).toBe('repaired')
    expect(r.args.command).toBe('cat lib/only.ts')
  })
})

describe('edit family: reanchor-whitespace', () => {
  it('rewrites hunk context to the file bytes when only whitespace differs', () => {
    writeFileSync(join(root, 'w.ts'), '  const x = 1\n  const y = 2\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: w.ts\n@@\n-const x = 1\n+const x = 9\n const y = 2') },
      ctx()
    )
    expect(r.outcome).toBe('repaired')
    expect(r.notes.some((n) => n.kind === 'reanchor-whitespace')).toBe(true)
    const op = parsePatch(String(r.args.patch))[0]
    expect(op.kind).toBe('update')
    if (op.kind === 'update') {
      const run = dryRunUpdate(op, '  const x = 1\n  const y = 2\n')
      expect(run.ok).toBe(true)
      if (run.ok) expect(run.content).toBe('  const x = 9\n  const y = 2\n')
    }
  })

  it('does not repair content mismatches beyond whitespace', () => {
    writeFileSync(join(root, 'z.ts'), 'actually different\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: z.ts\n@@\n-nothing like it\n+x') },
      ctx()
    )
    expect(r.outcome).toBe('verdict')
    expect(r.verdict.violations.some((v) => v.kind === 'anchors')).toBe(true)
  })
})

describe('loop mechanics', () => {
  it('chains edits: basename resolution then whitespace re-anchor', () => {
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, 'nested', 'chain.ts'), '  padded line\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: chain.ts\n@@\n-padded line\n+replaced') },
      ctx()
    )
    expect(r.outcome).toBe('repaired')
    expect(r.notes.map((n) => n.kind)).toEqual(['resolve-basename', 'reanchor-whitespace'])
    expect(r.editsUsed).toBe(2)
  })

  it('ties prefer the later candidate so verdicts carry post-edit evidence', () => {
    mkdirSync(join(root, 'only'))
    writeFileSync(join(root, 'only', 'best.ts'), 'real content here\n')
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: best.ts\n@@\n-unrelated context\n+x') },
      ctx()
    )
    expect(r.outcome).toBe('verdict')
    // The returned verdict reflects the post-rename candidate: the exists
    // violation is resolved and the anchors violation carries file evidence.
    expect(r.verdict.violations.some((v) => v.kind === 'anchors')).toBe(true)
    expect(String(r.args.patch)).toContain('only/best.ts')
  })

  it('a call with no derivable edit returns the original verdict untouched', () => {
    const r = repairToolCall(
      'apply_patch',
      { patch: PATCH('*** Update File: never-anywhere.xyz\n@@\n-a\n+b') },
      ctx()
    )
    expect(r.outcome).toBe('verdict')
    expect(r.editsUsed).toBe(0)
  })
})

describe('helpers', () => {
  it('findByBasename skips node_modules and caps matches', () => {
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg', 'find-me.ts'), 'x')
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'find-me.ts'), 'x')
    expect(findByBasename(root, 'find-me.ts')).toEqual([join(root, 'src', 'find-me.ts')])
  })

  it('trimMatchIndex and reanchorHunk agree on offsets across add lines', () => {
    const fileLines = ['  a', '  b', '  c']
    const hunk = parsePatch(PATCH('*** Update File: x\n@@\n a\n-b\n+B\n c'))[0]
    if (hunk.kind !== 'update') throw new Error('fixture')
    const start = trimMatchIndex(fileLines, ['a', 'b', 'c'])
    expect(start).toBe(0)
    const re = reanchorHunk(hunk.hunks[0], fileLines, start)
    // Add lines pick up the file's indentation delta from their neighbor.
    expect(re.body.map((b) => b.text)).toEqual(['  a', '  b', '  B', '  c'])
  })
})
