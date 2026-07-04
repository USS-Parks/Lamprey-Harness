---
name: lamprey-database-and-persistence
description: The Lamprey data layer in depth — lamprey.db schema init and the migration ledger (v1–v18), the safe-migration checklist written in the shadow of the v0.9.2 crash, transactional guarantees, FTS5, the RAG store and sqlite-vec, retention sweeps, backups, and atomic JSON persistence. Load before touching schema-init.ts, db-migrations.ts, conversation-store.ts, rag/store.ts, or when investigating any data corruption/loss.
---

# Lamprey Database & Persistence

## When to use / when not

- **Use** for any schema change, migration, store-layer work, or data-loss investigation.
- **Don't use** for settings/keys file mechanics beyond a summary (deep catalog: `lamprey-config-and-flags`), or general triage (see `lamprey-debugging-playbook`).

## The layout

- **Engine**: better-sqlite3 (synchronous), `%APPDATA%\Lamprey\lamprey.db`, WAL mode, foreign keys ON.
- **Two-stage init** (historical shape, load-bearing): `initLegacySchema(db)` in `electron/services/schema-init.ts` runs segmented `CREATE TABLE IF NOT EXISTS` batches (core domain → legacy column adds → chapters/async_events → more legacy adds → GitHub/RAG/sessions_fts/snip), **then** `runMigrations(db)` in `electron/services/db-migrations.ts` applies the versioned ledger. The v0.9.2 crash happened precisely because a throw inside stage one made stage two unreachable — treat "init must complete" as sacred.
- **JSON side**: `settings.json` / `keys.json` via `electron/services/atomic-json.ts` — temp+rename writes; parse failures preserve the file as `<path>.corrupt-<timestamp>` and never heal to `{}` (JM-13).

## The migration ledger (verified 2026-07-02; versions are sparse by design)

