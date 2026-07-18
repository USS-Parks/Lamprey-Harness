import type { Database } from 'better-sqlite3'

export const PR_REVIEW_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS pr_review_findings (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    path TEXT,
    line INTEGER,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('detached','attached','dismissed')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pr_review_findings_conversation
    ON pr_review_findings(conversation_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS pr_review_action_receipts (
    idempotency_key TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','done')),
    result_json TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
`

export function applyPrReviewSchema(db: Database): void {
  db.exec(PR_REVIEW_SCHEMA_SQL)
}
