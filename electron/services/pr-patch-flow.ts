import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, posix, relative, resolve, win32 } from 'path'
import { executeApplyPatch, parsePatch } from './apply-patch-tool'
import { loadPullRequestContext, StalePullRequestError } from './pr-chat-context'
import {
  createPrPatchProposal,
  getPrPatchProposal,
  setPrPatchStatus,
  updatePrPatchProposal
} from './pr-patch-store'

export function validatePrPatchPaths(patch: string, workspacePath?: string): string[] {
  const ops = parsePatch(patch)
  const root = resolve(workspacePath ?? process.cwd())
  return ops.map((op) => {
    if (posix.isAbsolute(op.path) || win32.isAbsolute(op.path)) {
      throw new Error(`patch path must be relative: ${op.path}`)
    }
    const target = resolve(root, op.path)
    const rel = relative(root, target)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`patch path escapes workspace: ${op.path}`)
    return target
  })
}

async function assertFresh(input: { conversationId: string; fullName: string; prNumber: number; headSha: string }) {
  return loadPullRequestContext({
    conversationId: input.conversationId, fullName: input.fullName,
    number: input.prNumber, expectedHeadSha: input.headSha, filePageSize: 1
  })
}

export async function proposePrPatch(input: {
  conversationId: string; fullName: string; prNumber: number; headSha: string;
  patch: string; rationale?: string | null; workspacePath?: string
}) {
  await assertFresh(input)
  validatePrPatchPaths(input.patch, input.workspacePath)
  return createPrPatchProposal({
    conversationId: input.conversationId, fullName: input.fullName, prNumber: input.prNumber,
    headSha: input.headSha, patch: input.patch, rationale: input.rationale ?? null
  })
}

export async function editPrPatch(input: {
  proposalId: string; patch: string; rationale?: string | null; workspacePath?: string
}) {
  const proposal = getPrPatchProposal(input.proposalId)
  if (!proposal || proposal.status !== 'pending') throw new Error('patch proposal is missing or no longer pending')
  await assertFresh(proposal)
  validatePrPatchPaths(input.patch, input.workspacePath)
  return updatePrPatchProposal(input.proposalId, input.patch, input.rationale)
}

export async function acceptPrPatch(input: {
  proposalId: string; workspacePath: string
}) {
  const proposal = getPrPatchProposal(input.proposalId)
  if (!proposal || proposal.status !== 'pending') throw new Error('patch proposal is missing or no longer pending')
  try {
    await assertFresh(proposal)
  } catch (error) {
    if (error instanceof StalePullRequestError) setPrPatchStatus(proposal.id, 'conflict', error.message)
    throw error
  }
  const paths = validatePrPatchPaths(proposal.patch, input.workspacePath)
  const snapshots = paths.map((path) => ({ path, existed: existsSync(path), body: existsSync(path) ? readFileSync(path) : null }))
  const applied = await executeApplyPatch({ patch: proposal.patch }, input.workspacePath)
  if (applied.result.startsWith('Error:')) {
    for (const snapshot of snapshots) {
      if (snapshot.existed && snapshot.body) {
        mkdirSync(dirname(snapshot.path), { recursive: true })
        writeFileSync(snapshot.path, snapshot.body)
      } else if (!snapshot.existed && existsSync(snapshot.path)) {
        unlinkSync(snapshot.path)
      }
    }
    setPrPatchStatus(proposal.id, 'error', applied.result)
    throw new Error(`patch application rolled back: ${applied.result.slice(7)}`)
  }
  return { proposal: setPrPatchStatus(proposal.id, 'accepted', applied.result), applied: applied.result }
}

export function rejectPrPatch(proposalId: string) {
  return setPrPatchStatus(proposalId, 'rejected', 'Rejected without workspace changes')
}
