import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { TURN_CONTROL_SCHEMA_SQL } from './turn-control-schema'
import {
  TurnControlStore,
  assertFollowUpTransition,
  parseTurnInput,
  serializeTurnInput
} from './turn-control-store'
import type {
  ClientUserMessageId,
  FollowUpId,
  FollowUpSubmission,
  TurnId
} from './turn-control-types'

const HAS_NATIVE_SQLITE = (() => {
  try {
    const probe = new BetterSqlite3(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

function submission(
  deliveryMode: 'steer' | 'queue',
  text: string,
  clientUserMessageId?: string
): FollowUpSubmission {
  return {
    conversationId: 'conversation-1',
    deliveryMode,
    input: [{ type: 'text', text }],
    ...(deliveryMode === 'steer' ? { expectedTurnId: 'turn-1' as TurnId } : {}),
    ...(clientUserMessageId
      ? { clientUserMessageId: clientUserMessageId as ClientUserMessageId }
      : {}),
    actor: 'user'
  }
}

describe.skipIf(!HAS_NATIVE_SQLITE)('TurnControlStore (native SQLite)', () => {
  let db: Database
  let store: TurnControlStore

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE conversations (id TEXT PRIMARY KEY);
      INSERT INTO conversations (id) VALUES ('conversation-1');
      ${TURN_CONTROL_SCHEMA_SQL}
    `)
    store = new TurnControlStore(db)
  })

  afterEach(() => db.close())

  it('round-trips a running turn and settles it exactly once', () => {
    const turn = store.createTurn({
      id: 'turn-1' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      correlationId: 'correlation-1',
      startedAt: 10
    })
    expect(store.getActiveTurn('conversation-1')).toEqual(turn)
    expect(store.settleTurn('turn-1', 'completed', 20)).toBe(true)
    expect(store.settleTurn('turn-1', 'failed', 30)).toBe(false)
    expect(store.getTurn('turn-1')?.status).toBe('completed')
  })

  it('enforces one running turn per conversation', () => {
    store.createTurn({
      id: 'turn-1' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      startedAt: 1
    })
    expect(() =>
      store.createTurn({
        id: 'turn-2' as TurnId,
        conversationId: 'conversation-1',
        kind: 'regular',
        startedAt: 2
      })
    ).toThrow()
  })

  it('deduplicates client-message retries to the original row', () => {
    store.createTurn({
      id: 'turn-1' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      startedAt: 1
    })
    const first = store.createFollowUp({
      id: 'follow-up-1' as FollowUpId,
      submission: submission('steer', 'first', 'client-1'),
      createdAt: 2
    })
    const retry = store.createFollowUp({
      id: 'follow-up-2' as FollowUpId,
      submission: submission('steer', 'different retry body', 'client-1'),
      createdAt: 3
    })
    expect(first.duplicate).toBe(false)
    expect(retry.duplicate).toBe(true)
    expect(retry.record.id).toBe('follow-up-1')
    expect(store.listFollowUps('conversation-1')).toHaveLength(1)
  })

  it('assigns deterministic queue positions and reorders atomically', () => {
    for (const [index, text] of ['A', 'B', 'C'].entries()) {
      store.createFollowUp({
        id: `q${index}` as FollowUpId,
        submission: submission('queue', text),
        createdAt: index + 1
      })
    }
    const reordered = store.reorderQueuedFollowUps('conversation-1', ['q2', 'q0', 'q1'], 10)
    expect(reordered.map((row) => [row.id, row.position])).toEqual([
      ['q2', 0],
      ['q0', 1],
      ['q1', 2]
    ])
    expect(() => store.reorderQueuedFollowUps('conversation-1', ['q2', 'q0'], 11)).toThrow(
      /every queued follow-up exactly once/
    )
  })

  it('edits queued and recovered drafts but not delivered input', () => {
    store.createFollowUp({
      id: 'q1' as FollowUpId,
      submission: submission('queue', 'before'),
      createdAt: 1
    })
    expect(store.updateFollowUpInput('q1', [{ type: 'text', text: 'after' }], 2).input).toEqual([
      { type: 'text', text: 'after' }
    ])
    store.createTurn({
      id: 'turn-next' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      startedAt: 3
    })
    store.transitionFollowUp('q1', 'delivered', 3, { turnId: 'turn-next' as TurnId })
    expect(() => store.updateFollowUpInput('q1', [{ type: 'text', text: 'too late' }], 4)).toThrow(
      /not editable/
    )
  })

  it('enforces the follow-up state machine and required terminal details', () => {
    expect(() => assertFollowUpTransition('delivered', 'queued')).toThrow(/invalid.*transition/)
    store.createTurn({
      id: 'turn-1' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      startedAt: 1
    })
    store.createFollowUp({
      id: 's1' as FollowUpId,
      submission: submission('steer', 'x'),
      createdAt: 2
    })
    expect(() => store.transitionFollowUp('s1', 'rejected', 3)).toThrow(/rejectionReason/)
    const rejected = store.transitionFollowUp('s1', 'rejected', 3, {
      rejectionReason: 'turnMismatch',
      rejectionMessage: 'stale'
    })
    expect(rejected.status).toBe('rejected')
    expect(rejected.rejectionReason).toBe('turnMismatch')
    expect(rejected.finalizedAt).toBe(3)
  })

  it('recovers orphaned turns and accepted steers while preserving Queue order', () => {
    store.createTurn({
      id: 'turn-1' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      startedAt: 1
    })
    store.createFollowUp({
      id: 's1' as FollowUpId,
      submission: submission('steer', 'steer'),
      createdAt: 2
    })
    store.createFollowUp({
      id: 'q1' as FollowUpId,
      submission: submission('queue', 'queue'),
      createdAt: 3
    })
    expect(store.recoverOrphans(10, 'application restart')).toEqual({ turns: 1, followUps: 1 })
    expect(store.getTurn('turn-1')?.status).toBe('recovered')
    expect(store.getFollowUp('s1')?.status).toBe('recovered')
    expect(store.listQueuedFollowUps('conversation-1').map((row) => row.id)).toEqual(['q1'])
  })

  it('preserves input ordering through the versioned JSON envelope', () => {
    const input = [
      { type: 'text', text: 'A' } as const,
      { type: 'image', imageUrl: 'data:image/png;base64,AA==' } as const,
      { type: 'localImage', path: 'C:\\workspace\\x.png' } as const
    ]
    const serialized = serializeTurnInput(input)
    expect(JSON.parse(serialized).version).toBe(1)
    expect(parseTurnInput(serialized)).toEqual(input)
    expect(() => parseTurnInput('{"version":2,"items":[]}')).toThrow(/unsupported.*version/)
  })

  it('cascades ledger rows when the conversation is deleted', () => {
    store.createTurn({
      id: 'turn-1' as TurnId,
      conversationId: 'conversation-1',
      kind: 'regular',
      startedAt: 1
    })
    store.createFollowUp({
      id: 's1' as FollowUpId,
      submission: submission('steer', 'x'),
      createdAt: 2
    })
    db.prepare('DELETE FROM conversations WHERE id = ?').run('conversation-1')
    expect(store.listTurns('conversation-1')).toEqual([])
    expect(store.listFollowUps('conversation-1')).toEqual([])
  })
})
