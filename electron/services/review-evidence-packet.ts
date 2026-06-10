import { getActiveChangeContract, type ChangeContract } from './change-contract-store'
import { runGit, type GitResult } from './git-runner'
import { listProofReceipts, type ProofReceiptRecord } from './proof-receipts'
import { listToolCallsForConversation } from './tool-calls-store'
import type { LampreyToolCall } from './tool-registry'

export const REVIEW_EVIDENCE_PACKET_CAP_BYTES = 32 * 1024
const SNIPPET_CAP_CHARS = 1200
const DIFF_CAP_CHARS = 20 * 1024

export interface ReviewEvidencePacket {
  kind: 'review_evidence_packet'
  version: 1
  conversationId: string
  correlationId?: string
  workspacePath: string
  generatedAt: number
  userGoal?: string
  contract: ReviewContractSummary | null
  git: {
    changedFiles: Array<{ status: string; path: string }>
    diffSummary: string
    snippets: ReviewDiffSnippet[]
    error?: string
  }
  proof: {
    receipts: ReviewReceiptSummary[]
    failedCommands: string[]
    skippedCommands: string[]
    staleGreenWarnings: string[]
  }
  toolCalls: ReviewToolCallSummary[]
  omissions: string[]
  builderNarrative?: string
}

export interface ReviewContractSummary {
  id: string
  status: string
  goal: string
  acceptanceCriteria: string[]
  expectedFiles: string[]
  nonGoals: string[]
  verificationCommands: string[]
  requiredReceiptKinds: string[]
}

export interface ReviewDiffSnippet {
  file: string
  header: string
  snippet: string
  truncated: boolean
}

export interface ReviewReceiptSummary {
  id: string
  kind: string
  status: string
  command: string
  commandHash: string
  finishedAt: number
  durationMs: number
  exitCode?: number
  contractId?: string
  correlationId?: string
  parsedMetrics: Record<string, unknown>
}

export interface ReviewToolCallSummary {
  id: string
  toolId: string
  name: string
  status: string
  startedAt: number
  finishedAt?: number
  durationMs?: number
  parentCallId?: string
  error?: string
}

export interface BuildReviewEvidencePacketInput {
  conversationId: string
  correlationId?: string
  workspacePath: string
  userGoal?: string
  builderNarrative?: string
  capBytes?: number
  deps?: ReviewEvidencePacketDeps
}

export interface ReviewEvidencePacketDeps {
  now?: () => number
  getActiveContract?: (conversationId: string, correlationId?: string) => ChangeContract | null
  listReceipts?: (filter: {
    conversationId?: string
    contractId?: string
    workspacePath?: string
    limit?: number
  }) => ProofReceiptRecord[]
  listToolCalls?: (conversationId: string, limit?: number) => LampreyToolCall[]
  runGit?: (args: string[], cwd: string) => Promise<GitResult>
}

function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function truncateText(text: string, cap: number): { text: string; truncated: boolean } {
  if (text.length <= cap) return { text, truncated: false }
  return {
    text: text.slice(0, Math.max(0, cap - 28)) + '\n[truncated in review packet]',
    truncated: true
  }
}

function contractSummary(contract: ChangeContract | null): ReviewContractSummary | null {
  if (!contract) return null
  return {
    id: contract.id,
    status: contract.status,
    goal: contract.goal,
    acceptanceCriteria: contract.acceptanceCriteria,
    expectedFiles: contract.expectedFiles,
    nonGoals: contract.nonGoals,
    verificationCommands: contract.verificationCommands,
    requiredReceiptKinds: contract.requiredReceiptKinds
  }
}

function receiptSummary(receipt: ProofReceiptRecord): ReviewReceiptSummary {
  return {
    id: receipt.id,
    kind: receipt.kind,
    status: receipt.status,
    command: receipt.command,
    commandHash: receipt.commandHash,
    finishedAt: receipt.finishedAt,
    durationMs: receipt.durationMs,
    exitCode: receipt.exitCode,
    contractId: receipt.contractId,
    correlationId: receipt.correlationId,
    parsedMetrics: receipt.parsedMetrics
  }
}

function toolSummary(call: LampreyToolCall): ReviewToolCallSummary {
  return {
    id: call.id,
    toolId: call.toolId,
    name: call.name,
    status: call.status,
    startedAt: call.startedAt,
    finishedAt: call.finishedAt,
    durationMs: call.durationMs,
    parentCallId: call.parentCallId,
    error: call.error ? truncateText(call.error, 500).text : undefined
  }
}

export function parseNameStatus(output: string): Array<{ status: string; path: string }> {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/)
      return { status: status || '?', path: rest.join(' ') }
    })
    .filter((entry) => entry.path.length > 0)
}

