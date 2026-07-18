import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ loadPullRequestContext: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./pr-chat-context', () => ({ loadPullRequestContext: mocks.loadPullRequestContext }))

import './pr-chat-tool-pack'
import { toolRegistry } from './tool-registry'
import { validateToolArguments } from './tool-schema-validator'

const NAMES = ['pr_summary', 'pr_files', 'pr_diff_hunks', 'pr_checks', 'pr_comments', 'pr_patch_inspect']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadPullRequestContext.mockResolvedValue({
    repository: { id: 1, fullName: 'octo/repo', htmlUrl: 'https://github.com/octo/repo' },
    pullRequest: { head: { sha: 'head' }, body: 'Bearer secret-token-value-123456' },
    binding: { headSha: 'head' },
    files: [{ filename: 'src/a.ts', patch: '+github_pat_abcdefghijklmnopqrstuvwxyz' }],
    filePage: 1,
    nextFilePage: null,
    checks: [],
    threads: [],
    selectedDiff: { path: 'src/a.ts', patch: '+ok', found: true, truncated: false },
    truncated: { files: false, checks: false, threads: false }
  })
})

describe('PR-2 inspection tools', () => {
  it('registers strict lazy read-only network tools', () => {
    for (const name of NAMES) {
      const descriptor = toolRegistry.getById(name)
      expect(descriptor?.lazy, name).toBe(true)
      expect(descriptor?.risks, name).toEqual(['read', 'network'])
      expect(descriptor?.requiresApproval, name).toBe(false)
      expect(descriptor?.parallelizable, name).toBe(true)
      expect(descriptor?.mutates, name).toBe(false)
      expect((descriptor?.inputSchema as { additionalProperties: boolean }).additionalProperties).toBe(false)
      expect(validateToolArguments(name, { fullName: 'octo/repo', number: 1, extra: true }, descriptor!.inputSchema).valid).toBe(false)
    }
  })

  it('uses the active conversation and forwards pagination and stale-SHA guards', async () => {
    await toolRegistry.executeNative(
      'pr_files',
      { fullName: 'octo/repo', number: 7, expectedHeadSha: 'head', page: 3, pageSize: 25 },
      { conversationId: 'conversation-1' }
    )
    expect(mocks.loadPullRequestContext).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1', expectedHeadSha: 'head', filePage: 3, filePageSize: 25
      })
    )
  })

  it('redacts credential-shaped text before returning model context', async () => {
    const result = String(await toolRegistry.executeNative(
      'pr_summary', { fullName: 'octo/repo', number: 7 }, { conversationId: 'conversation-1' }
    ))
    expect(result).not.toContain('secret-token-value')
    expect(result).toContain('[REDACTED]')
  })

  it('surfaces permission and network failures without retrying', async () => {
    mocks.loadPullRequestContext.mockRejectedValueOnce(new Error('GitHub API 403: forbidden'))
    await expect(toolRegistry.executeNative(
      'pr_checks', { fullName: 'octo/repo', number: 7 }, { conversationId: 'conversation-1' }
    )).rejects.toThrow(/403/)
    expect(mocks.loadPullRequestContext).toHaveBeenCalledTimes(1)
  })

  it('refuses calls without an active conversation binding scope', async () => {
    await expect(toolRegistry.executeNative(
      'pr_comments', { fullName: 'octo/repo', number: 7 }, {}
    )).rejects.toThrow(/active conversation/)
  })
})
