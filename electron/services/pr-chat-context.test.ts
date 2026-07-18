import { describe, expect, it, vi } from 'vitest'
import {
  PR_CONTEXT_LIMITS,
  StalePullRequestError,
  assertBoundRepository,
  loadPullRequestContext,
  type PullRequestContextDependencies
} from './pr-chat-context'
import type { ConversationPullRequestLink } from './github-repo-store'
import type { GitHubPullRequest, GitHubRepository } from './github-types'

const binding: ConversationPullRequestLink = {
  conversationId: 'conversation-1',
  prNumber: 7,
  fullName: 'octo/repo',
  htmlUrl: 'https://github.com/octo/repo/pull/7',
  title: 'Bound PR',
  createdAt: 1,
  updatedAt: 1,
  repoId: 42,
  baseSha: 'base',
  headSha: 'head'
}

const repository: GitHubRepository = {
  id: 42,
  fullName: 'octo/repo',
  owner: 'octo',
  name: 'repo',
  private: false,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/octo/repo',
  cloneUrl: 'https://github.com/octo/repo.git',
  sshUrl: 'git@github.com:octo/repo.git',
  description: null
}

const pullRequest: GitHubPullRequest = {
  number: 7,
  title: 'Bound PR',
  body: null,
  state: 'open',
  draft: false,
  merged: false,
  htmlUrl: binding.htmlUrl,
  user: { login: 'octo', avatarUrl: null },
  base: { ref: 'main', sha: 'base', label: null },
  head: { ref: 'topic', sha: 'head', label: null },
  createdAt: '2026-07-18T00:00:00Z',
  updatedAt: '2026-07-18T00:00:00Z'
}

function dependencies(
  patch = 'x'.repeat(PR_CONTEXT_LIMITS.selectedDiffBytes + 100)
): PullRequestContextDependencies {
  return {
    listBindings: vi.fn(() => [binding]),
    getRepository: vi.fn(async () => repository),
    getPullRequest: vi.fn(async () => pullRequest),
    listFiles: vi.fn(async () => [
      {
        sha: 'file-sha',
        filename: 'src/a.ts',
        previousFilename: null,
        status: 'modified',
        additions: 1,
        deletions: 1,
        changes: 2,
        patch
      }
    ]),
    getStatus: vi.fn(async () => ({ sha: 'head', overall: 'success' as const, checks: [] })),
    listThreads: vi.fn(async () => [])
  }
}

describe('PR-1 pull request context', () => {
  it('rejects stale bound and caller head SHAs', async () => {
    await expect(
      loadPullRequestContext(
        { conversationId: 'conversation-1', fullName: 'octo/repo', number: 7 },
        {
          ...dependencies(),
          getPullRequest: vi.fn(async () => ({
            ...pullRequest,
            head: { ...pullRequest.head, sha: 'new-head' }
          }))
        }
      )
    ).rejects.toBeInstanceOf(StalePullRequestError)
    await expect(
      loadPullRequestContext(
        {
          conversationId: 'conversation-1',
          fullName: 'octo/repo',
          number: 7,
          expectedHeadSha: 'other'
        },
        dependencies()
      )
    ).rejects.toBeInstanceOf(StalePullRequestError)
  })

  it('rejects repository name and immutable id mismatches', () => {
    expect(() => assertBoundRepository(binding, { ...repository, fullName: 'octo/other' })).toThrow(
      /identity/
    )
    expect(() => assertBoundRepository(binding, { ...repository, id: 99 })).toThrow(/id changed/)
  })

  it('bounds pagination and selected diff bytes with explicit truncation', async () => {
    const deps = dependencies()
    const result = await loadPullRequestContext(
      {
        conversationId: 'conversation-1',
        fullName: 'octo/repo',
        number: 7,
        filePage: 2,
        filePageSize: 500,
        selectedPath: 'src/a.ts'
      },
      deps
    )
    expect(deps.listFiles).toHaveBeenCalledWith('octo', 'repo', 7, { page: 2, perPage: 100 })
    expect(Buffer.byteLength(result.selectedDiff?.patch ?? '', 'utf8')).toBeLessThanOrEqual(
      PR_CONTEXT_LIMITS.selectedDiffBytes
    )
    expect(result.selectedDiff?.truncated).toBe(true)
  })

  it('requires an exact conversation binding before network access', async () => {
    const deps = dependencies()
    deps.listBindings = vi.fn(() => [])
    await expect(
      loadPullRequestContext({ conversationId: 'other', fullName: 'octo/repo', number: 7 }, deps)
    ).rejects.toThrow(/not bound/)
    expect(deps.getRepository).not.toHaveBeenCalled()
  })
})