export function extractDiffSnippets(diff: string): ReviewDiffSnippet[] {
  const snippets: ReviewDiffSnippet[] = []
  let file = ''
  let current: { header: string; lines: string[] } | null = null

  function flush(): void {
    if (!current || !file) return
    const raw = current.lines.join('\n')
    const capped = truncateText(raw, SNIPPET_CAP_CHARS)
    snippets.push({
      file,
      header: current.header,
      snippet: capped.text,
      truncated: capped.truncated
    })
  }

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      flush()
      current = null
      const match = line.match(/\sb\/(.+)$/)
      file = match?.[1] ?? file
      continue
    }
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length)
      continue
    }
    if (line.startsWith('@@')) {
      flush()
      current = { header: line, lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()
  return snippets
}

async function safeGit(
  deps: ReviewEvidencePacketDeps,
  workspacePath: string,
  args: string[]
): Promise<GitResult> {
  const runner = deps.runGit ?? runGit
  try {
    return await runner(args, workspacePath)
  } catch (err: any) {
    return { stdout: '', stderr: err?.message ?? String(err), code: -1 }
  }
}

function staleGreenWarnings(
  receipts: ReviewReceiptSummary[],
  toolCalls: ReviewToolCallSummary[]
): string[] {
  const lastMutationAt = toolCalls
    .filter((call) => call.status !== 'denied')
    .reduce((max, call) => Math.max(max, call.finishedAt ?? call.startedAt), 0)
  if (lastMutationAt === 0) return []
  return receipts
    .filter((receipt) => receipt.status === 'passed' && receipt.finishedAt < lastMutationAt)
    .map(
      (receipt) =>
        `Receipt ${receipt.id} passed before the latest recorded tool mutation (${receipt.command}).`
    )
}

function enforcePacketCap(packet: ReviewEvidencePacket, capBytes: number): ReviewEvidencePacket {
  if (bytesOf(packet) <= capBytes) return packet
  const next: ReviewEvidencePacket = {
    ...packet,
    omissions: [...packet.omissions, `packet exceeded ${capBytes} bytes; trimmed diff snippets`],
    git: { ...packet.git, snippets: packet.git.snippets.slice(0, 8) }
  }
  while (bytesOf(next) > capBytes && next.git.snippets.length > 0) {
    next.git.snippets.pop()
  }
  if (bytesOf(next) <= capBytes) return next
  next.toolCalls = next.toolCalls.slice(0, 40)
  next.omissions.push('trimmed tool call list to fit packet cap')
  if (bytesOf(next) <= capBytes) return next
  next.proof = { ...next.proof, receipts: next.proof.receipts.slice(0, 20) }
  next.omissions.push('trimmed receipt list to fit packet cap')
  if (bytesOf(next) <= capBytes) return next
  delete next.builderNarrative
  next.omissions.push('removed builder narrative to fit packet cap')
  return next
}

export async function buildReviewEvidencePacket(
  input: BuildReviewEvidencePacketInput
): Promise<ReviewEvidencePacket> {
  const omissions: string[] = []
  const deps = input.deps ?? {}
  const capBytes =
    typeof input.capBytes === 'number' && Number.isFinite(input.capBytes) && input.capBytes > 0
      ? Math.min(Math.floor(input.capBytes), REVIEW_EVIDENCE_PACKET_CAP_BYTES)
      : REVIEW_EVIDENCE_PACKET_CAP_BYTES

  const getContract = deps.getActiveContract ?? getActiveChangeContract
  let contract: ChangeContract | null = null
  try {
    contract = getContract(input.conversationId, input.correlationId)
  } catch (err: any) {
    omissions.push(`active contract unavailable: ${err?.message ?? String(err)}`)
  }

  let receipts: ReviewReceiptSummary[] = []
  try {
    const listReceipts = deps.listReceipts ?? listProofReceipts
    receipts = listReceipts({
      conversationId: input.conversationId,
      contractId: contract?.id,
      workspacePath: input.workspacePath,
      limit: 50
    }).map(receiptSummary)
  } catch (err: any) {
    omissions.push(`proof receipts unavailable: ${err?.message ?? String(err)}`)
  }

  let toolCalls: ReviewToolCallSummary[] = []
  try {
    const listTools = deps.listToolCalls ?? listToolCallsForConversation
    toolCalls = listTools(input.conversationId, 120)
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt)
      .map(toolSummary)
  } catch (err: any) {
    omissions.push(`tool call metadata unavailable: ${err?.message ?? String(err)}`)
  }

  const nameStatus = await safeGit(deps, input.workspacePath, ['diff', '--name-status', 'HEAD', '--'])
  const diff = await safeGit(deps, input.workspacePath, ['diff', '--unified=3', 'HEAD', '--'])
  const gitError =
    nameStatus.code !== 0
      ? nameStatus.stderr.trim() || 'git diff --name-status failed'
      : diff.code !== 0
        ? diff.stderr.trim() || 'git diff failed'
        : undefined
  if (gitError) omissions.push(`git evidence unavailable: ${gitError}`)
  const diffSummary = truncateText(diff.stdout, DIFF_CAP_CHARS)
  if (diffSummary.truncated) omissions.push('git diff summary truncated')

  const failedCommands = receipts
    .filter((receipt) => receipt.status === 'failed')
    .map((receipt) => receipt.command)
  const skippedCommands = receipts
    .filter((receipt) => receipt.status === 'skipped')
    .map((receipt) => receipt.command)

  const packet: ReviewEvidencePacket = {
    kind: 'review_evidence_packet',
    version: 1,
    conversationId: input.conversationId,
    correlationId: input.correlationId,
    workspacePath: input.workspacePath,
    generatedAt: deps.now?.() ?? Date.now(),
    userGoal: input.userGoal,
    contract: contractSummary(contract),
    git: {
      changedFiles: parseNameStatus(nameStatus.stdout),
      diffSummary: diffSummary.text,
      snippets: extractDiffSnippets(diff.stdout),
      error: gitError
    },
    proof: {
      receipts,
      failedCommands,
      skippedCommands,
      staleGreenWarnings: staleGreenWarnings(receipts, toolCalls)
    },
    toolCalls,
    omissions
  }

  if (input.builderNarrative) {
    packet.builderNarrative = truncateText(input.builderNarrative, 4096).text
  }

  return enforcePacketCap(packet, capBytes)
}
