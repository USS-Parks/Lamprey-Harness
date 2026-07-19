import { randomUUID } from 'crypto'
import { getDb } from './database'

export type PrPatchStatus = 'pending' | 'accepted' | 'rejected' | 'conflict' | 'error'
export interface PrPatchProposal {
  id: string; conversationId: string; fullName: string; prNumber: number; headSha: string
  patch: string; rationale: string | null; status: PrPatchStatus; result: string | null
  createdAt: number; updatedAt: number
}

type Row = {
  id: string; conversation_id: string; full_name: string; pr_number: number; head_sha: string
  patch: string; rationale: string | null; status: PrPatchStatus; result: string | null
  created_at: number; updated_at: number
}

function map(row: Row): PrPatchProposal {
  return {
    id: row.id, conversationId: row.conversation_id, fullName: row.full_name,
    prNumber: row.pr_number, headSha: row.head_sha, patch: row.patch,
    rationale: row.rationale, status: row.status, result: row.result,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function getPrPatchProposal(id: string): PrPatchProposal | null {
  const row = getDb().prepare('SELECT * FROM pr_patch_proposals WHERE id = ?').get(id) as Row | undefined
  return row ? map(row) : null
}

export function createPrPatchProposal(input: Omit<PrPatchProposal, 'id' | 'status' | 'result' | 'createdAt' | 'updatedAt'>) {
  const id = randomUUID()
  const now = Date.now()
  getDb().prepare(`INSERT INTO pr_patch_proposals (
    id, conversation_id, full_name, pr_number, head_sha, patch, rationale, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(
    id, input.conversationId, input.fullName, input.prNumber, input.headSha,
    input.patch, input.rationale, now, now
  )
  return getPrPatchProposal(id)!
}

export function updatePrPatchProposal(id: string, patch: string, rationale?: string | null) {
  const result = getDb().prepare(`UPDATE pr_patch_proposals SET patch = ?, rationale = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'`).run(patch, rationale ?? null, Date.now(), id)
  if (result.changes !== 1) throw new Error('patch proposal is missing or no longer pending')
  return getPrPatchProposal(id)!
}

export function setPrPatchStatus(id: string, status: Exclude<PrPatchStatus, 'pending'>, result?: string | null) {
  const changed = getDb().prepare(`UPDATE pr_patch_proposals SET status = ?, result = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'`).run(status, result ?? null, Date.now(), id)
  if (changed.changes !== 1) throw new Error('patch proposal is missing or no longer pending')
  return getPrPatchProposal(id)!
}
