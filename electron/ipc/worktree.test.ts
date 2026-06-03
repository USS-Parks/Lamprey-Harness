import { describe, it, expect } from 'vitest'
import { resolve, isAbsolute } from 'path'
import {
  isValidRefName,
  planWorktreeCreate,
  planWorktreeRemove
} from './worktree'

// Pure validation + argv assembly only. The IPC plumbing is covered by the
// integration smoke; this file pins the argument-injection defences so a
// refactor that drops the `--` separator or relaxes the regex trips a test.

describe('isValidRefName', () => {
  it('accepts ordinary branch names', () => {
    expect(isValidRefName('main')).toBe(true)
    expect(isValidRefName('feature/foo-bar_v2')).toBe(true)
    expect(isValidRefName('release/1.2.3')).toBe(true)
    expect(isValidRefName('origin/main')).toBe(true)
  })

  it('rejects empty / non-string', () => {
    expect(isValidRefName('')).toBe(false)
    expect(isValidRefName(undefined)).toBe(false)
    expect(isValidRefName(null as unknown as string)).toBe(false)
    expect(isValidRefName(42 as unknown as string)).toBe(false)
  })

  it('rejects leading "-" (argument injection)', () => {
    expect(isValidRefName('-foo')).toBe(false)
    expect(isValidRefName('--force')).toBe(false)
    expect(isValidRefName('-')).toBe(false)
  })

  it('rejects shell metacharacters and whitespace', () => {
    expect(isValidRefName(';rm -rf /')).toBe(false)
    expect(isValidRefName('foo bar')).toBe(false)
    expect(isValidRefName('foo;bar')).toBe(false)
    expect(isValidRefName('foo|bar')).toBe(false)
    expect(isValidRefName('foo`bar`')).toBe(false)
    expect(isValidRefName('foo$bar')).toBe(false)
    expect(isValidRefName('foo&bar')).toBe(false)
  })

  it('rejects ".." sequences (git refname disallows them too)', () => {
    expect(isValidRefName('feature/..')).toBe(false)
    expect(isValidRefName('a/../b')).toBe(false)
  })

  it('rejects names that exceed the length cap', () => {
    expect(isValidRefName('a'.repeat(201))).toBe(false)
    expect(isValidRefName('a'.repeat(200))).toBe(true)
  })
})

describe('planWorktreeCreate', () => {
  it('rejects missing path', () => {
    const r = planWorktreeCreate({ path: '', branch: 'main' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('path')
  })

  it('rejects invalid branch name', () => {
    const r = planWorktreeCreate({ path: '/tmp/wt', branch: '-evil' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('branch')
  })

  it('rejects invalid baseRef', () => {
    const r = planWorktreeCreate({
      path: '/tmp/wt',
      branch: 'feature/foo',
      baseRef: '-x'
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('baseref')
  })

  it('builds argv with -- before the worktree path', () => {
    const r = planWorktreeCreate({
      cwd: resolve('/tmp/repo'),
      path: '/abs/wt',
      branch: 'feature/foo'
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.gitArgs).toEqual([
      'worktree',
      'add',
      '-b',
      'feature/foo',
      '--',
      '/abs/wt'
    ])
    expect(r.value.cwd).toBe(resolve('/tmp/repo'))
    expect(r.value.wtPath).toBe('/abs/wt')
  })

  it('appends a valid baseRef after the path', () => {
    const r = planWorktreeCreate({
      cwd: resolve('/tmp/repo'),
      path: '/abs/wt',
      branch: 'feature/foo',
      baseRef: 'origin/main'
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.gitArgs).toEqual([
      'worktree',
      'add',
      '-b',
      'feature/foo',
      '--',
      '/abs/wt',
      'origin/main'
    ])
  })

  it('resolves a relative path against cwd parent (existing behaviour)', () => {
    const cwd = resolve('/tmp/repo')
    const r = planWorktreeCreate({
      cwd,
      path: 'sibling-wt',
      branch: 'foo'
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(isAbsolute(r.value.wtPath)).toBe(true)
    expect(r.value.wtPath).toContain('sibling-wt')
    // The last positional in gitArgs is the resolved abs path.
    expect(r.value.gitArgs[r.value.gitArgs.length - 1]).toBe(r.value.wtPath)
  })
})

describe('planWorktreeRemove', () => {
  it('rejects missing path', () => {
    const r = planWorktreeRemove({ path: '' })
    expect(r.ok).toBe(false)
  })

  it('rejects relative path', () => {
    const r = planWorktreeRemove({ path: 'sibling-wt' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('absolute')
  })

  it('rejects a leading "-" even when otherwise abs-shaped', () => {
    const r = planWorktreeRemove({ path: '-x' })
    expect(r.ok).toBe(false)
  })

  it('builds argv with -- before the path (no --force)', () => {
    const r = planWorktreeRemove({ path: '/abs/wt' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.gitArgs).toEqual(['worktree', 'remove', '--', '/abs/wt'])
  })

  it('builds argv with --force before -- when requested', () => {
    const r = planWorktreeRemove({ path: '/abs/wt', force: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.gitArgs).toEqual([
      'worktree',
      'remove',
      '--force',
      '--',
      '/abs/wt'
    ])
  })

  it('defaults cwd to process.cwd() when omitted', () => {
    const r = planWorktreeRemove({ path: '/abs/wt' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.cwd).toBe(process.cwd())
  })
})
