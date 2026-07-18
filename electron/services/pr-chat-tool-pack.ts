import { loadPullRequestContext } from './pr-chat-context'
import {
  addDraftReviewComment,
  createDetachedFinding,
  replyToDraftReviewComment,
  startDraftReview,
  submitDraftReview
} from './pr-review-flow'
import { toolRegistry, type ToolExecutionContext } from './tool-registry'

const BINDING_SCHEMA = {
  fullName: { type: 'string', description: 'Bound repository in owner/name form.' },
  number: { type: 'number', description: 'Bound pull request number.' },
  expectedHeadSha: {
    type: 'string',
    description: 'Optional caller-observed head SHA. A mismatch fails closed.'
  }
} as const

export function redactPullRequestText(value: string): string {
  return value
    .replace(/\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [REDACTED]')
    .replace(/(Authorization\s*:\s*)[^\s]+/gi, '$1[REDACTED]')
}

function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactPullRequestText(value) as T
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactDeep(item)])
    ) as T
  }
  return value
}

async function readContext(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
  options: { selectedPath?: string | null; filePage?: number; filePageSize?: number } = {}
) {
  if (!ctx.conversationId) throw new Error('PR tools require an active conversation')
  return loadPullRequestContext({
    conversationId: ctx.conversationId,
    fullName: String(args.fullName ?? ''),
    number: Number(args.number),
    expectedHeadSha: typeof args.expectedHeadSha === 'string' ? args.expectedHeadSha : null,
    ...options
  })
}

function registerReadTool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  handler: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>
): void {
  toolRegistry.registerNative(
    {
      id: name,
      name,
      title,
      description,
      providerKind: 'native',
      providerId: 'github',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { ...BINDING_SCHEMA, ...properties },
        required
      },
      risks: ['read', 'network'],
      requiresApproval: false,
      enabled: true,
      parallelizable: true,
      lazy: true,
      mutates: false
    },
    async (args, ctx) => JSON.stringify(redactDeep(await handler(args, ctx)))
  )
}

registerReadTool(
  'pr_summary',
  'Read PR summary',
  'Read bounded metadata for a pull request bound to the active conversation.',
  {},
  ['fullName', 'number'],
  async (args, ctx) => {
    const value = await readContext(args, ctx, { filePageSize: 1 })
    return {
      repository: value.repository,
      pullRequest: value.pullRequest,
      binding: value.binding
    }
  }
)

function registerReviewTool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean,
  handler: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>
): void {
  toolRegistry.registerNative(
    {
      id: name,
      name,
      title,
      description,
      providerKind: 'native',
      providerId: 'github',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...BINDING_SCHEMA,
          headSha: { type: 'string', description: 'Exact bound PR head SHA.' },
          ...properties
        },
        required
      },
      risks: requiresApproval ? ['write', 'network'] : ['write'],
      requiresApproval,
      enabled: true,
      lazy: true,
      mutates: true
    },
    async (args, ctx) => {
      if (!ctx.conversationId) throw new Error('PR review tools require an active conversation')
      return JSON.stringify(
        await handler(args, { ...ctx, conversationId: ctx.conversationId })
      )
    }
  )
}

const idempotency = {
  idempotencyKey: {
    type: 'string',
    description: 'Stable unique key for this exact external write.'
  }
}

registerReviewTool(
  'pr_review_start',
  'Start pending PR review',
  'Create a pending GitHub review pinned to the exact bound head SHA.',
  { body: { type: 'string' }, ...idempotency },
  ['fullName', 'number', 'headSha', 'idempotencyKey'],
  true,
  async (args, ctx) => startDraftReview({
    conversationId: ctx.conversationId!, fullName: String(args.fullName), number: Number(args.number),
    headSha: String(args.headSha), body: typeof args.body === 'string' ? args.body : undefined,
    idempotencyKey: String(args.idempotencyKey)
  })
)

registerReviewTool(
  'pr_review_comment',
  'Add pending review comment',
  'Add one exact path/line annotation to a pending review after current-diff validation.',
  {
    reviewId: { type: 'number' }, path: { type: 'string' }, line: { type: 'number' },
    startLine: { type: 'number' }, side: { type: 'string', enum: ['LEFT', 'RIGHT'] },
    body: { type: 'string' }, ...idempotency
  },
  ['fullName', 'number', 'headSha', 'reviewId', 'path', 'line', 'side', 'body', 'idempotencyKey'],
  true,
  async (args, ctx) => addDraftReviewComment({
    conversationId: ctx.conversationId!, fullName: String(args.fullName), number: Number(args.number),
    headSha: String(args.headSha), reviewId: Number(args.reviewId), path: String(args.path),
    line: Number(args.line), startLine: typeof args.startLine === 'number' ? args.startLine : undefined,
    side: String(args.side) as 'LEFT' | 'RIGHT', body: String(args.body),
    idempotencyKey: String(args.idempotencyKey)
  })
)

