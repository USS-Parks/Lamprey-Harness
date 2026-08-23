# Lamprey Persistence & Seed Phase — Plan + Sequential Prompt Roster

**Author**: drafted 2026-06-06 in response to a new-user inspection of two surfaces:
1. "SQLite memory" — the persistence layer at `userData/lamprey.db`.
2. "Per-hunk chat seeding" — the UI promise made by the Fork button on every assistant bubble, the "Side chat" pill in the right panel, and the `conversation:fork` IPC.

The first is **mature with rough edges**: schema discipline is real, the event spine is honest, but the hygiene boundaries (WAL checkpointing, integrity-check, backup, busy-timeout, version ledger) are missing. The second is **a UI promise the code doesn't keep yet**: the Fork button is a no-op stub, Side-chat starts blank, and the IPC clones the whole conversation with no seed parameters.

This phase closes both gaps in one coordinated arc so the seed surface can rely on the persistence floor without race conditions or silent footguns. It also fixes the adjacent Pin-as-memory stub, because shipping one bubble-action without the other reads as half-finished.

Target ship: **v0.9.0**. Target branch (parent): `main`. Target branch (work): `feat/persistence-and-seed`. Tracks A and B may run in parallel worktrees per the established convention.

---

## §0 Working agreements

These apply to every prompt in §5.

### §0.1 Verify gate (mandatory per prompt)
1. **Both tsc configs pass**:
   - `npx tsc --noEmit -p tsconfig.node.json`
   - `npx tsc --noEmit -p tsconfig.web.json`
2. **Relevant unit tests pass** (vitest). New code lands with new tests; the verify gate names the new test file.
3. **Smoke check**: where the prompt touches a runtime surface (IPC, store, UI), the dev app starts cleanly via the `ELECTRON_EXEC_PATH` workaround in `CLAUDE.md` and the touched surface renders without console errors. UI prompts include a `preview_*` verification per `CLAUDE.md`'s preview_tools contract.
4. **No regression in adjacent verify gates** — running the previous prompt's verify gate still passes.

### §0.2 Commit discipline
One commit per prompt. Conventional-commit prefix matching the change shape (`feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`). The body names the prompt id (e.g. `PS3`) so `git log --oneline` is a roadmap. No co-author trailer in this project (per `feedback_no_coauthor_trailer.md`).

### §0.3 Push policy
The user is the reviewer + pusher. No autonomous pushes mid-phase. The wrap prompt (PS24) does ship — *that* is the user's explicit request to push.

### §0.4 Worktree discipline
Track A (PS1–PS10) and Track B (PS11–PS20) may run in parallel worktrees. Track C (PS21–PS24) waits for both. Coordinator at the top of each worktree session: re-read this plan's §0 + the track's prompt list, mark prompts `[x]` as they ship, never `[x]` without a green verify gate.

### §0.5 Devlog format (DEVLOG.md, append-only)
```
### YYYY-MM-DD — PSn: <one-line title>

**Goal**: <one line>
**Touch**: <files>
**Verify**: <tsc + tests + smoke command>
**Notes**: <2-5 lines; trade-offs, follow-ups, anything surprising>
```

### §0.6 Schema migration discipline
All schema work goes through the PS1 migration ledger once it ships. `safeAddColumn` stays for genuinely idempotent column adds; non-idempotent steps (data backfill, FTS rebuild, vec0 rebuild) gate on the new `schema_version` table. No prompt in this phase may introduce a non-idempotent migration without PS1 already merged.

### §0.7 Cross-track merge hotspots
- `electron/services/database.ts` — touched by PS1, PS6, PS7, PS11. Track A owns it during PS1–PS7; Track B may not touch it until PS6 is merged. PS11 lands on the partitioned schema PS6 produces.
- `electron/ipc/conversation.ts` — touched by PS12, PS13, PS14. Owned by Track B start-to-finish.
- `src/components/chat/MessageActions.tsx`, `MessageBubble.tsx` — touched by PS16, PS17, PS21. Track B + Track C handshake at PS21.
- `src/components/settings/` — PS10 adds a Persistence panel; PS20 adds a SeedBudget control; these go in distinct files so there's no overlap.

### §0.8 Reversibility checklist (per prompt)
Each prompt's commit message footer lists how to revert cleanly. For schema prompts this means "drop column X, drop table Y" — but per the architecture doc forward-additive rule we never *do* drop; the footer is purely documentation for an emergency.

---

## §1 Problem statement

