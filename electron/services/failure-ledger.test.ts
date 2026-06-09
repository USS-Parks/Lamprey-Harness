import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { applyFailureLedgerSchema } from './failure-ledger-schema'
import {
  recordFailure,
  listFailures,
  getFailure,
  getFailureByFingerprint,
  handleProofEvent,
  generateReplaySeed,
  type FailureLedgerRecord
} from './failure-ledger'

const HAS_NATIVE_SQLITE: boolean = (() => {
  try {
    const probe = new BetterSqlite3(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

function makeDb(): Database {
  const db = new BetterSqlite3(':memory:')
  db.pragma('foreign_keys = ON')
  applyFailureLedgerSchema(db)
  return db
}

describe.skipIf(!HAS_NATIVE_SQLITE)('failure ledger', () => {
  let db: Database

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    db.close()
  })

  describe('recordFailure', () => {
    it('inserts a new failure row', () => {
      const rec = recordFailure({
        kind: 'proof_failed',
        command: 'npm test',
        message: 'Test suite failed with exit code 1'
      }, db)

      expect(rec.id).toBeTruthy()
      expect(rec.kind).toBe('proof_failed')
      expect(rec.command).toBe('npm test')
      expect(rec.message).toBe('Test suite failed with exit code 1')
      expect(rec.count).toBe(1)
      expect(rec.fingerprint).toBeTruthy()
      expect(rec.firstSeenAt).toBeGreaterThan(0)
      expect(rec.lastSeenAt).toEqual(rec.firstSeenAt)
    })

    it('derives a stable fingerprint from kind + command + contractId + diffHash', () => {
      const r1 = recordFailure({
        kind: 'proof_failed',
        command: 'npx tsc',
        contractId: 'c1',
        diffHash: 'abc123',
        message: 'tsc failed'
      }, db)
      const r2 = recordFailure({
        kind: 'proof_failed',
        command: 'npx tsc',
        contractId: 'c1',
        diffHash: 'abc123',
        message: 'tsc failed again'
      }, db)

      expect(r1.fingerprint).toBe(r2.fingerprint)
      expect(r2.count).toBe(2)
      expect(r2.lastSeenAt).toBeGreaterThan(r1.lastSeenAt)
    })

    it('increments count when the same fingerprint reoccurs', () => {
      const r1 = recordFailure({
        kind: 'command_failed',
        command: 'npm run build',
        message: 'build broke'
      }, db)

      const r2 = recordFailure({
        kind: 'command_failed',
        command: 'npm run build',
        message: 'build still broke'
      }, db)

      expect(r1.id).toBe(r2.id)
      expect(r2.count).toBe(2)
    })

    it('different kinds with same command produce different fingerprints', () => {
      const r1 = recordFailure({
        kind: 'proof_failed',
        command: 'npm test',
        message: 'test failed'
      }, db)
      const r2 = recordFailure({
        kind: 'command_failed',
        command: 'npm test',
        message: 'command failed'
      }, db)

      expect(r1.fingerprint).not.toBe(r2.fingerprint)
      expect(r1.count).toBe(1)
      expect(r2.count).toBe(1)
    })

    it('stores all linking fields', () => {
      const rec = recordFailure({
        kind: 'gate_waived',
        receiptId: 'prf_1',
        contractId: 'ctr_1',
        eventId: 'evt_1',
        conversationId: 'conv_1',
        correlationId: 'corr_1',
        command: 'npm run lint',
        diffHash: 'def456',
        message: 'Gate waived by user'
      }, db)

      expect(rec.receiptId).toBe('prf_1')
      expect(rec.contractId).toBe('ctr_1')
      expect(rec.eventId).toBe('evt_1')
      expect(rec.conversationId).toBe('conv_1')
      expect(rec.correlationId).toBe('corr_1')
      expect(rec.command).toBe('npm run lint')
      expect(rec.diffHash).toBe('def456')
    })

    it('updates message on repeat when non-empty', () => {
      const r1 = recordFailure({
        kind: 'review_invalid',
        message: 'Reviewer output failed validation',
        conversationId: 'conv_abc'
      }, db)

      const r2 = recordFailure({
        kind: 'review_invalid',
        message: 'Updated message',
        conversationId: 'conv_abc'
      }, db)

      // Should be same fingerprint (same kind, no command/contractId/diffHash)
      expect(r1.id).toBe(r2.id)
      expect(r2.message).toBe('Updated message')
      expect(r2.count).toBe(2)
    })
  })

  describe('listFailures', () => {
    function seed(): void {
      recordFailure({ kind: 'proof_failed', command: 'npx tsc', contractId: 'cA', conversationId: 'conv_x', message: 'tsc fail' }, db)
      recordFailure({ kind: 'proof_failed', command: 'npx tsc', contractId: 'cA', conversationId: 'conv_x', message: 'tsc fail again' }, db)
      recordFailure({ kind: 'gate_waived', contractId: 'cB', conversationId: 'conv_y', message: 'waiver' }, db)
      recordFailure({ kind: 'review_invalid', conversationId: 'conv_x', message: 'rubber stamp' }, db)
    }

    it('lists all failures sorted by last_seen_at desc', () => {
      seed()
      const results = listFailures(undefined, db)
      // dedup by fingerprint means we have 3 unique fingerprints
      expect(results.length).toBeGreaterThanOrEqual(3)
      // Most recent first
      if (results.length >= 2) {
        expect(results[0].lastSeenAt).toBeGreaterThanOrEqual(results[results.length - 1].lastSeenAt)
      }
    })

    it('filters by kind single value', () => {
      seed()
      const results = listFailures({ kind: 'proof_failed' }, db)
      expect(results.every((r) => r.kind === 'proof_failed')).toBe(true)
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('filters by kind array', () => {
      seed()
      const results = listFailures({ kind: ['proof_failed', 'gate_waived'] }, db)
      expect(results.every((r) => r.kind === 'proof_failed' || r.kind === 'gate_waived')).toBe(true)
      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('filters by contractId', () => {
      seed()
      const results = listFailures({ contractId: 'cA' }, db)
      expect(results.every((r) => r.contractId === 'cA')).toBe(true)
    })

    it('filters by conversationId', () => {
      seed()
      const results = listFailures({ conversationId: 'conv_y' }, db)
      expect(results.every((r) => r.conversationId === 'conv_y')).toBe(true)
    })

    it('respects limit', () => {
      seed()
      const results = listFailures({ limit: 1 }, db)
      expect(results.length).toBe(1)
    })

    it('supports ascending order', () => {
      seed()
      const results = listFailures({ order: 'asc', limit: 100 }, db)
      if (results.length >= 2) {
        expect(results[0].lastSeenAt).toBeLessThanOrEqual(results[results.length - 1].lastSeenAt)
      }
    })
  })

  describe('getFailure / getFailureByFingerprint', () => {
    it('gets by id', () => {
      recordFailure({
        id: 'fail_1',
        kind: 'proof_failed',
        command: 'npx vitest',
        message: 'test failure'
      }, db)

      const rec = getFailure('fail_1', db)
      expect(rec).not.toBeNull()
      expect(rec!.id).toBe('fail_1')
      expect(rec!.command).toBe('npx vitest')
    })

    it('returns null for unknown id', () => {
      expect(getFailure('nonexistent', db)).toBeNull()
    })

    it('gets by fingerprint', () => {
      recordFailure({
        id: 'fail_fp',
        kind: 'proof_failed',
        command: 'npx tsc',
        message: 'tsc failure'
      }, db)

      const byId = getFailure('fail_fp', db)!
      const byFp = getFailureByFingerprint(byId.fingerprint, db)
      expect(byFp).not.toBeNull()
      expect(byFp!.id).toBe('fail_fp')
    })
  })

  describe('handleProofEvent', () => {
    it('creates a ledger row for proof.receipt.failed events', () => {
      handleProofEvent({
        type: 'proof.receipt.failed',
        receiptId: 'prf_x',
        contractId: 'ctr_x',
        conversationId: 'conv_fail',
        correlationId: 'corr_fail',
        command: 'npm run lint',
        diffHash: 'hash1'
      }, db)

      const results = listFailures({ kind: 'proof_failed' }, db)
      expect(results).toHaveLength(1)
      const r = results[0]
      expect(r.receiptId).toBe('prf_x')
      expect(r.contractId).toBe('ctr_x')
      expect(r.command).toBe('npm run lint')
      expect(r.diffHash).toBe('hash1')
    })

    it('creates a ledger row for proof.gate.failed events', () => {
      handleProofEvent({
        type: 'proof.gate.failed',
        contractId: 'ctr_gf',
        conversationId: 'conv_gate',
        correlationId: 'corr_gate',
        message: 'no fresh proof'
      }, db)

      const results = listFailures({ contractId: 'ctr_gf' }, db)
      expect(results).toHaveLength(1)
      expect(results[0].message).toBe('no fresh proof')
    })

    it('creates a ledger row for proof.gate.waived events', () => {
      handleProofEvent({
        type: 'proof.gate.waived',
        contractId: 'ctr_gw',
        conversationId: 'conv_waive',
        message: 'user waived: exploratory work'
      }, db)

      const results = listFailures({ kind: 'gate_waived' }, db)
      expect(results).toHaveLength(1)
      expect(results[0].message).toBe('user waived: exploratory work')
    })

    it('does nothing for unrecognized event types', () => {
      const before = listFailures(undefined, db).length
      handleProofEvent({ type: 'proof.gate.passed' }, db)
      expect(listFailures(undefined, db).length).toBe(before)
    })
  })

  describe('generateReplaySeed', () => {
    it('returns stored replay seed plus derived fields', () => {
      const rec: FailureLedgerRecord = {
        id: 'fail_seed',
        fingerprint: 'fp1',
        kind: 'proof_failed',
        command: 'npm run build',
        diffHash: 'hash_build',
        message: 'Build failed',
        count: 1,
        replaySeed: { command: 'npm run build', expectedFailureParser: 'proof_failed' },
        firstSeenAt: 1,
        lastSeenAt: 2,
        createdAt: 1,
        updatedAt: 2
      }

      const seed = generateReplaySeed(rec)
      expect(seed.command).toBe('npm run build')
      expect(seed.expectedFailureParser).toBe('proof_failed')
    })

    it('falls back to record fields when seed is empty', () => {
      const rec: FailureLedgerRecord = {
        id: 'fail_seed2',
        fingerprint: 'fp2',
        kind: 'command_failed',
        command: 'npx eslint',
        diffHash: 'hash_eslint',
        message: 'lint error',
        count: 1,
        replaySeed: {},
        firstSeenAt: 1,
        lastSeenAt: 2,
        createdAt: 1,
        updatedAt: 2
      }

      const seed = generateReplaySeed(rec)
      expect(seed.command).toBe('npx eslint')
      expect(seed.expectedFailureParser).toBe('command_failed')
    })
  })
})
