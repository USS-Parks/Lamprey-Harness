// ST-2 — production DDL for the durable turn/follow-up ledger.
//
// This constant is shared by migration v21 and the node:sqlite integration
// suite so schema and query-shape coverage cannot drift from production.

export const TURN_CONTROL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS conversation_turns (
    id                  TEXT PRIMARY KEY,
    conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL CHECK(kind IN ('regular','review','manualCompaction','terminal')),
    status              TEXT NOT NULL CHECK(status IN ('running','completed','interrupted','cancelled','failed','recovered')),
    correlation_id      TEXT,
    active_agent_run_id TEXT,
    started_at          INTEGER NOT NULL,
    completed_at        INTEGER,
    recovery_reason     TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_turns_one_running
    ON conversation_turns(conversation_id)
    WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS idx_conversation_turns_history
    ON conversation_turns(conversation_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversation_turns_correlation
    ON conversation_turns(correlation_id);

  CREATE TABLE IF NOT EXISTS turn_followups (
    id                     TEXT PRIMARY KEY,
    conversation_id        TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    turn_id                 TEXT REFERENCES conversation_turns(id) ON DELETE SET NULL,
    expected_turn_id        TEXT,
    client_user_message_id  TEXT,
    delivery_mode           TEXT NOT NULL CHECK(delivery_mode IN ('steer','queue')),
    status                  TEXT NOT NULL CHECK(status IN ('accepted','queued','delivered','rejected','cancelled','recovered','deleted')),
    input_version           INTEGER NOT NULL DEFAULT 1 CHECK(input_version = 1),
    input_json              TEXT NOT NULL,
    position                INTEGER,
    actor                   TEXT NOT NULL CHECK(actor IN ('user','model','system')),
    source_conversation_id  TEXT,
    source_task_id          TEXT,
    target_agent_run_id     TEXT,
    rejection_reason       TEXT CHECK(rejection_reason IS NULL OR rejection_reason IN (
      'noActiveTurn','turnMismatch','nonSteerableTurn','turnNotRunning',
      'unsupportedInput','invalidInput','settingsOverride','duplicateClientMessage',
      'targetNotFound','targetNotSteerable','staleFollowUp','positionConflict'
    )),
    rejection_message      TEXT,
    recovery_reason        TEXT,
    created_at             INTEGER NOT NULL,
    updated_at             INTEGER NOT NULL,
    delivered_at           INTEGER,
    finalized_at           INTEGER,
    CHECK(
      (delivery_mode = 'steer' AND expected_turn_id IS NOT NULL AND position IS NULL)
      OR
      (delivery_mode = 'queue' AND expected_turn_id IS NULL AND position IS NOT NULL AND position >= 0)
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_turn_followups_client_dedupe
    ON turn_followups(conversation_id, client_user_message_id)
    WHERE client_user_message_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_turn_followups_queue_position
    ON turn_followups(conversation_id, position)
    WHERE delivery_mode = 'queue' AND status = 'queued';
  CREATE INDEX IF NOT EXISTS idx_turn_followups_queue
    ON turn_followups(conversation_id, status, position ASC);
  CREATE INDEX IF NOT EXISTS idx_turn_followups_turn
    ON turn_followups(turn_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_turn_followups_target_agent
    ON turn_followups(target_agent_run_id, status, created_at ASC);
`
