import * as github from './github-service'
import * as repoStore from './github-repo-store'
import type { GitHubPullRequest, GitHubPullRequestFile, GitHubRepository } from './github-types'

export const PR_CONTEXT_LIMITS = {
  files: 100,
  checks: 100,
  threads: 100,
  commentsPerThread: 20,
  selectedDiffBytes: 24_000
} as const

export class StalePullRequestError extends Error {
  constructor(expected: string, actual: string) {
    super(`Pull request head changed: expected ${expected}, found ${actual}`)
    this.name = 'StalePullRequestError'
  }
}

export interface PullRequestContextRequest {
  conversationId: string
  fullName: string
  number: number
  expectedHeadSha?: string | null
  filePage?: number
  filePageSize?: number
  selectedPath?: string | null
}

export interface PullRequestContextDependencies {
  listBindings: typeof repoStore.listPullRequestsForConversation
  getRepository: typeof github.getRepository
  getPullRequest: typeof github.getPullRequest
  listFiles: typeof github.listPullRequestFiles
  getStatus: typeof github.getPullRequestStatus
  listThreads: typeof github.listPullRequestReviewThreads
}

const defaultDependencies: PullRequestContextDependencies = {
  listBindings: repoStore.listPullRequestsForConversation,
  getRepository: github.getRepository,
  getPullRequest: github.getPullRequest,
  listFiles: github.listPullRequestFiles,
  getStatus: github.getPullRequestStatus,
  listThreads: github.listPullRequestReviewThreads
}

function splitFullName(fullName: string): [string, string] {
  const parts = fullName.split('/')
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error('Invalid bound repository identity')
  }
  return [parts[0], parts[1]]
}

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length <= maxBytes) return { text: value, truncated: false }
  return { text: bytes.subarray(0, maxBytes).toString('utf8'), truncated: true }
}

export function assertBoundRepository(
  binding: repoStore.ConversationPullRequestLink,
  repository: GitHubRepository
): void {
  if (repository.fullName.toLowerCase() !== binding.fullName.toLowerCase()) {
    throw new Error('GitHub repository identity does not match the bound pull request')
  }
  if (binding.repoId !== null && binding.repoId !== undefined && binding.repoId !== repository.id) {
    throw new Error('GitHub repository id changed for the bound pull request')
  }
}

export function assertFreshHead(
  binding: repoStore.ConversationPullRequestLink,
  pullRequest: GitHubPullRequest,
  expectedHeadSha?: string | null
): void {
  const actual = pullRequest.head.sha ?? ''
  const expected = expectedHeadSha ?? binding.headSha
  if (expected && expected !== actual) throw new StalePullRequestError(expected, actual)
}

export async function loadPullRequestContext(
  input: PullRequestContextRequest,
  dependencies: PullRequestContextDependencies = defaultDependencies
) {
  const binding = dependencies
    .listBindings(input.conversationId)
    .find(
      (item) =>
        item.fullName.toLowerCase() === input.fullName.toLowerCase() &&
        item.prNumber === input.number
    )
  if (!binding) throw new Error('Pull request is not bound to this conversation')
  const [owner, repo] = splitFullName(binding.fullName)
  const repository = await dependencies.getRepository(owner, repo)
  assertBoundRepository(binding, repository)
  const pullRequest = await dependencies.getPullRequest(owner, repo, binding.prNumber)
  assertFreshHead(binding, pullRequest, input.expectedHeadSha)

  const filePage = Math.max(1, Math.floor(input.filePage ?? 1))
  const filePageSize = Math.min(
    PR_CONTEXT_LIMITS.files,
    Math.max(1, Math.floor(input.filePageSize ?? 50))
  )
  const [filesRaw, status, threadsRaw] = await Promise.all([
    dependencies.listFiles(owner, repo, binding.prNumber, {
      page: filePage,
      perPage: filePageSize
    }),
    dependencies.getStatus(owner, repo, binding.prNumber),
    dependencies.listThreads(owner, repo, binding.prNumber)
  ])
  const files = filesRaw.slice(0, PR_CONTEXT_LIMITS.files)
  const checks = status.checks.slice(0, PR_CONTEXT_LIMITS.checks)
  const threads = threadsRaw.slice(0, PR_CONTEXT_LIMITS.threads).map((thread) => ({
    ...thread,
    comments: thread.comments.slice(0, PR_CONTEXT_LIMITS.commentsPerThread),
    commentsTruncated: thread.comments.length > PR_CONTEXT_LIMITS.commentsPerThread
  }))
  const selectedFile: GitHubPullRequestFile | undefined = input.selectedPath
    ? files.find((file) => file.filename === input.selectedPath)
    : undefined
  const selected = truncateUtf8(selectedFile?.patch ?? '', PR_CONTEXT_LIMITS.selectedDiffBytes)

  return {
    binding,
    repository: { id: repository.id, fullName: repository.fullName, htmlUrl: repository.htmlUrl },
    pullRequest,
    files,
    filePage,
    nextFilePage: filesRaw.length === filePageSize ? filePage + 1 : null,
    checks,
    threads,
    selectedDiff: input.selectedPath
      ? {
          path: input.selectedPath,
          patch: selected.text,
          found: Boolean(selectedFile),
          truncated: selected.truncated
        }
      : null,
    truncated: {
      files: filesRaw.length > PR_CONTEXT_LIMITS.files,
      checks: status.checks.length > PR_CONTEXT_LIMITS.checks,
      threads: threadsRaw.length > PR_CONTEXT_LIMITS.threads
    }
  }
}
