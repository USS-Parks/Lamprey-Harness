export const FORK_TURN_SCHEMA_SQL = `
  ALTER TABLE conversations ADD COLUMN forked_from_turn_id TEXT;

  CREATE INDEX IF NOT EXISTS idx_conversations_forked_from_turn
    ON conversations(forked_from_turn_id, created_at DESC);
`
