import { loadPullRequestContext } from './pr-chat-context'
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
