interface BridgeSchemaDatabase {
  exec(sql: string): void
}

function safeAddColumn(db: BridgeSchemaDatabase, table: 'goals' | 'automations', ddl: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`)
  } catch (error) {
    if (!/duplicate column name/i.test(String(error instanceof Error ? error.message : error))) {
      throw error
    }
  }
}

export function applyGoalAutomationBridgeSchema(db: BridgeSchemaDatabase): void {
  safeAddColumn(db, 'goals', 'loop_id TEXT')
  safeAddColumn(db, 'goals', 'loop_max_iterations INTEGER')
  safeAddColumn(db, 'goals', 'loop_max_wallclock_ms INTEGER')
  safeAddColumn(db, 'goals', 'loop_token_budget INTEGER')

  safeAddColumn(db, 'automations', 'goal_id TEXT')
  safeAddColumn(db, 'automations', 'goal_conversation_id TEXT')
  safeAddColumn(db, 'automations', 'loop_max_iterations INTEGER')
  safeAddColumn(db, 'automations', 'loop_max_wallclock_ms INTEGER')
  safeAddColumn(db, 'automations', 'loop_token_budget INTEGER')

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_loop_owner
      ON goals(loop_id) WHERE loop_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_automations_goal
      ON automations(goal_conversation_id, goal_id) WHERE goal_id IS NOT NULL;
  `)
}
