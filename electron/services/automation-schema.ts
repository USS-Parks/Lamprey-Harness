interface AutomationSchemaDatabase {
  exec(sql: string): void
  prepare(sql: string): {
    all(...args: unknown[]): unknown[]
    run(...args: unknown[]): unknown
  }
}

export const AUTOMATION_RUN_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    trigger_key TEXT NOT NULL,
    trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('one_shot','schedule','event','monitor','manual')),
    scheduled_at INTEGER,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    attempt INTEGER NOT NULL CHECK(attempt >= 1),
    status TEXT NOT NULL CHECK(status IN ('running','completed','failed','interrupted')),
    result TEXT,
    error TEXT,
    UNIQUE(automation_id, trigger_key, attempt)
  );

  CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_started
    ON automation_runs(automation_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_automation_runs_status
    ON automation_runs(status, started_at);
`

function safeAddColumn(db: AutomationSchemaDatabase, ddl: string): void {
  try {
    db.exec(`ALTER TABLE automations ADD COLUMN ${ddl};`)
  } catch (error) {
    if (!/duplicate column name/i.test(String(error instanceof Error ? error.message : error))) {
      throw error
    }
  }
}

export function applyAutomationTriggerSchema(db: AutomationSchemaDatabase): void {
  safeAddColumn(
    db,
    "trigger_kind TEXT NOT NULL DEFAULT 'schedule' CHECK(trigger_kind IN ('one_shot','schedule','event','monitor'))"
  )
  safeAddColumn(db, "trigger_config_json TEXT NOT NULL DEFAULT '{}'")
  safeAddColumn(db, 'next_run_at INTEGER')
  safeAddColumn(db, 'last_trigger_key TEXT')
  safeAddColumn(db, 'retry_attempt INTEGER NOT NULL DEFAULT 0')
  safeAddColumn(db, 'retry_at INTEGER')
  safeAddColumn(db, 'disabled_reason TEXT')
  db.exec(AUTOMATION_RUN_SCHEMA_SQL)

  const rows = db.prepare(
    "SELECT id, cron FROM automations WHERE trigger_config_json = '{}' OR trigger_config_json IS NULL"
  ).all() as Array<{ id: string; cron: string }>
  const update = db.prepare(
    `UPDATE automations
       SET trigger_kind = 'schedule', trigger_config_json = ?
     WHERE id = ?`
  )
  for (const row of rows) {
    update.run(
      JSON.stringify({
        kind: 'schedule',
        cron: row.cron,
        maxAttempts: 3,
        retryDelaySeconds: 60
      }),
      row.id
    )
  }
}
