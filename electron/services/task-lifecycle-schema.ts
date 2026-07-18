export const TASK_LIFECYCLE_SCHEMA_SQL = `
  ALTER TABLE conversations ADD COLUMN closed_at INTEGER;

  CREATE INDEX IF NOT EXISTS idx_conversations_closed
    ON conversations(closed_at);
`
