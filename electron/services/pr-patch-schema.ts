import type { Database } from 'better-sqlite3'

export const PR_PATCH_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS pr_patch_proposals (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    patch TEXT NOT NULL,
    rationale TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','conflict','error')),
    result TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pr_patch_proposals_conversation
    ON pr_patch_proposals(conversation_id, created_at DESC);
`

export function applyPrPatchSchema(db: Database): void {
  db.exec(PR_PATCH_SCHEMA_SQL)
}
