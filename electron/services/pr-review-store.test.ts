import { beforeEach, describe, expect, it, vi } from 'vitest'

const receipts = new Map<string, { status: 'pending' | 'done'; result_json: string | null }>()

vi.mock('./database', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: (key: string) => receipts.get(key),
      run: (...args: unknown[]) => {
        if (sql.includes('INSERT INTO pr_review_action_receipts')) {
          receipts.set(String(args[0]), { status: 'pending', result_json: null })
        } else if (sql.includes('UPDATE pr_review_action_receipts')) {
          receipts.set(String(args[2]), { status: 'done', result_json: String(args[0]) })
        } else if (sql.includes('DELETE FROM pr_review_action_receipts')) {
          receipts.delete(String(args[0]))
        }
        return { changes: 1 }
      }
    })
  })
}))

import { runIdempotentReviewAction } from './pr-review-store'

describe('PR-3 review idempotency', () => {
  beforeEach(() => receipts.clear())

  it('executes once and replays the durable result', async () => {
    const action = vi.fn(async () => ({ id: 7 }))
    const first = await runIdempotentReviewAction('review:key:123', 'octo/repo#7', action)
    const second = await runIdempotentReviewAction('review:key:123', 'octo/repo#7', action)
    expect(first).toEqual({ replayed: false, result: { id: 7 } })
    expect(second).toEqual({ replayed: true, result: { id: 7 } })
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('clears a failed reservation so an explicit retry can proceed', async () => {
    await expect(runIdempotentReviewAction('review:key:456', 'octo/repo#7', async () => {
      throw new Error('network down')
    })).rejects.toThrow(/network down/)
    expect(receipts.has('review:key:456')).toBe(false)
    await expect(runIdempotentReviewAction('review:key:456', 'octo/repo#7', async () => 'ok'))
      .resolves.toEqual({ replayed: false, result: 'ok' })
  })

  it('fails closed while an identical action is pending', async () => {
    receipts.set('review:key:789', { status: 'pending', result_json: null })
    await expect(runIdempotentReviewAction('review:key:789', 'octo/repo#7', async () => 'no'))
      .rejects.toThrow(/still pending/)
  })
})
