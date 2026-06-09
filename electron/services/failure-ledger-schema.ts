import type { Database } from 'better-sqlite3'

export function applyFailureLedgerSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS failure_ledger (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN (
        'proof_failed','command_failed','gate_waived',
        'review_invalid','stale_green_attempt','user_reported'
      )),
      receipt_id TEXT,
      contract_id TEXT,
      event_id TEXT,
      conversation_id TEXT,
      correlation_id TEXT,
      command TEXT,
      diff_hash TEXT,
      message TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      replay_seed_json TEXT NOT NULL DEFAULT '{}',
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_failure_ledger_fingerprint
      ON failure_ledger(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_failure_ledger_kind
      ON failure_ledger(kind, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_failure_ledger_receipt
      ON failure_ledger(receipt_id);
    CREATE INDEX IF NOT EXISTS idx_failure_ledger_contract
      ON failure_ledger(contract_id, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_failure_ledger_conversation
      ON failure_ledger(conversation_id, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_failure_ledger_correlation
      ON failure_ledger(correlation_id, last_seen_at DESC);
  `)
}
