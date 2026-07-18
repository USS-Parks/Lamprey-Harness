import * as github from './github-service'
import { loadPullRequestContext } from './pr-chat-context'
import { createDetachedPrFinding, runIdempotentReviewAction } from './pr-review-store'

export function diffContainsLine(patch: string, line: number, side: 'LEFT' | 'RIGHT'): boolean {
  if (!Number.isInteger(line) || line <= 0) return false
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm
  for (const match of patch.matchAll(header)) {
    const start = Number(side === 'LEFT' ? match[1] : match[3])
    const count = Number((side === 'LEFT' ? match[2] : match[4]) ?? 1)
    if (line >= start && line < start + count) return true
  }
  return false
}

function split(fullName: string): [string, string] {
  const parts = fullName.split('/')
  if (parts.length !== 2) throw new Error('invalid repository identity')
  return [parts[0], parts[1]]
}

async function fresh(input: { conversationId: string; fullName: string; number: number; headSha: string; path?: string }) {
  return loadPullRequestContext({
    conversationId: input.conversationId, fullName: input.fullName, number: input.number,
    expectedHeadSha: input.headSha, filePageSize: 100, selectedPath: input.path ?? null
  })
}

export async function startDraftReview(input: {
  conversationId: string; fullName: string; number: number; headSha: string;
  body?: string; idempotencyKey: string
}) {
  await fresh(input)
  const [owner, repo] = split(input.fullName)
  return runIdempotentReviewAction(input.idempotencyKey, `${input.fullName}#${input.number}@${input.headSha}`, () =>
    github.createPendingPullRequestReview({ owner, repo, number: input.number, commitId: input.headSha, body: input.body })
  )
}

export async function addDraftReviewComment(input: {
  conversationId: string; fullName: string; number: number; headSha: string;
  reviewId: number; path: string; line: number; startLine?: number;
  side: 'LEFT' | 'RIGHT'; body: string; idempotencyKey: string
}) {
  const context = await fresh(input)
  const patch = context.selectedDiff?.patch ?? ''
  if (!context.selectedDiff?.found || !diffContainsLine(patch, input.line, input.side)) {
    throw new Error('review line is not present in the current pull request diff')
  }
  const [owner, repo] = split(input.fullName)
  const target = `${input.fullName}#${input.number}:${input.path}:${input.line}:${input.side}`
  return runIdempotentReviewAction(input.idempotencyKey, target, () =>
    github.addPendingReviewComment({ ...input, owner, repo })
  )
}

export async function replyToDraftReviewComment(input: {
  conversationId: string; fullName: string; number: number; headSha: string;
  commentId: number; body: string; idempotencyKey: string
}) {
  await fresh(input)
  const [owner, repo] = split(input.fullName)
  return runIdempotentReviewAction(input.idempotencyKey, `${input.fullName}#${input.number}:reply:${input.commentId}`, () =>
    github.replyToReviewComment({ owner, repo, number: input.number, commentId: input.commentId, body: input.body })
  )
}

export async function submitDraftReview(input: {
  conversationId: string; fullName: string; number: number; headSha: string;
  reviewId: number; event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body?: string;
  idempotencyKey: string
}) {
  await fresh(input)
  const [owner, repo] = split(input.fullName)
  return runIdempotentReviewAction(input.idempotencyKey, `${input.fullName}#${input.number}:review:${input.reviewId}`, () =>
    github.submitPendingPullRequestReview({ owner, repo, number: input.number, reviewId: input.reviewId, event: input.event, body: input.body })
  )
}

export async function createDetachedFinding(input: {
  conversationId: string; fullName: string; number: number; headSha: string;
  path?: string; line?: number; body: string
}) {
  await fresh(input)
  return createDetachedPrFinding({
    conversationId: input.conversationId, fullName: input.fullName, prNumber: input.number,
    headSha: input.headSha, path: input.path, line: input.line, body: input.body
  })
}
