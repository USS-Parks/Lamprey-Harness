// WM-3 — VALIDATE against the live workspace and the rollforward overlay.

import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyzeToolCall } from './tool-action-semantics'
import {
  dryRunUpdate,
  validateAnalysis,
  verdictToolResult,
  type WorkspaceOverlay
} from './world-model-validate'
import { parsePatch, type FileOp } from './apply-patch-tool'
import {
  __resetWorldModelStateForTesting,
  recordShellOutcome
} from './workspace-world-model'

const CONV = 'conv-wm3'
let root: string

beforeEach(() => {
  __resetWorldModelStateForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm3-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const PATCH = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch`
const ctx = (overlay?: WorkspaceOverlay) => ({ workspaceRoot: root, conversationId: CONV, overlay })

function analyze(patch: string) {
  return analyzeToolCall('apply_patch', { patch })!
}

describe('validateAnalysis — apply_patch against live workspace', () => {
  it('passes a well-anchored update', () => {
    writeFileSync(join(root, 'a.ts'), 'const x = 1\nconst y = 2\n')
    const v = validateAnalysis(analyze(PATCH('*** Update File: a.ts\n@@\n-const x = 1\n+const x = 9')), ctx())
    expect(v.applicable).toBe(true)
    expect(v.violations).toEqual([])
  })

  it('blocks an update whose target is missing, with observation evidence', () => {
    const v = validateAnalysis(analyze(PATCH('*** Update File: gone.ts\n@@\n-a\n+b')), ctx())
    expect(v.applicable).toBe(false)
    const viol = v.violations.find((x) => x.kind === 'exists')!
    expect(viol.evidence).toContain('No file at "gone.ts"')
    expect(viol.evidence).toContain('has not observed')
    expect(viol.repairable).toBe(true)
  })

  it('blocks an add on an existing file', () => {
    writeFileSync(join(root, 'x.txt'), 'already')
    const v = validateAnalysis(analyze(PATCH('*** Add File: x.txt\n+new')), ctx())
    expect(v.applicable).toBe(false)
    expect(v.violations[0]).toMatchObject({ kind: 'absent', repairable: false })
    expect(v.violations[0].fix).toContain('Update File')
  })

  it('blocks a workspace escape and never reports the other checks for it', () => {
    const v = validateAnalysis(analyze(PATCH('*** Update File: ../out.ts\n@@\n-a\n+b')), ctx())
    expect(v.applicable).toBe(false)
    expect(v.violations).toHaveLength(1)
    expect(v.violations[0].kind).toBe('within-workspace')
  })

  it('predicts the exact failing hunk with quoted current bytes', () => {
    writeFileSync(join(root, 'b.ts'), 'line one\nline two\nline three\n')
    const v = validateAnalysis(
      analyze(PATCH('*** Update File: b.ts\n@@\n-line one\n-line 2 wrong\n+replaced')),
      ctx()
    )
    expect(v.applicable).toBe(false)
    const viol = v.violations.find((x) => x.kind === 'anchors')!
    expect(viol.hunkIndex).toBe(0)
    expect(viol.evidence).toContain('Hunk 1 does not match')
    expect(viol.evidence).toContain('line two')
  })

  it('names whitespace-only mismatches in the evidence', () => {
    writeFileSync(join(root, 'c.ts'), '  indented\n')
    const v = validateAnalysis(analyze(PATCH('*** Update File: c.ts\n@@\n-indented\n+other')), ctx())
    const viol = v.violations.find((x) => x.kind === 'anchors')!
    expect(viol.evidence).toContain('apart from whitespace')
  })

  it('flags stale observations in evidence when the file changed after a read', () => {
    const f = join(root, 'd.ts')
    writeFileSync(f, 'v1\n')
    recordShellOutcome(CONV, 'cat d.ts', true, root)
    writeFileSync(f, 'v2\n')
    const v = validateAnalysis(analyze(PATCH('*** Update File: d.ts\n@@\n-v1\n+v3')), ctx())
    const viol = v.violations.find((x) => x.kind === 'anchors')!
    expect(viol.evidence).toContain('changed after this conversation last observed it')
  })

  it('reports malformed patches with the grammar reminder', () => {
    const v = validateAnalysis(analyzeToolCall('apply_patch', { patch: 'garbage' })!, ctx())
    expect(v.applicable).toBe(false)
    expect(v.violations[0].kind).toBe('malformed-patch')
    expect(v.violations[0].fix).toContain('Begin Patch')
  })
})

describe('validateAnalysis — overlay awareness (rollforward substrate)', () => {
  it('a file created earlier in the overlay satisfies exists', () => {
    const overlay: WorkspaceOverlay = new Map([[join(root, 'new.ts'), 'made\n']])
    const v = validateAnalysis(analyze(PATCH('*** Update File: new.ts\n@@\n-made\n+kept')), ctx(overlay))
    expect(v.applicable).toBe(true)
  })

  it('a file deleted earlier in the overlay fails exists even though disk has it', () => {
    writeFileSync(join(root, 'del.ts'), 'x\n')
    const overlay: WorkspaceOverlay = new Map([[join(root, 'del.ts'), null]])
    const v = validateAnalysis(analyze(PATCH('*** Update File: del.ts\n@@\n-x\n+y')), ctx(overlay))
    expect(v.applicable).toBe(false)
    expect(v.violations[0].kind).toBe('exists')
  })

  it('an applicable verdict advances the overlay with simulated content', () => {
    writeFileSync(join(root, 'e.ts'), 'alpha\n')
    const overlay: WorkspaceOverlay = new Map()
    const v = validateAnalysis(analyze(PATCH('*** Update File: e.ts\n@@\n-alpha\n+beta')), ctx(overlay))
    expect(v.applicable).toBe(true)
    expect(overlay.get(join(root, 'e.ts'))).toBe('beta\n')
  })

  it('a violated verdict leaves the overlay untouched', () => {
    const overlay: WorkspaceOverlay = new Map()
    validateAnalysis(analyze(PATCH('*** Update File: nope.ts\n@@\n-a\n+b')), ctx(overlay))
    expect(overlay.size).toBe(0)
  })
})

describe('dryRunUpdate', () => {
  it('returns the patched content on success, preserving trailing newline', () => {
    const op = parsePatch(PATCH('*** Update File: f.ts\n@@\n-a\n+b'))[0] as Extract<FileOp, { kind: 'update' }>
    const r = dryRunUpdate(op, 'a\nrest\n')
    expect(r).toEqual({ ok: true, content: 'b\nrest\n' })
  })
})

describe('verdictToolResult', () => {
  it('shapes the corrective result with the not-executed hint', () => {
    writeFileSync(join(root, 'g.ts'), 'x\n')
    const v = validateAnalysis(analyze(PATCH('*** Update File: g.ts\n@@\n-wrong\n+y')), ctx())
    const parsed = JSON.parse(verdictToolResult('apply_patch', v))
    expect(parsed.error).toBe('world_model_precondition_failed')
    expect(parsed.violations[0].hunk).toBe(1)
    expect(parsed.hint).toContain('NOT executed')
  })
})
