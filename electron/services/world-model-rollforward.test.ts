// WM-5 — batch rollforward: cross-call doom detection, optimism for
// unknowable state, and the no-execution contract at the dispatch seam.

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rollforwardCalls } from './world-model-rollforward'
import { __resetWorldModelStateForTesting } from './workspace-world-model'

const CONV = 'conv-wm5'
let root: string

beforeEach(() => {
  __resetWorldModelStateForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm5-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const PATCH = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch`
const base = () => ({ workspaceRoot: root, conversationId: CONV })
const patchCall = (patch: string) => ({ toolName: 'apply_patch', args: { patch } })
const shellCall = (command: string) => ({ toolName: 'shell_command', args: { command } })

describe('rollforwardCalls', () => {
  it('passes a coherent multi-call plan and simulates sequential effects', () => {
    writeFileSync(join(root, 'a.ts'), 'one\n')
    const r = rollforwardCalls(
      [
        patchCall(PATCH('*** Update File: a.ts\n@@\n-one\n+two')),
        // The second patch anchors against the FIRST patch's simulated
        // output — impossible to validate without the overlay.
        patchCall(PATCH('*** Update File: a.ts\n@@\n-two\n+three'))
      ],
      base()
    )
    expect(r.ok).toBe(true)
    expect(r.overlay.get(join(root, 'a.ts'))).toBe('three\n')
  })

  it('dooms a later call whose target an earlier call deletes', () => {
    writeFileSync(join(root, 'b.ts'), 'x\n')
    const r = rollforwardCalls(
      [
        patchCall(PATCH('*** Delete File: b.ts')),
        patchCall(PATCH('*** Update File: b.ts\n@@\n-x\n+y'))
      ],
      base()
    )
    expect(r.ok).toBe(false)
    expect(r.firstViolation).toMatchObject({ index: 1, toolName: 'apply_patch' })
    expect(r.firstViolation!.verdict.violations[0].kind).toBe('exists')
  })

  it('an add earlier in the batch satisfies a later update', () => {
    const r = rollforwardCalls(
      [
        patchCall(PATCH('*** Add File: fresh.ts\n+created')),
        patchCall(PATCH('*** Update File: fresh.ts\n@@\n-created\n+edited'))
      ],
      base()
    )
    expect(r.ok).toBe(true)
  })

  it('a duplicate add in one batch dooms the second add', () => {
    const r = rollforwardCalls(
      [
        patchCall(PATCH('*** Add File: dup.ts\n+a')),
        patchCall(PATCH('*** Add File: dup.ts\n+b'))
      ],
      base()
    )
    expect(r.ok).toBe(false)
    expect(r.firstViolation!.index).toBe(1)
    expect(r.firstViolation!.verdict.violations.some((v) => v.kind === 'absent')).toBe(true)
  })

  it('never dooms on state a shell command may have created (optimism)', () => {
    const r = rollforwardCalls(
      [
        shellCall('echo hi > generated.txt'),
        patchCall(PATCH('*** Update File: generated.txt\n@@\n-hi\n+bye'))
      ],
      base()
    )
    expect(r.ok).toBe(true)
  })

  it('unparseable args and unknown tools pass through untouched', () => {
    const r = rollforwardCalls(
      [
        { toolName: 'apply_patch', args: null },
        { toolName: 'web_search', args: { query: 'x' } }
      ],
      base()
    )
    expect(r.ok).toBe(true)
  })
})
