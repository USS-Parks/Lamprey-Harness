// WM-10 — search pruning: exact-repeat zero-hit rejection, write-based
// re-opening, zero-match escalation, and uncovered-scope reporting.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  checkSearchRedundancy,
  identifySearchCommand,
  recordSearchCommandOutcome
} from './world-model-search-gate'
import {
  __resetWorldModelStateForTesting,
  recordPatchOutcome
} from './workspace-world-model'

const CONV = 'conv-wm10'
let root: string

beforeEach(() => {
  __resetWorldModelStateForTesting()
  root = mkdtempSync(join(tmpdir(), 'wm10-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('identifySearchCommand', () => {
  it('identifies single-segment grep-family commands', () => {
    expect(identifySearchCommand('grep -rn foo src')).toEqual({ key: 'grep -rn foo src' })
    expect(identifySearchCommand('rg "pattern" .')).toBeTruthy()
    expect(identifySearchCommand('Select-String -Pattern x file.ts')).toBeTruthy()
  })

  it('normalizes whitespace so trivial respellings match', () => {
    expect(identifySearchCommand('grep  -rn   foo  src')!.key).toBe('grep -rn foo src')
  })

  it('rejects compound commands, redirects, and non-search heads', () => {
    expect(identifySearchCommand('grep foo a && grep bar b')).toBeNull()
    expect(identifySearchCommand('grep foo a > out.txt')).toBeNull()
    expect(identifySearchCommand('cat file.ts')).toBeNull()
  })
})

describe('checkSearchRedundancy', () => {
  it('a first-time search always passes', () => {
    expect(checkSearchRedundancy(CONV, 'grep -rn foo src', root).redundant).toBe(false)
  })

  it('an exact repeat of a zero-hit search on an unchanged workspace is rejected', () => {
    recordSearchCommandOutcome(CONV, 'grep -rn foo src', false)
    const r = checkSearchRedundancy(CONV, 'grep -rn foo src', root)
    expect(r.redundant).toBe(true)
    const parsed = JSON.parse(r.message!)
    expect(parsed.error).toBe('redundant_search')
    expect(parsed.reason).toContain('NOT re-executed')
  })

  it('a repeat of a search that FOUND matches passes', () => {
    recordSearchCommandOutcome(CONV, 'grep -rn foo src', true)
    expect(checkSearchRedundancy(CONV, 'grep -rn foo src', root).redundant).toBe(false)
  })

  it('any workspace write re-opens previously rejected searches', () => {
    recordSearchCommandOutcome(CONV, 'grep -rn foo src', false)
    expect(checkSearchRedundancy(CONV, 'grep -rn foo src', root).redundant).toBe(true)
    writeFileSync(join(root, 'new.ts'), 'foo')
    recordPatchOutcome(CONV, [{ kind: 'add', path: 'new.ts' }], root)
    expect(checkSearchRedundancy(CONV, 'grep -rn foo src', root).redundant).toBe(false)
  })

  it('a different search term always passes', () => {
    recordSearchCommandOutcome(CONV, 'grep -rn foo src', false)
    expect(checkSearchRedundancy(CONV, 'grep -rn bar src', root).redundant).toBe(false)
  })

  it('escalates after three zero-hit searches with the ledger and uncovered dirs', () => {
    mkdirSync(join(root, 'docs'))
    mkdirSync(join(root, 'scripts'))
    recordSearchCommandOutcome(CONV, 'grep -rn aaa src', false)
    recordSearchCommandOutcome(CONV, 'grep -rn bbb src', false)
    recordSearchCommandOutcome(CONV, 'grep -rn ccc src', false)
    const r = checkSearchRedundancy(CONV, 'grep -rn ccc src', root)
    expect(r.redundant).toBe(true)
    const parsed = JSON.parse(r.message!)
    expect(parsed.searches_since_last_edit).toHaveLength(3)
    expect(parsed.hint).toContain('ask_user_question')
    expect(parsed.top_level_dirs_not_yet_searched).toEqual(
      expect.arrayContaining(['docs', 'scripts'])
    )
  })
})
