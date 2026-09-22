// Workspace World Model — end-to-end behavioral smoke.
//
// Not a unit test of one module: this drives the EXACT pipeline the chat
// dispatcher runs (analyze → validate → repair → apply → evaluate, plus
// batch rollforward) against a REAL temp workspace with the REAL patch
// applier, and prints observable before/after disk state per scenario. Run:
//   npx vitest run electron/services/world-model-smoke.test.ts
// Its console report is the smoke evidence; the expects fail the run if the
// harness misbehaves.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyzeToolCall } from './tool-action-semantics'
import { validateAnalysis } from './world-model-validate'
import { repairToolCall } from './world-model-repair'
import { rollforwardCalls } from './world-model-rollforward'
import { executeApplyPatch } from './apply-patch-tool'
import { evaluatePredicate } from './goal-predicate-eval'
import { __resetWorldModelStateForTesting } from './workspace-world-model'
import { __resetLocationBeliefCacheForTesting } from './location-beliefs'

let root: string
const PATCH = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch`
const line = (s: string): void => console.log(`  ${s}`)

beforeEach(() => {
  __resetWorldModelStateForTesting()
  __resetLocationBeliefCacheForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm-smoke-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** Run one tool call through the exact gate+dispatch order (verify+repair). */
async function gatedApply(patch: string): Promise<{ ran: boolean; result: string; note?: string }> {
  const args: Record<string, unknown> = { patch }
  const analysis = analyzeToolCall('apply_patch', args)!
  let verdict = validateAnalysis(analysis, { workspaceRoot: root, conversationId: 'smoke' })
  let note: string | undefined
  if (!verdict.applicable) {
    const repair = repairToolCall('apply_patch', args, { workspaceRoot: root, conversationId: 'smoke' })
    if (repair.outcome === 'repaired') {
      args.patch = String(repair.args.patch)
      verdict = repair.verdict
      note = repair.notes.map((n) => n.detail).join('; ')
    }
  }
  if (!verdict.applicable) {
    return { ran: false, result: 'VERDICT: ' + verdict.violations.map((v) => v.kind).join(',') }
  }
  const r = await executeApplyPatch({ patch: String(args.patch) }, root)
  return { ran: true, result: r.result, note }
}

describe('WM smoke — verify catches a doomed edit before it runs', () => {
  it('patching a nonexistent file returns a verdict and writes nothing', async () => {
    console.log('\n[1] Edit a file that does not exist:')
    const out = await gatedApply(PATCH('*** Update File: missing.ts\n@@\n-a\n+b'))
    line(`gate → ${out.result}`)
    line(`missing.ts on disk after: ${existsSync(join(root, 'missing.ts'))}`)
    expect(out.ran).toBe(false)
    expect(existsSync(join(root, 'missing.ts'))).toBe(false)
  })
})

describe('WM smoke — repair fixes a whitespace-only mismatch and applies', () => {
  it('a hunk that differs only by indentation is re-anchored and executed', async () => {
    writeFileSync(join(root, 'app.ts'), '    const port = 8080\n')
    console.log('\n[2] Patch with wrong indentation (file has 4 spaces, patch has 0):')
    line('before: ' + JSON.stringify(readFileSync(join(root, 'app.ts'), 'utf8')))
    const out = await gatedApply(PATCH('*** Update File: app.ts\n@@\n-const port = 8080\n+const port = 3000'))
    line(`repair → ${out.note ?? '(none)'}`)
    line(`result → ${out.result.split('\n')[0]}`)
    line('after:  ' + JSON.stringify(readFileSync(join(root, 'app.ts'), 'utf8')))
    expect(out.ran).toBe(true)
    expect(readFileSync(join(root, 'app.ts'), 'utf8')).toBe('    const port = 3000\n')
  })
})

describe('WM smoke — repair resolves a wrong path', () => {
  it('a backslash path is normalized and the edit applies', async () => {
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'x.ts'), 'old\n')
    console.log('\n[3] Patch names src\\\\x.ts (backslash) on a POSIX workspace:')
    const out = await gatedApply(PATCH('*** Update File: src\\x.ts\n@@\n-old\n+new'))
    line(`repair → ${out.note ?? '(none)'}`)
    line('src/x.ts after: ' + JSON.stringify(readFileSync(join(root, 'src', 'x.ts'), 'utf8')))
    expect(out.ran).toBe(true)
    expect(readFileSync(join(root, 'src', 'x.ts'), 'utf8')).toBe('new\n')
  })

  it('a bare filename that lives one dir down is resolved and applied', async () => {
    mkdirSync(join(root, 'src', 'deep'), { recursive: true })
    writeFileSync(join(root, 'src', 'deep', 'target.ts'), 'content\n')
    console.log('\n[4] Patch names target.ts; the real file is src/deep/target.ts:')
    const out = await gatedApply(PATCH('*** Update File: target.ts\n@@\n-content\n+changed'))
    line(`repair → ${out.note ?? '(none)'}`)
    line('src/deep/target.ts after: ' + JSON.stringify(readFileSync(join(root, 'src', 'deep', 'target.ts'), 'utf8')))
    expect(out.ran).toBe(true)
    expect(readFileSync(join(root, 'src', 'deep', 'target.ts'), 'utf8')).toBe('changed\n')
  })
})

describe('WM smoke — batch rollforward blocks a self-contradicting plan', () => {
  it('delete-then-update the same file executes NOTHING', () => {
    writeFileSync(join(root, 'doomed.ts'), 'x\n')
    console.log('\n[5] Batch: (1) delete doomed.ts, (2) update doomed.ts:')
    const rf = rollforwardCalls(
      [
        { toolName: 'apply_patch', args: { patch: PATCH('*** Delete File: doomed.ts') } },
        { toolName: 'apply_patch', args: { patch: PATCH('*** Update File: doomed.ts\n@@\n-x\n+y') } }
      ],
      { workspaceRoot: root, conversationId: 'smoke' }
    )
    line(`rollforward ok=${rf.ok}, first bad call index=${rf.firstViolation?.index}`)
    line(`doomed.ts still on disk (nothing executed yet): ${existsSync(join(root, 'doomed.ts'))}`)
    expect(rf.ok).toBe(false)
    expect(rf.firstViolation?.index).toBe(1)
    expect(existsSync(join(root, 'doomed.ts'))).toBe(true)
  })
})

describe('WM smoke — goal predicates flip from unmet to met', () => {
  it('a rename goal is unmet before and met after the edit', async () => {
    writeFileSync(join(root, 'math.ts'), 'export function add(a,b){return a+b}\n')
    const runCmd = async () => ({ ok: true, detail: 'exit 0' })
    console.log('\n[6] Goal: math.ts contains "export function sum":')
    const before = await evaluatePredicate(
      { kind: 'file-contains', path: 'math.ts', needle: 'export function sum' }, root, runCmd
    )
    line(`before edit → met=${before.met} (${before.detail})`)
    await gatedApply(PATCH('*** Update File: math.ts\n@@\n-export function add(a,b){return a+b}\n+export function sum(a,b){return a+b}'))
    const after = await evaluatePredicate(
      { kind: 'file-contains', path: 'math.ts', needle: 'export function sum' }, root, runCmd
    )
    line(`after edit  → met=${after.met} (${after.detail})`)
    expect(before.met).toBe(false)
    expect(after.met).toBe(true)
  })
})

describe('WM smoke — off-mode reality check (no gate)', () => {
  it('the same doomed patch reaches the applier and fails there', async () => {
    console.log('\n[7] Off mode (no world model): the applier itself rejects the doomed patch:')
    const r = await executeApplyPatch({ patch: PATCH('*** Update File: missing.ts\n@@\n-a\n+b') }, root)
    line(`applier → ${r.result}`)
    expect(r.result).toContain('does not exist')
  })
})