`MIGRATIONS` in `db-migrations.ts` contains **v1, v2, 11, 12, 13, 14, 15, 16, 17, 18** — versions 3–10 were never used (that era's schema changes lived in the legacy segments). `LATEST_VERSION` is derived from the array. Downgrade guard: a DB with `user_version > LATEST_VERSION` refuses to open with a "did you downgrade Lamprey?" error.

| v | Added |
|---|---|
| 1 | baseline stamp + table validation (no DDL) |
| 2 | `rag_embedder_meta` (embedder + dimensions singleton) |
| 11 | fork lineage (`forked_from_id`, seed blob/kind) |
| 12 | `proof_receipts` |
| 13 | `change_contracts` |
| 14 | `failure_ledger` |
| 15 | project extensions (slug, description, updated_at, last_opened_at) |
| 16 | `messages.proof_status` |
| 17 | `loops`, `loop_backlog`, `loop_runs` |
| 18 | `loops.active_ms` (working-time ceiling accounting, JM-6) |

v12–14 and 16 belong to the deleted proof machinery — **the tables stay forever** so historical rows remain readable (a deliberate K2 decision). Don't drop them.

## Checklist: adding a migration (written in the shadow of v0.9.2)

1. Append `{ version: LATEST+1, up(db){…} }` to `MIGRATIONS`. Never renumber or edit shipped entries.
2. **No expressions in table-level PRIMARY KEY / UNIQUE constraints** — SQLite rejects them at CREATE time (`expressions prohibited in PRIMARY KEY and UNIQUE constraints`). Expression uniqueness goes in `CREATE UNIQUE INDEX`. If an upsert relies on it, the `ON CONFLICT` target must match the index expression byte-for-byte.
3. Column adds use the idempotent `safeAddColumn` pattern (checks pragma table_info first).
4. Each migration runs inside one transaction **including the version stamp** — a throw rolls back both. Keep `up()` free of side effects outside the db.
5. Write the test — and **confirm it runs**: prefer the node:sqlite pattern (`loop-db-integration.test.ts`: exact DDL + query shapes against `node:sqlite`, zero skip risk) over better-sqlite3-gated tests. If you must gate on `HAS_NATIVE_SQLITE`, run the file and verify it isn't skipping (`lamprey-validation-and-qa`).
6. Sanity-run the pair: fresh DB (init → migrate to latest) and an existing DB (idempotent re-run is a no-op).

## Transactional guarantees (v0.16.0 state)

- `saveMessage` + its FTS index write are transactional (JM-17) — a message can't exist unsearchable.
- `deleteConversation` is transactional and covers the orphan row families, including still-running loops.
- Compact/archival operations are transactional.
- `getDb()` never caches a partially-initialized handle (JM-16) — init completes or the next call retries.

## Persist-side hooks

- `sanitizePseudoTags` runs on every **assistant** save: shell-shaped pseudo-XML (`<bash>`, `<tool>`, `<output>`…) rewritten to fenced markdown; the verbatim original stored in `messages.content_raw` (NULL when nothing was rewritten). FTS indexes the sanitized text so search matches what the bubble shows.
- Reasoning persists on the message row (audit phase); the trace viewer and exports read it from here.

## FTS5

`memory_index_fts`, `rag_chunks_fts`, `sessions_fts` with sync triggers. Query tokens are quoted (JM-17) — raw user input into a MATCH expression is an injection/syntax hazard; use the store helpers.

## RAG store (`electron/services/rag/`)

- Embedder via `@huggingface/transformers` 4.x (migrated from @xenova in JM-28; 384-dim models — BGE-small default, MiniLM fallback). The embedder + dimensions are recorded in `rag_embedder_meta` (v2) so a model change is detectable.
- Chunks in `rag_chunks` (+FTS), vectors in a sqlite-vec `vec0` table; if the vec extension fails to load, retrieval falls back to keyword search (`isVecAvailable`).
- **rowid-reuse hazard (JM-15)**: vec rows are keyed by chunk rowid; `deleteCollection` must delete vec rows with the chunks, or SQLite's rowid reuse maps stale embeddings onto new chunks. Fixed — keep it fixed when touching deletion paths.
- Memory-fallback latch (JM-14): the store latches to in-memory mode only on true DB-unavailability, with 30s recovery probes — not on any transient error.
- Honest gap: a real ingest under the new embedder was still an owner first-install check at v0.16.0 ship.

## Retention & backups

- 90-day retention sweep over the five unbounded audit table families (JM-18).
- Backups in `userData/backups/` are encryption-aware and fail **loudly** (JM-18) — a silent backup failure is treated as worse than none.
- Spill files (`userData/tool-results/`) GC: age > 7 days, then oldest-first trim to 256 MB, at startup (deferred ~10s) and throttled during loop iterations.

## Inspection recipes (read-only)

```bash
# Never open the live DB read-write while the app runs. Read-only via Node ≥22 built-in sqlite:
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log('user_version=',db.prepare('PRAGMA user_version').get());" "%APPDATA%\Lamprey\lamprey.db"

node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});for(const r of db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all())console.log(r.name);" "%APPDATA%\Lamprey\lamprey.db"
```

Richer versions of these (health report, loop-state dump) ship as scripts in `lamprey-diagnostics-and-tooling`.

## Provenance and maintenance

Based on direct reads of `db-migrations.ts` (ledger versions verified 2026-07-02), `schema-init.ts`, `atomic-json.ts`, `conversation-store.ts`, `rag/store.ts` area, and the JM Track C DEVLOG entries, at v0.16.0.

Re-verify:
- Ledger: `grep -n "version:" electron/services/db-migrations.ts`
- Live schema version vs code: the PRAGMA one-liner above vs `LATEST_VERSION`
- Transactionality claims: `grep -n "transaction" electron/services/conversation-store.ts | head`
- Vec deletion coverage: `grep -n "vec" electron/services/rag/store.ts | head -20`
