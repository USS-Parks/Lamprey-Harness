import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  proposal: null as null | Record<string, any>,
  loadContext: vi.fn(),
  setStatus: vi.fn()
}))

vi.mock('./pr-chat-context', async (original) => {
  const actual = await original<typeof import('./pr-chat-context')>()
  return { ...actual, loadPullRequestContext: state.loadContext }
})
vi.mock('./pr-patch-store', () => ({
  getPrPatchProposal: () => state.proposal,
  createPrPatchProposal: vi.fn((input) => ({ id: 'p1', status: 'pending', ...input })),
  updatePrPatchProposal: vi.fn((id, patch) => ({ ...state.proposal, id, patch })),
  setPrPatchStatus: state.setStatus
}))

import { acceptPrPatch, validatePrPatchPaths } from './pr-patch-flow'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lamprey-pr-patch-'))
  state.loadContext.mockReset().mockResolvedValue({ pullRequest: { head: { sha: 'head' } } })
  state.setStatus.mockReset().mockImplementation((id, status, result) => ({ id, status, result }))
  state.proposal = {
    id: 'p1', conversationId: 'c1', fullName: 'octo/repo', prNumber: 7,
    headSha: 'head', status: 'pending', rationale: null
  }
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('PR-4 patch flow', () => {
  it('rejects absolute paths and traversal outside the workspace', () => {
    expect(() => validatePrPatchPaths(
      '*** Begin Patch\n*** Add File: ../escape.txt\n+x\n*** End Patch', dir
    )).toThrow(/escapes workspace/)
    expect(() => validatePrPatchPaths(
      '*** Begin Patch\n*** Add File: C:\\escape.txt\n+x\n*** End Patch', dir
    )).toThrow(/relative/)
  })

  it('applies only after fresh-head validation and marks accepted', async () => {
    writeFileSync(join(dir, 'a.txt'), 'one\n', 'utf8')
    state.proposal!.patch = '*** Begin Patch\n*** Update File: a.txt\n@@\n-one\n+ONE\n*** End Patch'
    const result = await acceptPrPatch({ proposalId: 'p1', workspacePath: dir })
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('ONE\n')
    expect(state.loadContext).toHaveBeenCalledWith(expect.objectContaining({ expectedHeadSha: 'head' }))
    expect(state.setStatus).toHaveBeenCalledWith('p1', 'accepted', expect.stringContaining('Applied 1 change'))
    expect(result.proposal.status).toBe('accepted')
  })

  it('rolls back earlier file writes when a later hunk fails', async () => {
    writeFileSync(join(dir, 'a.txt'), 'one\n', 'utf8')
    writeFileSync(join(dir, 'b.txt'), 'two\n', 'utf8')
    state.proposal!.patch = [
      '*** Begin Patch', '*** Update File: a.txt', '@@', '-one', '+ONE',
      '*** Update File: b.txt', '@@', '-missing', '+TWO', '*** End Patch'
    ].join('\n')
    await expect(acceptPrPatch({ proposalId: 'p1', workspacePath: dir })).rejects.toThrow(/rolled back/)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('one\n')
    expect(readFileSync(join(dir, 'b.txt'), 'utf8')).toBe('two\n')
    expect(state.setStatus).toHaveBeenCalledWith('p1', 'error', expect.stringContaining('Error:'))
  })
})
