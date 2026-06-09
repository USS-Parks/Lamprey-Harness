import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { FailureLedgerRecord, FailureLedgerKind } from './failure-ledger'
import type { ProofReceiptRecord } from './proof-receipts'

// We test generateRecommendations in isolation by mocking its data sources.
// The function is pure logic on top of ledger/receipt queries; no DB needed.
let mockFailures: FailureLedgerRecord[]
let mockReceipts: ProofReceiptRecord[]

function makeFailure(overrides: Partial<FailureLedgerRecord> & { id: string; kind: FailureLedgerKind }): FailureLedgerRecord {
  return {
    fingerprint: `fp_${overrides.id}`,
    command: undefined as string | undefined,
    diffHash: undefined as string | undefined,
    receiptId: undefined as string | undefined,
    contractId: undefined as string | undefined,
    eventId: undefined as string | undefined,
    conversationId: undefined as string | undefined,
    correlationId: undefined as string | undefined,
    message: 'test',
    count: 1,
    replaySeed: {},
    firstSeenAt: 1,
    lastSeenAt: 2,
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  }
}

function makeReceipt(overrides: Partial<ProofReceiptRecord> & { id: string }): ProofReceiptRecord {
  return {
    kind: 'verify',
    status: 'skipped',
    workspacePath: '/repo',
    cwd: '/repo',
    gitDirty: false,
    command: 'echo ok',
    commandHash: 'hash',
    startedAt: 1,
    finishedAt: 2,
    durationMs: 1000,
    timedOut: false,
    stdoutHash: 'sh',
    stderrHash: 'eh',
    stdoutPreview: '',
    stderrPreview: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutBytes: 0,
    stderrBytes: 0,
    parsedMetrics: {},
    createdBy: 'system',
    createdAt: 1,
    ...overrides
  }
}

// Mock the data-source modules
vi.mock('./failure-ledger', () => ({
  listFailures: vi.fn((_filter?: unknown, _db?: Database): FailureLedgerRecord[] => mockFailures),
  recordFailure: vi.fn(),
  handleProofEvent: vi.fn()
}))

vi.mock('./proof-receipts', () => ({
  listProofReceipts: vi.fn((_filter?: unknown, _db?: Database): ProofReceiptRecord[] => mockReceipts)
}))

// Dynamic import to get the mocked version
let generateRecommendations: typeof import('./harness-recommendations').generateRecommendations

beforeEach(async () => {
  mockFailures = []
  mockReceipts = []
  const mod = await import('./harness-recommendations')
  generateRecommendations = mod.generateRecommendations
})

describe('generateRecommendations', () => {
  it('returns empty when no failures or receipts', () => {
    const recs = generateRecommendations()
    expect(recs).toHaveLength(0)
  })

  it('emits missing_verification when repeated proof_failed exist', () => {
    mockFailures = [
      makeFailure({ id: 'f1', kind: 'proof_failed', command: 'npm test' }),
      makeFailure({ id: 'f2', kind: 'proof_failed', command: 'npm test' }),
      makeFailure({ id: 'f3', kind: 'proof_failed', command: 'npm test' })
    ]

    const recs = generateRecommendations()
    const mv = recs.find((r) => r.kind === 'missing_verification')
    expect(mv).toBeDefined()
    expect(mv!.severity).toBe('warning')
    expect(mv!.evidence).toHaveLength(3)
  })

  it('does not emit missing_verification below threshold', () => {
    mockFailures = [
      makeFailure({ id: 'f1', kind: 'proof_failed', command: 'npm test' }),
      makeFailure({ id: 'f2', kind: 'proof_failed', command: 'npm test' })
    ]

    const recs = generateRecommendations()
    expect(recs.find((r) => r.kind === 'missing_verification')).toBeUndefined()
  })

  it('emits repeated_skip when skipped receipts accumulate', () => {
    mockReceipts = [
      makeReceipt({ id: 'r1', status: 'skipped', command: 'npm run lint' }),
      makeReceipt({ id: 'r2', status: 'skipped', command: 'npm run lint' }),
      makeReceipt({ id: 'r3', status: 'skipped', command: 'npx tsc' })
    ]

    const recs = generateRecommendations()
    const rs = recs.find((r) => r.kind === 'repeated_skip')
    expect(rs).toBeDefined()
    expect(rs!.severity).toBe('warning')
  })

  it('emits noisy_command when receipts have large output', () => {
    mockReceipts = [
      makeReceipt({ id: 'r1', status: 'passed', command: 'npm run build', stderrBytes: 5000 }),
      makeReceipt({ id: 'r2', status: 'passed', command: 'npm run build', stdoutBytes: 20000 })
    ]

    const recs = generateRecommendations()
    const nc = recs.find((r) => r.kind === 'noisy_command')
    expect(nc).toBeDefined()
    expect(nc!.severity).toBe('info')
  })

  it('emits reviewer_blindspot when review_invalid failures repeat', () => {
    mockFailures = [
      makeFailure({ id: 'f1', kind: 'review_invalid' }),
      makeFailure({ id: 'f2', kind: 'review_invalid' }),
      makeFailure({ id: 'f3', kind: 'review_invalid' })
    ]

    const recs = generateRecommendations()
    const rb = recs.find((r) => r.kind === 'reviewer_blindspot')
    expect(rb).toBeDefined()
    expect(rb!.severity).toBe('warning')
  })

  it('emits frequent_waiver when same contract waived multiple times', () => {
    mockFailures = [
      makeFailure({ id: 'f1', kind: 'gate_waived', contractId: 'ctr_x' }),
      makeFailure({ id: 'f2', kind: 'gate_waived', contractId: 'ctr_x' })
    ]

    const recs = generateRecommendations()
    const fw = recs.find((r) => r.kind === 'frequent_waiver')
    expect(fw).toBeDefined()
    expect(fw!.severity).toBe('info')
  })

  it('emits stale_green when stale_green_attempt failures repeat', () => {
    mockFailures = [
      makeFailure({ id: 'f1', kind: 'stale_green_attempt' }),
      makeFailure({ id: 'f2', kind: 'stale_green_attempt' }),
      makeFailure({ id: 'f3', kind: 'stale_green_attempt' })
    ]

    const recs = generateRecommendations()
    const sg = recs.find((r) => r.kind === 'stale_green')
    expect(sg).toBeDefined()
    expect(sg!.severity).toBe('warning')
  })

  it('each recommendation has unique id, evidence, and suggestion', () => {
    mockFailures = [
      makeFailure({ id: 'fa', kind: 'proof_failed', command: 'npm test' }),
      makeFailure({ id: 'fb', kind: 'proof_failed', command: 'npm test' }),
      makeFailure({ id: 'fc', kind: 'proof_failed', command: 'npm test' }),
      makeFailure({ id: 'fd', kind: 'review_invalid' }),
      makeFailure({ id: 'fe', kind: 'review_invalid' }),
      makeFailure({ id: 'ff', kind: 'review_invalid' })
    ]

    const recs = generateRecommendations()
    for (const r of recs) {
      expect(r.id).toBeTruthy()
      expect(r.evidence.length).toBeGreaterThan(0)
      expect(r.suggestion.length).toBeGreaterThan(0)
    }
    // All ids unique
    const ids = recs.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
