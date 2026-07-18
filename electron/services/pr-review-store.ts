import { randomUUID } from 'crypto'
import { getDb } from './database'

export interface DetachedPrFindingInput {
  conversationId: string
  fullName: string
  prNumber: number
  headSha: string
  path?: string | null
  line?: number | null
  body: string
}

export function createDetachedPrFinding(input: DetachedPrFindingInput) {
  if (!input.body.trim()) throw new Error('finding body is required')
  const finding = {
    id: randomUUID(),
    ...input,
    path: input.path ?? null,
    line: input.line ?? null,
    status: 'detached' as const,
    createdAt: Date.now()
  }
  getDb()
    .prepare(`INSERT INTO pr_review_findings (
      id, conversation_id, full_name, pr_number, head_sha, path, line, body, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
    .run(
      finding.id, finding.conversationId, finding.fullName, finding.prNumber,
      finding.headSha, finding.path, finding.line, finding.body, finding.status, finding.createdAt
    )
  return finding
}

export async function runIdempotentReviewAction<T>(
  key: string,
  target: string,
  action: () => Promise<T>
): Promise<{ replayed: boolean; result: T }> {
  if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(key)) throw new Error('invalid idempotency key')
  const db = getDb()
  const existing = db.prepare(
    'SELECT status, result_json FROM pr_review_action_receipts WHERE idempotency_key = ?'
  ).get(key) as { status: 'pending' | 'done'; result_json: string | null } | undefined
  if (existing?.status === 'done' && existing.result_json) {
    return { replayed: true, result: JSON.parse(existing.result_json) as T }
  }
  if (existing) throw new Error('review action with this idempotency key is still pending')
  db.prepare(`INSERT INTO pr_review_action_receipts (
    idempotency_key, target, status, created_at
  ) VALUES (?, ?, 'pending', ?)`).run(key, target, Date.now())
  try {
    const result = await action()
    db.prepare(`UPDATE pr_review_action_receipts
      SET status = 'done', result_json = ?, completed_at = ? WHERE idempotency_key = ?`
    ).run(JSON.stringify(result), Date.now(), key)
    return { replayed: false, result }
  } catch (error) {
    db.prepare(`DELETE FROM pr_review_action_receipts
      WHERE idempotency_key = ? AND status = 'pending'`).run(key)
    throw error
  }
}
