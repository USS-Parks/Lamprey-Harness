// WM-1 — workspace observation state. Real temp dirs, no mocks: the module
// consults the live filesystem by design (WM_BASELINE §4.1), so the tests do too.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetWorldModelStateForTesting,
  checkFreshness,
  classifyShellCommand,
  clearWorldModelState,
  getDirsListed,
  getFileObservation,
  getLastUnattributedMutationAt,
  getObligations,
  getSearches,
  getWrites,
  recordPatchOutcome,
  recordSearch,
  recordShellOutcome
} from './workspace-world-model'
import { modeAtLeast, resolveWorldModelConfig } from './world-model-config'

const CONV = 'conv-wm1'
let root: string

beforeEach(() => {
  __resetWorldModelStateForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm1-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('classifyShellCommand', () => {
  it('attributes read heads to their path arguments', () => {
    const c = classifyShellCommand('cat src/app.ts')
    expect(c.reads).toEqual(['src/app.ts'])
    expect(c.writes).toEqual([])
    expect(c.mutationCapable).toBe(false)
  })

  it('attributes PowerShell read heads case-insensitively', () => {
    const c = classifyShellCommand('Get-Content electron/main.ts')
    expect(c.reads).toEqual(['electron/main.ts'])
  })

  it('classifies directory listings separately', () => {
    const c = classifyShellCommand('ls src/components')
    expect(c.dirsListed).toEqual(['src/components'])
    expect(c.reads).toEqual([])
  })

  it('treats a bare ls as listing the workspace root', () => {
    expect(classifyShellCommand('ls').dirsListed).toEqual(['.'])
  })

  it('attributes write heads and redirection targets', () => {
    const c = classifyShellCommand('echo hi > notes/out.txt')
    expect(c.writes).toContain('notes/out.txt')
  })

  it('splits compound commands and classifies each segment', () => {
    const c = classifyShellCommand('cat a.txt && rm b.txt')
    expect(c.reads).toEqual(['a.txt'])
    expect(c.writes).toEqual(['b.txt'])
  })

  it('sed without -i reads; sed -i writes', () => {
    expect(classifyShellCommand('sed -n 1,5p x.ts').reads).toEqual(['x.ts'])
    expect(classifyShellCommand('sed -i s/a/b/ x.ts').writes).toEqual(['x.ts'])
  })

  it('marks unattributable build tools as mutation-capable only', () => {
    const c = classifyShellCommand('npm run build')
    expect(c.mutationCapable).toBe(true)
    expect(c.writes).toEqual([])
    expect(c.reads).toEqual([])
  })

  it('tracks git stash push and pop as obligations', () => {
    expect(classifyShellCommand('git stash').stashPush).toBe(true)
    expect(classifyShellCommand('git stash pop').stashPop).toBe(true)
  })

  it('treats git checkout with paths as writes', () => {
    const c = classifyShellCommand('git checkout src/app.ts')
    expect(c.writes).toEqual(['src/app.ts'])
  })

  it('never throws on garbage', () => {
    expect(() => classifyShellCommand('')).not.toThrow()
    expect(() => classifyShellCommand('   >>> ||| &&&')).not.toThrow()
  })
})

describe('recordShellOutcome + freshness', () => {
  it('observes a read file and reports fresh until bytes change', () => {
    const f = join(root, 'a.txt')
    writeFileSync(f, 'one\n')
    recordShellOutcome(CONV, 'cat a.txt', true, root)
    expect(getFileObservation(CONV, f)?.hash).toBeTruthy()
    expect(checkFreshness(CONV, f)).toBe('fresh')
    writeFileSync(f, 'two\n')
    expect(checkFreshness(CONV, f)).toBe('stale')
  })

  it('reports unobserved for files never read and missing for absent paths', () => {
    const f = join(root, 'b.txt')
    writeFileSync(f, 'x')
    expect(checkFreshness(CONV, f)).toBe('unobserved')
    expect(checkFreshness(CONV, join(root, 'nope.txt'))).toBe('missing')
  })

  it('a shell write invalidates then re-observes current bytes', () => {
    const f = join(root, 'c.txt')
    writeFileSync(f, 'old')
    recordShellOutcome(CONV, 'cat c.txt', true, root)
    writeFileSync(f, 'new')
    recordShellOutcome(CONV, 'touch c.txt', true, root)
    expect(checkFreshness(CONV, f)).toBe('fresh')
    expect(getWrites(CONV)).toContain(f)
  })

  it('failed commands observe nothing but still clear stale observations on writes', () => {
    const f = join(root, 'd.txt')
    writeFileSync(f, 'x')
    recordShellOutcome(CONV, 'cat d.txt', false, root)
    expect(getFileObservation(CONV, f)).toBeUndefined()
  })

  it('ignores paths escaping the workspace', () => {
    recordShellOutcome(CONV, 'cat ../outside.txt', true, root)
    expect(getFileObservation(CONV, join(root, '..', 'outside.txt'))).toBeUndefined()
  })

  it('records unattributed mutation timestamps for build tools', () => {
    expect(getLastUnattributedMutationAt(CONV)).toBeNull()
    recordShellOutcome(CONV, 'npm run build', true, root)
    expect(getLastUnattributedMutationAt(CONV)).toBeGreaterThan(0)
  })

  it('accumulates and resolves stash obligations', () => {
    recordShellOutcome(CONV, 'git stash', true, root)
    expect(getObligations(CONV)).toHaveLength(1)
    recordShellOutcome(CONV, 'git stash pop', true, root)
    expect(getObligations(CONV)).toHaveLength(0)
  })

  it('records directory listings', () => {
    mkdirSync(join(root, 'sub'))
    recordShellOutcome(CONV, 'ls sub', true, root)
    expect(getDirsListed(CONV)).toContain(join(root, 'sub'))
  })
})

describe('recordPatchOutcome', () => {
  it('observes written files and forgets deleted ones', () => {
    const f = join(root, 'e.txt')
    writeFileSync(f, 'patched')
    recordPatchOutcome(CONV, [{ kind: 'update', path: 'e.txt' }], root)
    expect(checkFreshness(CONV, f)).toBe('fresh')
    recordPatchOutcome(CONV, [{ kind: 'delete', path: 'e.txt' }], root)
    expect(getFileObservation(CONV, f)).toBeUndefined()
    expect(getWrites(CONV)).toContain(f)
  })
})

describe('search ledger + lifecycle', () => {
  it('records searches with hit counts', () => {
    recordSearch(CONV, 'TODO', 'src/**', 3)
    recordSearch(CONV, 'FIXME', 'src/**', 0)
    const s = getSearches(CONV)
    expect(s).toHaveLength(2)
    expect(s[1]).toMatchObject({ query: 'FIXME', hits: 0 })
  })

  it('clearWorldModelState drops everything for the conversation', () => {
    recordSearch(CONV, 'x', '**', 1)
    clearWorldModelState(CONV)
    expect(getSearches(CONV)).toEqual([])
  })
})

describe('world-model config resolution', () => {
  it('defaults to full mode with bounded budgets', () => {
    const c = resolveWorldModelConfig({})
    expect(c.mode).toBe('full')
    expect(c.repairBudget).toBe(5)
    expect(c.followThroughRounds).toBe(5)
    expect(c.extractionModel).toBeNull()
  })

  it('honors explicit values and rejects junk', () => {
    expect(resolveWorldModelConfig({ workspaceWorldModel: 'off' }).mode).toBe('off')
    expect(resolveWorldModelConfig({ workspaceWorldModel: 'sideways' }).mode).toBe('full')
    expect(resolveWorldModelConfig({ worldModelRepairBudget: 0 }).repairBudget).toBe(0)
    expect(resolveWorldModelConfig({ worldModelRepairBudget: -3 }).repairBudget).toBe(5)
    expect(resolveWorldModelConfig({ worldModelRepairBudget: 999 }).repairBudget).toBe(25)
  })

  it('modeAtLeast ranks the gradient', () => {
    expect(modeAtLeast('full', 'repair')).toBe(true)
    expect(modeAtLeast('verify', 'repair')).toBe(false)
    expect(modeAtLeast('off', 'verify')).toBe(false)
  })
})