### §1.1 Persistence (Track A)
A professional desktop coding harness shipping to regulated-industry users (Island Mountain's downstream targets include HIPAA / ITAR shops) must survive ungraceful shutdowns, antivirus scans, multi-process contention, and rare file-corruption events without data loss. Today:
- `closeDb()` exists but is wired only to a test hook — Electron's `before-quit` never runs it.
- WAL files grow unbounded on force-kill; no periodic checkpoint.
- `safeAddColumn` is a regex-guarded `ALTER TABLE` with no version ledger; a partial migration on a crashed launch is invisible.
- No `PRAGMA integrity_check` at startup; corruption is discovered only when a read fails.
- No backup. A single bad sector = full data loss.
- No `busy_timeout` pragma; the HX1-exempted headless CLI plus the GUI can race on writes and hit `SQLITE_BUSY` without retry.
- vec0 is pinned to 384 dimensions with no embedder-switch path; swapping to OpenAI's 1536-dim embedder requires an undocumented rebuild.
- The pipeline saves are not transactional across async boundaries; a crash mid-pipeline leaves orphan `stage='planner'` rows whose Coder/Reviewer companions never landed.
- All message bodies, reasoning traces, and tool args sit plaintext in `userData/`. For some downstream users this is a non-starter.

### §1.2 Seed surface (Track B)
The Fork button on every assistant bubble fires a `toast.info('Fork from this message — coming soon')` stub. The Side-chat panel opens a blank ephemeral conversation. The `conversation:fork` IPC exists but copies the *entire* message history with no `startIndex` / `endIndex` / `seedContent` / `includeRagAttachments` parameters. There is no lineage column, no workspace-re-anchor, no token-budget guard, no per-code-block extraction affordance. A user who sees the UI affordances reasonably concludes the feature works; clicking it returns a toast. That is the worst possible state for a professional product — surface promise without implementation.

### §1.3 Adjacent
The Pin-as-memory button next to Fork is also a no-op stub. Closing one without the other re-creates the same impression-vs-reality gap on the adjacent affordance. PS21 closes it.

---

## §2 Scope

### §2.1 In scope
- Schema-version ledger via `PRAGMA user_version`, replacing the implicit "forward-additive only" rule with an enforced one.
- WAL checkpointing on graceful shutdown + periodic checkpoint on a timer.
- `busy_timeout` pragma + retry helper for the rare multi-process write contention.
- `PRAGMA integrity_check` at startup with a recovery surface (banner + Settings action to restore from backup).
- Daily `db.backup()` snapshot with rolling retention and one-click restore.
- Partition the 700-line `initSchema` into per-domain `init*Schema(db)` functions matching the per-domain `*-store.ts` ownership pattern.
- vec0 dimension guard + embedder-switch rebuild path.
- Transaction-wrap each pipeline stage commit so a crash leaves no half-rows.
- Optional SQLCipher passphrase mode (`better-sqlite3-multiple-ciphers`) behind a Settings opt-in.
- Settings → **Persistence** panel exposing every above lever + live status (DB size, WAL size, last checkpoint, last backup, last integrity_check result, encryption mode).
- `conversation:fork` IPC parameter surface: `sourceConversationId`, `sourceMessageId?`, `seedKind` (`'none' | 'message' | 'block' | 'transcript-range' | 'custom'`), `seedContent?`, `seedBlobJson?`, `includeRagAttachments`, `workspaceMode` (`'inherit' | 'current' | 'none'`), `titleOverride?`.
- Schema columns: `conversations.forked_from_id`, `conversations.forked_from_message_id`, `conversations.seed_blob`, `conversations.seed_source_kind`.
- Seed channel — sentinel-prefixed first user turn (`<seed_context source="…">…</seed_context>`) visible in chat + parseable by prompt assembly.
- Workspace re-anchor on fork (no silent footgun).
- RAG attachment copy on fork.
- MessageActions.onFork → IPC wire (the Fork button now does what it promises).
- Per-code-block "Extract to side chat" chip on every rendered fenced ```code``` region.
- Side-chat panel accepts `seedMessageId` / `seedBlock` props.
- Forked-from chip + lineage walk in ConversationHeader.
- Token-budget guard with auto-attach-as-RAG fallback when seed > `SAFE_SEED_LENGTH` (default 8K chars).
- Pin-as-memory wiring (close the adjacent stub).
- Event-spine telemetry for both subsystems: `persistence.checkpoint`, `persistence.integrity`, `persistence.backup`, `persistence.recovery`, `conversation.forked`, `conversation.seed.attached`, `conversation.seed.truncated`.
- ARCHITECTURE/PERSISTENCE.md update reflecting the new floor.
- README "New in v0.9.0" paragraph + top-of-roadmap update (per `feedback_readme_is_part_of_ship`).
- Full ship arc via `pwsh scripts\bucket.ps1`.

### §2.2 Out of scope (explicit, deliberate)
- **Cross-conversation merge.** Forking is one-way; merging two forked conversations back together is a separate phase.
- **Inline-branch (Jupyter-cell) rendering.** Reasonable alternative; explicitly deferred to keep the chat column flat. Listed in §3.3 trade-offs.
- **Cloud sync / libSQL replication.** A nice-to-have but a different threat model and a different consent surface.
- **Encryption auto-rotation.** SQLCipher passphrase ships in PS9 as a one-shot setup; rotation is deferred.
- **Per-message selection-range seeding.** The browser `window.getSelection()` path is fragile across re-renders; PS17's per-code-block affordance is the deterministic substitute. A future range-seed prompt can land if the deterministic path proves insufficient.
- **DuckDB analytics attach.** Deferred. The snip dashboard + event timeline aggregations would benefit, but it's a separate read-side architecture choice, not a persistence-floor fix.
- **Per-conversation SQLite file split.** Considered (§3.5) and rejected for this phase.

### §2.3 Anti-goals
- **Do not** change the public shape of `events`, `messages`, or `conversations` row types as returned by `*-store.ts` `rowToX` converters. Additive columns only; the renderer-facing types either stay the same or gain optional fields.
- **Do not** retire the Fork button surface area; the affordance is good. Wire it.
- **Do not** introduce a second writer to any JSON file backend (per ARCHITECTURE/PERSISTENCE.md rule 2).
- **Do not** store credentials in SQLite (rule 3). The SQLCipher passphrase lives in the OS keychain via `keychain.ts`'s existing namespace.

---

## §3 Architecture decisions

### §3.1 Migration ledger (`PRAGMA user_version`)
Chosen over a dedicated `schema_versions` table because:
- It's a single integer SQLite maintains natively; zero migration overhead to introduce.
- `db.pragma('user_version')` reads + writes are atomic in WAL mode.
- The TypeScript migration registry (`MIGRATIONS: Migration[]` array, ordered by version) becomes the single source of truth; the ledger is just the marker.

A migration looks like:
```ts
interface Migration {
  version: number  // monotonic
  description: string
  up(db: Database): void  // idempotent OR gated by user_version
}
```

`runMigrations(db)` reads `user_version`, runs each newer migration in a single `db.transaction(() => {...})()`, writes the new `user_version` inside the same transaction. Crash mid-migration → rollback → next launch retries from the same `user_version`. This is the only mechanism by which we trust non-idempotent steps.

`safeAddColumn` stays for *idempotent* column adds inside migrations; it does not stand alone any more.

### §3.2 Recovery surface
`PRAGMA integrity_check` at every startup. On non-`ok` result:
- A non-dismissible banner in the renderer (separate from the existing notification chips) explaining "Database integrity issue detected. Backup found from <date>. Restore?"
- Settings → Persistence panel surfaces the same with a manual "Run integrity check now" button.
- Recovery moves the bad file to `lamprey.db.corrupt-<timestamp>` and copies the most recent good backup into place. Backup files live at `userData/backups/lamprey-<YYYY-MM-DD>.db`, 14-day rolling retention.
- An event row lands on every recovery path: `persistence.recovery`, severity `warning` or `error`.

### §3.3 Seed channel — sentinel-prefixed user turn (not a hidden system message)
Three candidates were considered:
1. **Hidden system message** — model treats seed as instruction, often summarizes it back.
2. **Plain user message with seed body** — model treats seed as the first user turn, may respond to the seed before the user types.
3. **Sentinel-prefixed user message** — the seed content is wrapped in `<seed_context source="…">…</seed_context>`, prepended to the user's first actual turn. Renderer shows it as a chip on the user bubble. Prompt-assembly hand-rolls a system note like "The user is starting from the following context:" but the seed text stays inside the user message.

**Chosen: 3.** It survives transcript exports honestly (the seed *is* user-supplied context, not a system instruction), composes with the existing E5 compression path without special-casing, and the renderer can render the chip without distorting the conversation shape. It also dovetails with PS22's `conversation.seed.attached` event payload schema.

### §3.4 Workspace re-anchor (no silent inherit)
Today's `conversation:fork` carries `worktree_path` from the source row. The fork might happen while the user is in a *different* active workspace. Three options:
1. Silently inherit the source workspace.
2. Silently switch to the current active workspace.
3. Make `workspaceMode` an explicit fork parameter (`'inherit' | 'current' | 'none'`).

**Chosen: 3.** The UI presents a dropdown defaulting to `'current'` (the safer assumption for a user who just clicked Fork inside their current workspace context). The IPC accepts all three so headless / CLI callers can be explicit. `'none'` is for forks that explicitly want no workspace binding (a research thread, e.g.).

### §3.5 Per-conversation SQLite split — rejected
Considered. Pros: deleting a conversation is `unlink()`; no FK-cascade footgun; small per-file size keeps each WAL bounded. Cons: cross-conversation FTS becomes a separately-maintained global index, the events spine fragments across files (or stays global but no longer references rows that live elsewhere), backup story multiplies. **Rejected** for this phase; the WAL checkpoint + busy_timeout + backup story addresses the same risks at lower architectural cost.

### §3.6 SQLCipher opt-in (not on by default)
`better-sqlite3-multiple-ciphers` is a drop-in binding. Cost: ~5% write overhead + a passphrase prompt at first launch. **Opt-in via Settings → Persistence → Encryption.** The passphrase is stored in the existing keychain (`encryption` provider key). Migration path: `ATTACH DATABASE 'lamprey-enc.db' AS enc KEY '<pass>'; SELECT sqlcipher_export('enc'); DETACH DATABASE enc;` then atomically swap. PS9 covers the path; PS10 surfaces the toggle.

### §3.7 Pipeline transactions
Today's `runMultiAgent` flow:
```
plannerResult = await chatStream(planner)   // async — cannot be in db.transaction
saveMessage(plannerRow)                     // sync, single statement
coderResult = await chatStream(coder)
saveMessage(coderRow)
```

A crash between the two `await`s leaves the planner row without its coder partner. The fix is per-stage wrapping: each `saveMessage` paired with its `message_stage_metrics` write goes inside a single `db.transaction(() => {})()`. That guarantees the row+metrics land together, never half — which is the smallest unit that matters. The cross-stage relationship is intrinsically not transactional (the awaits live between them), so we instead surface orphan stages explicitly: PS8 adds an `is_orphan_pipeline_stage` derived flag the Reasoning-Trace Viewer already half-renders.

### §3.8 Seed budget — auto-attach-as-RAG fallback (PS20)
Default `SAFE_SEED_LENGTH = 8192` characters. Above the threshold, instead of inlining as `<seed_context>`, the seed becomes a one-shot RAG document:
- New `rag_documents` row with `source_kind='paste'`, `display_name="Seed from <source_message_id>"`.
- Auto-attached to the new conversation via `conversation_rag_attachments`.
- An event row `conversation.seed.truncated` records the threshold trip.
- Renderer chip on the first user turn: "Seed attached as document (4,231 tokens)" instead of the inline `<seed_context>` chip.

This composes with the existing RAG retrieval — the model retrieves the seed naturally on the first turn instead of being force-fed it.

### §3.9 Telemetry shape
New event types added to `EVENT_TYPES` (per `event-log.ts`):
- `persistence.checkpoint` — on each WAL checkpoint, severity `info`. Payload: `{ walSizeBefore, walSizeAfter, reason }`.
- `persistence.integrity` — on each `PRAGMA integrity_check`, severity `info` (ok) / `error` (corrupt). Payload: `{ result, durationMs }`.
- `persistence.backup` — on each backup. Payload: `{ path, bytes, durationMs, reason }`.
- `persistence.recovery` — on each restore from backup. Payload: `{ fromPath, toPath, reason }`.
- `conversation.forked` — payload: `{ sourceConversationId, sourceMessageId, seedKind, seedBytes, workspaceMode, includeRagAttachments }`.
- `conversation.seed.attached` — payload: `{ conversationId, seedKind, seedBytes }`.
- `conversation.seed.truncated` — payload: `{ conversationId, seedKind, seedBytes, attachedDocumentId, threshold }`.

---

## §4 Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PRAGMA user_version migration in PS1 collides with existing live DBs | Medium | Medium | PS1's first migration is a no-op that reads existing `safeAddColumn`-applied schema, asserts it matches the post-migration state, and stamps `user_version = N`. Idempotent. |
| db.backup() locks DB long enough to stall a streaming reply | Low | Low | better-sqlite3 backup is page-by-page with explicit step size; PS5 uses 100 pages per step + a yield between steps. Streaming writes proceed. |
| SQLCipher binary not available on all Electron build targets | Medium | Low | PS9 is opt-in and gracefully falls back to plain better-sqlite3 if the cipher binding fails to load. Same pattern as `sqlite-vec`. |
| Workspace re-anchor on fork changes user's expected behavior | Medium | Medium | Default to `'current'`, surface the dropdown clearly, log every choice as `conversation.forked` event payload. Migration: existing forks pre-PS13 keep their inherited workspace. |
| Seed-as-RAG fallback at PS20 trips on tiny embedder corpora | Low | Medium | PS20 includes a budget setting (`safeSeedLength`); user can raise it. Also: PS20 detects "no embedder available" and falls back to inline-with-truncation (cap + ellipsis). |
| Pin-as-memory wiring at PS21 introduces a chapter-creation race with the existing `mark_chapter` tool | Low | Low | PS21 routes through the existing `chapters-store.ts`'s public API; no new write path. |
| Token-budget guard misjudges seed cost (chars ≠ tokens) | Medium | Low | PS20 uses the existing tokenizer estimator (the same one E5 uses) instead of char-count for the threshold check. |
| Multi-instance write contention not fully resolved by busy_timeout alone | Low | Medium | PS3 also adds a `withWriteRetry` helper for the rare `SQLITE_BUSY` that survives `busy_timeout`. Logged at `warning` severity so we see it. |
| Seed channel `<seed_context>` tag confuses the model | Low | Medium | The reviewer-guard `PSEUDO_TAG_GUARD` (HX2) already explicitly handles unknown XML-like tags as prose; we extend it to know about `<seed_context>` so it isn't mistakenly fenced. PS15 covers this. |
| Track A + Track B merge conflicts in `database.ts` | Medium | Low | §0.7 hotspot table + PS6 partitioning lands before PS11 ever writes a new table. |

---

## §5 Sequential Prompt Roster

### Track A — Persistence Hardening (PS1–PS10)

#### **PS1 — `PRAGMA user_version` migration ledger**
- **Goal**: introduce a typed migration registry, gated on `PRAGMA user_version`. The existing schema becomes "version 1"; every subsequent change is a `Migration` entry. `safeAddColumn` stays for idempotent column adds *inside* a migration.
- **Touch**: `electron/services/database.ts` (split `initSchema` so `runMigrations(db)` is callable after `loadSqliteVec`), new `electron/services/db-migrations.ts` with the typed `Migration[]` registry, new `electron/services/db-migrations.test.ts`.
- **Verify**: both tsc; new test covers (a) fresh DB → user_version stamped to N, (b) existing DB at user_version 0 → all migrations run, ends at N, (c) re-run is a no-op, (d) crash mid-migration via thrown error → transaction rollback → user_version unchanged.
- **Notes**: PS1 is foundational. Every later prompt that touches schema uses this. No data backfill in PS1; the first migration is purely a stamping step.

#### **PS2 — WAL checkpoint on graceful shutdown + periodic checkpoint**
- **Goal**: `db.pragma('wal_checkpoint(TRUNCATE)')` + `db.close()` on Electron's `before-quit`. Periodic checkpoint every 5 min via `setInterval` while the app is open.
- **Touch**: `electron/main.ts` (before-quit handler), `electron/services/database.ts` (export a `checkpoint()` helper + a `startPeriodicCheckpoint()` exported from `getDb` init).
- **Verify**: both tsc; new test in `database.test.ts` exercises `checkpoint()` against a populated DB and asserts the WAL file shrinks. Smoke: start app, write some messages, close cleanly, observe WAL truncated.
- **Notes**: emits `persistence.checkpoint` event (PS22 wires the event-log entry name; PS2 emits via TODO comment if `event-log` not yet updated — PS22 closes the loop).

#### **PS3 — `busy_timeout` pragma + `withWriteRetry` helper**
- **Goal**: `db.pragma('busy_timeout = 5000')` on open. Add a `withWriteRetry(fn, opts)` helper in `electron/services/database.ts` that catches `SQLITE_BUSY` and retries with exponential backoff (max 3 retries, total cap 5s). Adopt it in the two highest-contention store modules: `conversation-store.saveMessage` and `tool-calls-store.recordCall`.
- **Touch**: `electron/services/database.ts`, `electron/services/conversation-store.ts`, `electron/services/tool-calls-store.ts`, new `electron/services/database-retry.test.ts`.
- **Verify**: both tsc; new test mocks `SQLITE_BUSY` injection and asserts the helper retries + eventually succeeds; another asserts hard failure after retry cap is reached.
- **Notes**: every `SQLITE_BUSY` retry logs at `warning` severity via the event log so we see if multi-process contention is happening in the wild.

#### **PS4 — `PRAGMA integrity_check` at startup + recovery banner**
- **Goal**: run `integrity_check` after `getDb()` opens. On non-`ok`: show a non-dismissible renderer banner with two actions ("Restore from backup" / "Continue read-only"). Wire the IPC + the banner component.
- **Touch**: `electron/services/database.ts` (export `runIntegrityCheck()`), new `electron/ipc/persistence.ts`, new `src/components/persistence/IntegrityBanner.tsx`, `src/App.tsx` (mount the banner), `electron/preload.ts` (expose the IPC).
- **Verify**: both tsc; new test covers `runIntegrityCheck()` on a valid DB returns `ok` and a deliberately corrupted fixture returns the error string. Smoke: corrupt a test DB via the test harness, launch app, banner appears.
- **Notes**: PS5 ships the actual restore path. PS4 wires the surface; on click "Restore from backup" while PS5 isn't merged, the action shows a "backup feature shipping in next prompt" toast.

#### **PS5 — Daily `db.backup()` snapshot + retention + restore**
- **Goal**: a daily background job snapshots `lamprey.db` to `userData/backups/lamprey-<YYYY-MM-DD>.db`. 14-day rolling retention. The IntegrityBanner's "Restore from backup" wires to a `persistence:restoreFromBackup` IPC that atomically moves the current DB to `.corrupt-<ts>` and copies the most recent backup into place. App restart prompt at end of restore.
- **Touch**: `electron/services/backup-runner.ts` (new), `electron/main.ts` (start the runner on `app.whenReady`), `electron/ipc/persistence.ts`, `src/components/persistence/IntegrityBanner.tsx` (wire restore), new `electron/services/backup-runner.test.ts`.
- **Verify**: both tsc; new test covers (a) backup creates a valid copy, (b) retention prunes >14d files, (c) restore swaps files atomically. Smoke: trigger the runner manually, observe the backup file.
- **Notes**: uses better-sqlite3's `db.backup()` API with 100-page step size + a small yield between steps so a streaming reply isn't stalled. Logs `persistence.backup` event per snapshot.

#### **PS6 — Partition `initSchema` by domain**
- **Goal**: split the 700-line `initSchema` into `initConversationsSchema(db)`, `initMemorySchema(db)`, `initToolsSchema(db)`, `initRagSchema(db)`, `initSnipSchema(db)`, `initEventsSchema(db)`, etc. Each lives next to its owning `*-store.ts`. `initSchema` becomes a dispatcher.
- **Touch**: `electron/services/database.ts` (becomes dispatcher), new sibling files (`conversation-store-schema.ts`, etc.), wired into the migration registry where appropriate.
- **Verify**: both tsc; existing migration tests still pass byte-identically (the dispatcher must produce the same DDL execution order). New regression test asserts the dispatcher's DDL output (via `sqlite_master` row counts) matches the pre-partition snapshot.
- **Notes**: purely structural; no behavioral change. This is the prerequisite for PS11's clean introduction of new conversation columns without diving into a 700-line god-function.

#### **PS7 — vec0 dimension guard + embedder switch path**
- **Goal**: store the active embedder's dimension in a `rag_embedder_meta` table (one row). On startup, compare the stored dim to the configured embedder's dim. On mismatch: write a `persistence.recovery`-style event, expose a Settings action "Rebuild RAG index for new embedder", refuse vec0 inserts until rebuilt.
- **Touch**: `electron/services/rag/store.ts`, `electron/services/rag/vec-loader.ts`, new `electron/services/rag/embedder-meta.ts`, new test.
- **Verify**: both tsc; new test mocks a dim mismatch and asserts inserts refuse with the structured error.
- **Notes**: today, swapping embedders silently breaks recall (if dims happen to match) or hard-errors on insert (if they don't). PS7 makes the failure explicit and recoverable.

#### **PS8 — Per-stage transaction wrap + orphan-stage detection**
- **Goal**: wrap each multi-agent stage's `saveMessage` + `message_stage_metrics` insert in `db.transaction(() => {})()`. Add a derived helper `findOrphanPipelineStages(conversationId)` that returns stage rows whose Coder/Composer companion never landed. RT5 viewer renders these with an "Incomplete pipeline" chip.
- **Touch**: `electron/services/agent-pipeline.ts`, `electron/services/conversation-store.ts` (new `saveMessageWithStageMetrics` transactional helper), `src/components/reasoning-trace/ReasoningTraceViewer.tsx` (chip), new tests.
- **Verify**: both tsc; new test simulates a crash between planner and coder (by throwing in the test harness between awaits), asserts the planner row is durably present, asserts `findOrphanPipelineStages` surfaces it.
- **Notes**: doesn't make the cross-stage relationship transactional (impossible across async awaits without a stage state machine, deferred); it makes the row+metrics pair atomic and the orphan honest.

#### **PS9 — Optional SQLCipher passphrase mode**
- **Goal**: a Settings toggle "Encrypt database (requires app restart)". On enable: prompt for passphrase, store it in keychain under `encryption` provider, copy `lamprey.db` to `lamprey-enc.db` with `sqlcipher_export`, atomically swap. On disable: reverse direction. Graceful fallback if `better-sqlite3-multiple-ciphers` binding fails to load (same pattern as `sqlite-vec`).
- **Touch**: `electron/services/database.ts` (passphrase-aware open), `electron/services/keychain.ts` (new `encryption` provider namespace), new `electron/services/db-encryption.ts`, new test (covers binding-available + binding-missing paths).
- **Verify**: both tsc; new test covers the rekey round-trip on a binding-available fixture and the graceful no-op when the binding is missing.
- **Notes**: deferred until PS9 because the encryption code path needs the migration ledger (PS1), backup (PS5), and partitioned schema (PS6) all stable. Rotation deferred — one-shot setup only.

#### **PS10 — Settings → Persistence panel**
- **Goal**: a new panel exposing every PS1–PS9 lever:
  - Status: DB size, WAL size, last checkpoint time, last backup time, last integrity_check result.
  - Actions: "Run integrity check now", "Force checkpoint now", "Create backup now", "Restore from backup…", "Encrypt database" toggle.
  - Settings: backup retention (default 14d), checkpoint interval (default 5min), `busy_timeout` (default 5000ms).
- **Touch**: `src/components/settings/PersistenceSettings.tsx` (new), `src/components/settings/Settings.tsx` (register the panel), `electron/ipc/persistence.ts` (any additional IPC the panel needs).
- **Verify**: both tsc; new component test asserts the panel renders without errors and the actions wire to the IPC stubs (mocked). Smoke: open Settings, navigate to Persistence, observe live values; click each action, observe the event-spine row.
- **Notes**: closes Track A.

### Track B — Fork & Seed Surface (PS11–PS20)

#### **PS11 — Schema migration for fork lineage + seed blob**
- **Goal**: PS1 migration entry adding:
  - `conversations.forked_from_id TEXT` (FK to `conversations.id`, no cascade — deleting the source leaves the fork standing).
  - `conversations.forked_from_message_id TEXT` (no FK — we don't enforce that the anchor message still exists, just record the original id).
  - `conversations.seed_blob TEXT` (JSON blob; nullable).
  - `conversations.seed_source_kind TEXT CHECK(seed_source_kind IN ('none','message','block','transcript-range','custom'))` (defaults to `'none'`).
- **Touch**: `electron/services/db-migrations.ts` (new migration entry), `electron/services/conversation-store-schema.ts` (PS6's output, here we additively register the new columns), `electron/services/conversation-store.ts` (`rowToConversation` reads the new columns).
- **Verify**: both tsc; migration test covers fresh DB + existing DB upgrade paths. Conversation-store test covers reading + writing the new columns.
- **Notes**: blocked by PS1 + PS6. Track B may not start until both are merged.

#### **PS12 — `conversation:fork` IPC full parameter surface**
- **Goal**: rewrite the IPC handler's signature to accept:
  ```ts
  interface ForkParams {
    sourceConversationId: string
    sourceMessageId?: string         // anchor; if absent, fork from end
    seedKind: 'none' | 'message' | 'block' | 'transcript-range' | 'custom'
    seedContent?: string             // raw text for 'message' | 'block' | 'custom'
    seedBlobJson?: string            // structured blob for 'transcript-range'
    includeRagAttachments: boolean   // default true
    workspaceMode: 'inherit' | 'current' | 'none'  // default 'current'
    titleOverride?: string
  }
  ```
  Validates exhaustively, returns `{ success, data: { conversationId } }`. Does NOT yet copy messages from the source (PS13–PS15 wire the actual seeding); this prompt just lands the param surface + the conversation-row creation.
- **Touch**: `electron/ipc/conversation.ts`, `electron/preload.ts` (typed preload surface), `src/lib/ipc-client.ts`.
- **Verify**: both tsc; new test covers every combination of `seedKind` + `workspaceMode`. Smoke: invoke from devtools, observe a new conversation row with the right `forked_from_*` + `seed_source_kind` fields.
- **Notes**: PS12 is the smallest surface-introduction that lets PS13–PS20 land independently.

#### **PS13 — Workspace re-anchor on fork**
- **Goal**: implement the `workspaceMode` parameter from PS12. `'inherit'` copies the source's `worktree_path`; `'current'` reads `active-workspace.txt`; `'none'` sets NULL. Default is `'current'`.
- **Touch**: `electron/ipc/conversation.ts`, `electron/services/workspace-state.ts` (export the `getActiveWorkspace()` read in a fork-safe way), new test.
- **Verify**: both tsc; new test covers all three modes against fixtures with differing source `worktree_path` + active workspace.
- **Notes**: closes the §3.4 silent-footgun risk.

#### **PS14 — RAG attachment copy on fork**
- **Goal**: when `includeRagAttachments=true`, `INSERT INTO conversation_rag_attachments SELECT new_id, collection_id, document_id, NOW() FROM ... WHERE conversation_id = source_id`. When `false`, the new conversation starts with no attachments.
- **Touch**: `electron/services/conversation-rag.ts` (or wherever the attachments are written), `electron/ipc/conversation.ts`, new test.
- **Verify**: both tsc; new test covers the copy path against a source conversation with N attached collections.
- **Notes**: this single line unblocks "I forked but the model lost all my context" — the #1 footgun for forked conversations today.

#### **PS15 — Seed channel: `<seed_context>` sentinel in first user turn**
- **Goal**: implement the seed-payload path. When `seedKind != 'none'`, the new conversation's first user-turn (composed at IPC handler time, persisted with `role='user'`) wraps the seed body in `<seed_context source="..." kind="..." from_message_id="...">…</seed_context>`. The renderer's `MessageBubble` detects the sentinel and renders it as a chip ("Seeded from: <source>") with the body collapsed by default. Prompt assembly (`buildApiMessagesFromStoredMessages`) hands the wrapped text to the model verbatim; the model has been guided via system prompt to treat `<seed_context>` as user-provided background, not as instruction.
- **Touch**: `electron/ipc/conversation.ts`, `electron/services/conversation-store.ts` (new `saveSeedTurn` helper), `electron/services/system-prompt-builder.ts` (extend `PSEUDO_TAG_GUARD` to whitelist `<seed_context>` so HX2's guard doesn't fence it), `electron/services/chat-history.ts`, `src/components/chat/MessageBubble.tsx` (sentinel detection + chip rendering), `src/components/chat/SeedContextChip.tsx` (new), new tests.
- **Verify**: both tsc; new test covers the full round-trip: IPC call → DB row inspect → renderer chip → prompt-assembly output. The prompt-assembly test asserts the model sees the wrapped text verbatim.
- **Notes**: §3.3 trade-off captured here. The chip is collapsed-by-default so the user can see the seed shape without it dominating the chat column.

#### **PS16 — `MessageActions.onFork` wiring**
- **Goal**: replace the `toast.info('coming soon')` stub with a real handler that opens a small dialog ("Fork from this message: choose seed mode, workspace mode, RAG inclusion") then calls `conversation:fork` with the message's content as `seedContent`, `seedKind='message'`, `sourceMessageId=<id>`.
- **Touch**: `src/components/chat/MessageActions.tsx`, `src/components/chat/MessageBubble.tsx` (pass the new `onFork` prop down), new `src/components/chat/ForkDialog.tsx`, `src/stores/chat-store.ts` (`forkFromMessage(messageId)` action), new tests.
- **Verify**: both tsc; new test covers the dialog → store → IPC flow. Smoke: click Fork on an assistant bubble, choose defaults, observe a new conversation with the seed chip on the first user turn.
- **Notes**: the dialog ships with sensible defaults (`seedKind='message'`, `workspaceMode='current'`, `includeRagAttachments=true`) so a one-click fork is still possible.

#### **PS17 — Per-code-block "Extract to side chat" affordance**
- **Goal**: every rendered fenced ` ```code``` ` block in an assistant message gains a small chip in its top-right corner: "Extract → Side chat". Click: opens the Side-chat panel with the block's text seeded as `seedKind='block'`, `seedContent=<block-text>`.
- **Touch**: `src/components/chat/CodeBlock.tsx` (chip), `src/components/tools/panels/SideChatPanel.tsx` (PS18 covers the prop), new tests.
- **Verify**: both tsc; new test covers chip click → seed payload built correctly. Smoke: stream a reply with a code block, click Extract, observe Side-chat with the chip + first user turn seeded.
- **Notes**: deterministic per-block extraction is the §3 design substitute for selection-range seeding.

#### **PS18 — Side-chat panel accepts `seedMessageId` / `seedBlock` props**
- **Goal**: today's `SideChatPanel` opens blank. Extend its prop surface to optionally accept a seed payload; on first mount with a seed, it calls the `conversation:fork` IPC with the right parameters and renders the resulting conversation.
- **Touch**: `src/components/tools/panels/SideChatPanel.tsx`, new test.
- **Verify**: both tsc; new test covers the seed-on-mount flow. Smoke: PS17's "Extract" chip now produces a fully-seeded side conversation.
- **Notes**: the panel's existing ephemeral-localStorage mode is preserved — `seedMessageId` is opt-in.

#### **PS19 — Forked-from chip + lineage walk in ConversationHeader**
- **Goal**: a small chip in the conversation header reading "Forked from: <source title>" when `forked_from_id` is set. Click: navigates to the source conversation, scrolled to `forked_from_message_id`. A "Show lineage" affordance walks the chain (a conversation forked from a conversation forked from a conversation, etc.) up to N=10 levels.
- **Touch**: `src/components/chat/ConversationHeader.tsx`, `src/stores/chat-store.ts` (lineage-walk selector), new `src/components/chat/LineageChip.tsx`, new tests.
- **Verify**: both tsc; new test covers single-step + multi-step lineage. Smoke: fork a conversation, observe chip; click, navigate to source; fork again, walk lineage.
- **Notes**: the lineage walk reads `conversations.forked_from_id` recursively; cap at 10 to bound query cost.

#### **PS20 — Seed budget + auto-attach-as-RAG fallback**
- **Goal**: at IPC handler time, before persisting the seed turn, estimate the token cost of `seedContent` via the existing E5 tokenizer-estimator. If above `safeSeedLength` (default 8K chars, configurable in Settings → Persistence — no, wait — in `Settings → Seed budget`, separate panel; see §0.7 hotspot table), the seed becomes a one-shot RAG document:
  - New `rag_documents` row with `source_kind='paste'`, `display_name="Seed from <source>"`.
  - Auto-attached to the new conversation via `conversation_rag_attachments`.
  - The first user turn's chip reads "Seed attached as document (Ns tokens)" instead of the inline `<seed_context>` chip.
  - `conversation.seed.truncated` event row.
- **Touch**: `electron/ipc/conversation.ts`, `electron/services/rag/ingest.ts` (new `ingestPasteImmediate(content, opts)` helper), `src/components/settings/SeedBudgetSettings.tsx` (new), `src/components/settings/Settings.tsx`.
- **Verify**: both tsc; new test covers (a) tiny seed → inline path, (b) big seed → RAG-attach path, (c) no-embedder-available fallback to char-cap truncation.
- **Notes**: closes Track B. The fallback also handles the "no embedder available" degenerate case so we never crash on a big seed.

### Track C — Cross-cutting wrap (PS21–PS24)

#### **PS21 — Pin-as-memory wiring**
- **Goal**: the adjacent Pin button (today: `toast.info('coming soon')`) now wires to `chapters-store.ts`'s public API. Click: opens a small dialog ("Pin as chapter: <title>"); on confirm, creates a `chapters` row anchored to the message.
- **Touch**: `src/components/chat/MessageActions.tsx`, `src/components/chat/PinDialog.tsx` (new), `src/stores/chat-store.ts` (`pinMessage(messageId, title)` action), new tests.
- **Verify**: both tsc; new test covers dialog → store → IPC → DB row. Smoke: click Pin on a message, confirm, observe new chapter in the TOC.
- **Notes**: closes the adjacent stub. Shipping Fork without this leaves a half-finished impression on the action row.

#### **PS22 — Event-spine telemetry for both subsystems**
- **Goal**: register the new event types in `EVENT_TYPES` (per `event-log.ts`):
  - `persistence.checkpoint`, `persistence.integrity`, `persistence.backup`, `persistence.recovery`.
  - `conversation.forked`, `conversation.seed.attached`, `conversation.seed.truncated`.
  Wire emission in PS2 / PS4 / PS5 / PS12 / PS15 / PS20 (replace any TODO comments left during those prompts).
- **Touch**: `electron/services/event-log.ts`, the prompts named above (each replacing its TODO).
- **Verify**: both tsc; new test asserts each emission lands a row in `events` with the right `type` + payload shape.
- **Notes**: PS22 closes the audit loop. Without it, persistence + fork events would be invisible to the timeline UI.

#### **PS23 — Tests, ARCHITECTURE/PERSISTENCE.md, DEVLOG**
- **Goal**: end-to-end test suite covering:
  - Migration ledger replay across PS1–PS11 schema changes.
  - Fork → seed → workspace re-anchor → RAG copy → render flow.
  - Backup → corrupt → recover roundtrip.
- Update `ARCHITECTURE/PERSISTENCE.md`: new section "Migration ledger" replacing the "Migration story" section; new section "Backup + integrity + recovery"; new row in the SQLite-tables table for `rag_embedder_meta`. Update the `conversations` columns to list the new fork columns.
- DEVLOG: ensure every PS1–PS22 entry follows §0.5 format.
- **Touch**: `electron/services/*.test.ts` (new e2e), `ARCHITECTURE/PERSISTENCE.md`, `DEVLOG.md`.
- **Verify**: both tsc; all tests (existing + new) pass.
- **Notes**: PS23 is the polish prompt. Without it, the next phase starts from a stale architecture doc.

#### **PS24 — Ship arc: version bump → Bucket**
- **Goal**: bump `package.json` version to `0.9.0`. Update `README.md`:
  - Download heading + table URLs.
  - "New in v0.9.0" paragraph covering Persistence + Seed surface.
  - Quick start link (no change).
  - Roadmap top entry (add v0.9.0 entry).
- Run `pwsh scripts\bucket.ps1` to ship per the established Bucket pipeline (build → tag → push → R2 → GH release → CF cache purge).
- **Touch**: `package.json`, `README.md`, then `pwsh scripts\bucket.ps1`.
- **Verify**: both tsc; the bucket script's own internal checks (latest.yml match, R2 upload OK, GH release create OK, CF purge OK).
- **Notes**: closes the phase. Per `feedback_readme_is_part_of_ship`, the README update is mandatory, not optional.

---

## §6 Verification matrix

For each prompt, the verify gate is named in §5. This matrix is the cross-prompt safety net.

| Surface | Verified in |
|---------|-------------|
| `PRAGMA user_version` migration runs once per startup | PS1, PS6, PS11, PS23 |
| WAL truncates on graceful shutdown | PS2, PS23 |
| `SQLITE_BUSY` retries cleanly | PS3, PS23 |
| Integrity check banner renders on corrupt DB | PS4, PS23 |
| Backup runs daily; retention prunes >14d | PS5, PS23 |
| Schema partitioning preserves DDL output | PS6, PS23 |
| vec0 dim mismatch is loud, not silent | PS7, PS23 |
| Pipeline row+metrics commit atomically | PS8, PS23 |
| SQLCipher passphrase round-trips data | PS9, PS23 |
| Persistence Settings panel renders + actions wire | PS10, PS23 |
| Fork lineage columns persist + read back | PS11, PS12, PS23 |
| `conversation:fork` parameter surface validates | PS12, PS23 |
| Workspace re-anchor honors the explicit mode | PS13, PS23 |
| RAG attachments copy on fork | PS14, PS23 |
| `<seed_context>` chip renders + prompt assembly preserves | PS15, PS23 |
| Fork button no longer shows "coming soon" toast | PS16, PS21, PS23 |
| Per-code-block "Extract" chip seeds a side chat | PS17, PS18, PS23 |
| Forked-from lineage chip walks up to N=10 | PS19, PS23 |
| Big seed auto-attaches as RAG document | PS20, PS23 |
| Pin button no longer shows "coming soon" toast | PS21, PS23 |
| Event-spine rows land for every new event type | PS22, PS23 |
| README "New in v0.9.0" paragraph reflects shipped scope | PS24 |
| Bucket pipeline ships all four GH artifacts + CDN evergreens | PS24 |

---

## §7 Open questions for the user before kickoff

These are the only ambiguous calls in the plan. Defaults are chosen; flagging in case the user wants to override:

1. **Default `workspaceMode` on fork** — plan defaults to `'current'`. Alternative: `'inherit'` (today's silent behavior).
2. **Default `safeSeedLength`** — plan defaults to 8192 chars. Alternative: a token-based threshold (e.g. 2K tokens).
3. **Backup retention** — plan defaults to 14 rolling daily backups. Alternative: 7d or 30d.
4. **SQLCipher inclusion** — plan ships PS9 as an opt-in toggle, off by default. Alternative: defer SQLCipher to a follow-up phase if the binding's build-target story is uncertain.
5. **Lineage cap** — plan caps `LineageChip` at 10 levels deep. Alternative: unbounded (with reasonable lazy rendering).

If the user wants different defaults on any of these, PS5 / PS9 / PS19 / PS20 are the prompts to adjust before kickoff.

---

## §8 Out of scope (recap, for the wrap conversation with the user)

Captured in §2.2 above. Re-listed here so it shows up at the end of the doc when the user is deciding whether to green-light: cross-conversation merge; inline-branch rendering; cloud sync; encryption rotation; per-message selection-range seeding; DuckDB attach; per-conversation SQLite split. Each is a defensible follow-up; none of them should block this phase.

---

## Sign-off

This phase ships v0.9.0. It hardens the persistence floor to a level a regulated-industry user can rely on (backup + integrity + checkpoint + busy-timeout + opt-in encryption + migration ledger) and converts the UI promise of "per-hunk chat seeding" into actual wired behavior (Fork button → full param IPC → seed channel → RAG copy → lineage chip). It also closes the adjacent Pin-as-memory stub so the action row reads as finished, not half-done.

24 prompts. Track A (PS1–PS10) and Track B (PS11–PS20) parallel-worktree-safe; Track C (PS21–PS24) gates on both. Estimated effort: each prompt is sized for one sitting; the whole phase is realistically a week of focused work or 2–3 days of parallel-track sprint with two sessions.

**Awaiting explicit green light to begin PS1.**
