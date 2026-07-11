// Agentic Orchestration Phase AO-2 — the agent_identities DDL, as a standalone
// constant with NO imports so it can be shared by:
//   1. migration v19 (db-migrations.ts) — the production schema, and
//   2. agent-identity-db-integration.test.ts — a node:sqlite run of the EXACT
//      same DDL (node:sqlite is built into Node, so it loads under vitest's ABI
//      where the Electron-built better-sqlite3 cannot — this test never skips).
// One place = the test can't drift from production (the LOOP_SCHEMA_SQL pattern).
//
// An identity is the blog's "agent that mints its own service account": a
// forked agent's request for access, the user's per-tool approve/refuse
// decisions, its budget ceilings, and its running spend — one auditable actor.

export const AGENT_IDENTITY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS agent_identities (
    id               TEXT PRIMARY KEY,
    label            TEXT NOT NULL,
    agent_type       TEXT NOT NULL,
    scope_kind       TEXT NOT NULL CHECK(scope_kind IN ('conversation','loop','workflow','outcome')),
    scope_id         TEXT,
    requested_tools  TEXT NOT NULL DEFAULT '[]',
    granted_tools    TEXT NOT NULL DEFAULT '[]',
    status           TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','revoked')),
    tokens_ceiling   INTEGER NOT NULL DEFAULT 0,
    wall_ms_ceiling  INTEGER NOT NULL DEFAULT 0,
    tokens_spent     INTEGER NOT NULL DEFAULT 0,
    wall_ms_spent    INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL,
    revoked_at       INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_agent_identities_scope
    ON agent_identities(scope_kind, scope_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_identities_status
    ON agent_identities(status, created_at DESC);
`