registerReviewTool(
  'pr_review_reply',
  'Reply to PR review comment',
  'Reply to an existing review comment on the exact bound PR head.',
  { commentId: { type: 'number' }, body: { type: 'string' }, ...idempotency },
  ['fullName', 'number', 'headSha', 'commentId', 'body', 'idempotencyKey'],
  true,
  async (args, ctx) => replyToDraftReviewComment({
    conversationId: ctx.conversationId!, fullName: String(args.fullName), number: Number(args.number),
    headSha: String(args.headSha), commentId: Number(args.commentId), body: String(args.body),
    idempotencyKey: String(args.idempotencyKey)
  })
)

registerReviewTool(
  'pr_review_submit',
  'Submit pending PR review',
  'Submit one pending review as comment, approval, or request-changes on the exact bound head.',
  {
    reviewId: { type: 'number' },
    event: { type: 'string', enum: ['COMMENT', 'APPROVE', 'REQUEST_CHANGES'] },
    body: { type: 'string' }, ...idempotency
  },
  ['fullName', 'number', 'headSha', 'reviewId', 'event', 'idempotencyKey'],
  true,
  async (args, ctx) => submitDraftReview({
    conversationId: ctx.conversationId!, fullName: String(args.fullName), number: Number(args.number),
    headSha: String(args.headSha), reviewId: Number(args.reviewId),
    event: String(args.event) as 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES',
    body: typeof args.body === 'string' ? args.body : undefined,
    idempotencyKey: String(args.idempotencyKey)
  })
)

registerReviewTool(
  'pr_finding_create',
  'Record detached PR finding',
  'Record a local detached review finding without posting anything to GitHub.',
  { path: { type: 'string' }, line: { type: 'number' }, body: { type: 'string' } },
  ['fullName', 'number', 'headSha', 'body'],
  false,
  async (args, ctx) => createDetachedFinding({
    conversationId: ctx.conversationId!, fullName: String(args.fullName), number: Number(args.number),
    headSha: String(args.headSha), path: typeof args.path === 'string' ? args.path : undefined,
    line: typeof args.line === 'number' ? args.line : undefined, body: String(args.body)
  })
)

registerReadTool(
  'pr_files',
  'List PR files',
  'List one bounded page of files changed by a bound pull request.',
  {
    page: { type: 'number', description: 'Page number, starting at 1.' },
    pageSize: { type: 'number', description: 'Page size from 1 to 100.' }
  },
  ['fullName', 'number'],
  async (args, ctx) => {
    const value = await readContext(args, ctx, {
      filePage: typeof args.page === 'number' ? args.page : undefined,
      filePageSize: typeof args.pageSize === 'number' ? args.pageSize : undefined
    })
    return { files: value.files, page: value.filePage, nextPage: value.nextFilePage }
  }
)

registerReadTool(
  'pr_diff_hunks',
  'Read PR diff hunks',
  'Read the bounded GitHub patch fragment for one path in a bound pull request.',
  { path: { type: 'string', description: 'Exact changed-file path.' } },
  ['fullName', 'number', 'path'],
  async (args, ctx) => {
    const value = await readContext(args, ctx, {
      filePageSize: 100,
      selectedPath: String(args.path ?? '')
    })
    return value.selectedDiff
  }
)

registerReadTool(
  'pr_checks',
  'Read PR checks',
  'Read the bounded status and check-run rollup for a bound pull request.',
  {},
  ['fullName', 'number'],
  async (args, ctx) => {
    const value = await readContext(args, ctx, { filePageSize: 1 })
    return { sha: value.pullRequest.head.sha, checks: value.checks, truncated: value.truncated.checks }
  }
)

registerReadTool(
  'pr_comments',
  'Read PR review comments',
  'Read bounded review threads and comments for a bound pull request.',
  {},
  ['fullName', 'number'],
  async (args, ctx) => {
    const value = await readContext(args, ctx, { filePageSize: 1 })
    return { threads: value.threads, truncated: value.truncated.threads }
  }
)

registerReadTool(
  'pr_patch_inspect',
  'Inspect PR patch',
  'Inspect bounded changed-file metadata and one optional path patch without applying it.',
  { path: { type: 'string', description: 'Optional exact changed-file path.' } },
  ['fullName', 'number'],
  async (args, ctx) => {
    const value = await readContext(args, ctx, {
      filePageSize: 100,
      selectedPath: typeof args.path === 'string' ? args.path : null
    })
    return {
      headSha: value.pullRequest.head.sha,
      files: value.files,
      selectedDiff: value.selectedDiff,
      truncated: value.truncated.files
    }
  }
)
