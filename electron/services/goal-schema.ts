interface GoalSchemaDatabase {
  exec(sql: string): void
  prepare(sql: string): {
    run(...args: unknown[]): unknown
  }
}

function safeAddColumn(db: GoalSchemaDatabase, ddl: string): void {
  try {
    db.exec(`ALTER TABLE goals ADD COLUMN ${ddl};`)
  } catch (error) {
    if (!/duplicate column name/i.test(String(error instanceof Error ? error.message : error))) {
      throw error
    }
  }
}

export function applyOperationalGoalSchema(db: GoalSchemaDatabase): void {
  safeAddColumn(
    db,
    "lifecycle_status TEXT NOT NULL DEFAULT 'open' CHECK(lifecycle_status IN ('open','active','paused','blocked','completed','aborted'))"
  )
  safeAddColumn(
    db,
    "last_actor TEXT NOT NULL DEFAULT 'system' CHECK(last_actor IN ('user','system','model'))"
  )
  safeAddColumn(db, 'token_budget INTEGER')
  safeAddColumn(db, 'token_used INTEGER NOT NULL DEFAULT 0')
  safeAddColumn(db, 'time_budget_ms INTEGER')
  safeAddColumn(db, 'elapsed_ms INTEGER NOT NULL DEFAULT 0')
  safeAddColumn(db, 'active_since INTEGER')
  safeAddColumn(db, 'paused_at INTEGER')
  safeAddColumn(db, 'completed_at INTEGER')
  safeAddColumn(db, 'aborted_at INTEGER')
  safeAddColumn(db, 'blocker TEXT')
  safeAddColumn(db, 'completion TEXT')
  safeAddColumn(db, 'transition_reason TEXT')

  db.exec(`
    UPDATE goals
       SET lifecycle_status = CASE status
         WHEN 'in_progress' THEN 'active'
         WHEN 'done' THEN 'completed'
         WHEN 'abandoned' THEN 'aborted'
         ELSE 'open'
       END,
       active_since = CASE WHEN status = 'in_progress' THEN updated_at ELSE active_since END,
       completed_at = CASE WHEN status = 'done' THEN updated_at ELSE completed_at END,
       aborted_at = CASE WHEN status = 'abandoned' THEN updated_at ELSE aborted_at END
     WHERE lifecycle_status = 'open'
       AND status <> 'open';

    CREATE INDEX IF NOT EXISTS idx_goals_lifecycle
      ON goals(conversation_id, lifecycle_status, updated_at DESC);
  `)
}
