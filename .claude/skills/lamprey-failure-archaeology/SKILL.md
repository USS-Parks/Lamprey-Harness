---
name: lamprey-failure-archaeology
description: The chronicle of every major Lamprey investigation, incident, dead end, rejected fix, and deletion — symptom, root cause, evidence, resolution, status — so nobody re-fights a settled battle or rebuilds something that was deliberately removed. Load when a bug looks familiar, when you find code or docs referencing subsystems you can't locate, or before proposing a fix for anything.
---

# Lamprey Failure Archaeology

## When to use / when not

- **Use** before investigating any bug (the class may be settled), when old docs mention machinery you can't find in the tree, or when a "new idea" might be a rejected old one.
- **Don't use** for live triage steps (see `lamprey-debugging-playbook`) or the methodology of investigations (see `lamprey-proof-and-analysis-toolkit`).

**Caveat on SHAs:** main was rewritten 2026-06-28 (501 → 112 commits, authorship unified, roster codes stripped). Commit SHAs quoted in docs written before that date may not resolve. Use `git log --oneline --all | grep -i <keyword>` to relocate a commit by subject.

## Quick index by symptom keyword

| Keyword | Entry |
|---|---|
| "no column named", schema, migration | #1 v0.9.2 schema bootstrap crash |
| reviewer, CHANGES verdict, packet | #2 v0.11.1 reviewer packet inversion |
| keys wiped, settings empty | #3 JM-13 atomic writes |
| debug log, plaintext secrets | #4 JM-1 forceDebugTraceOn |
| loop never ran, wake-up, duplicate iteration | #5 loop scaffold & JM Track A |
| hung turn, no reply, ghost | #6 turn settlement & ghost replies |
| deepseek 400, retired model | #7 DeepSeek retirement |
| multi-agent, planner, router, proof gate, composer | #8 Unburdening deletions |
| F1–F15, playbook failures | #9 the F-code catalog |
| plans that never shipped | #10 unshipped plans |

---

## #1 — v0.9.2: schema bootstrap crash (SETTLED)

- **Symptom:** every chat send in v0.9.1 returned `table messages has no column named proof_status`.
- **Root cause chain:** `conversation_rag_attachments` DDL in `electron/services/schema-init.ts` used `PRIMARY KEY (…, COALESCE(…))` — SQLite forbids expressions in table-level PRIMARY KEY/UNIQUE constraints. The throw aborted `initLegacySchema` partway; `runMigrations(db)` was never reached; `user_version` stayed 0; migration v16's `proof_status` column never existed.
- **Amplifier:** `getDb()` cached the partially-initialized handle, so nothing ever retried (fixed later, JM-16).
- **Detection failure:** the regression test in `schema-init.test.ts` silently skipped under the better-sqlite3 NODE_MODULE_VERSION mismatch (vitest's Node ABI ≠ Electron's) — on every CI and local run.
- **Fix:** move expression uniqueness to `CREATE UNIQUE INDEX` (legal in SQLite). Recovery was automatic and idempotent on next launch. Follow-ups: SP-9 made `verify:proof` print native-skip accounting; JM-27's Electron 43 bump aligned the ABIs so those tests actually run now.
- **Lessons institutionalized:** silent skips are incidents; migrations must be reachable and transactional; never cache a handle before init completes.

## #2 — v0.11.1: reviewer packet inversion (SETTLED, subsystem since deleted)

- **Symptom:** every multi-agent turn — including casual questions — got a Reviewer verdict of `CHANGES`.
- **Root cause:** the pipeline passed the Coder's reply as `builderNarrative`, but the packet builder gated inclusion behind an `includeBuilderNarrative` flag **no caller ever set**. The Reviewer reviewed a packet with the work product missing and correctly said "no answer artifact to review."
- **Detection failure:** two unit tests asserted the wrong invariant ("…without builder narrative by default", "sends packet **without** coder narrative") — the suite was green because it codified the bug.
- **Fix:** invert the API — include whenever provided; flip both tests; add a positive assertion the content reaches the Reviewer.
- **Lesson:** a passing test suite can lock a defect in. When behavior contradicts intuition, read the assertions (adversarial test inversion, `lamprey-proof-and-analysis-toolkit` recipe 7).
- **Note:** the whole pipeline was deleted in v0.14.0 (#8), but the lesson is permanent.

## #3 — JM-13: config-file wipe risk (SETTLED)

- **Symptom (potential/latent):** crash mid-write to `keys.json`/`settings.json` → torn JSON → reader silently healed to `{}` → next write persisted empty → all keys/settings permanently lost.
- **Fix (v0.16.0):** `electron/services/atomic-json.ts` — `writeJsonAtomic` (temp file + atomic rename) and `readJsonGuarded` (parse failure preserves the file as `<path>.corrupt-<timestamp>`, never overwrites it).
- **Lesson:** atomic temp+rename is mandatory for config files; corruption handling must preserve evidence, not destroy it.

## #4 — JM-1 / SEC-3: forceDebugTraceOn shipped (SETTLED)

- **Symptom:** v0.15.x shipped with diagnostic tracing force-enabled in `electron/main.ts`; all tool arguments persisted to plaintext `lamprey-debug.log` (may include secrets).
- **Fix:** call removed; tracing is opt-in only.
- **Lesson:** debug-convenience paths never ship enabled. Grep for force-enables before any release.

## #5 — Loop scaffold & JM Track A (SETTLED as of v0.16.0; live reliability = the current campaign)

- **LP-0 / G1 (2026-06-14):** a pre-existing, undocumented loop scaffold (`loop-runner.ts`, `schedule_wakeup`, `loop_wakeups` table) looked functional but **never ran a turn** — the renderer only reloaded the message list. LP-1 wired a headless turn runner (`setLoopTurnRunner` seam into `runHeadlessTurn`).
- **JM audit P0s (all fixed v0.16.0):**
  1. Iteration prompt never reached the model (persist-before-run was missing) — JM-2.
  2. No in-flight mutex: a slow turn spawned overlapping iterations — JM-3 (mutex + sequential wake-up drain).
  3. Watchdog abort signal dropped before reaching the turn — JM-4/5 (threaded end-to-end; stop/pause abort the running turn).
  4. `schedule_wakeup` bypassed `loopsEnabled` entirely with no ceiling — JM-5 (gated everywhere + 10-pending-wakeup cap per conversation).
- Also: wall-clock ceiling counted calendar time including pauses → migration v18 `loops.active_ms` counts working time (JM-6); crash-recovery sweep + transactional iteration commits (JM-7).
- **Status:** mechanisms fixed and source-locked (`loop-safety.test.ts`); *live* reliability at scale is the open frontier — `lamprey-loop-reliability-campaign`.

## #6 — Turn settlement & ghost replies (SETTLED)

- **History:** pre-stream throws hung turns forever (JM-8, fixed: every failure path settles); turns that failed with no visible reply left the conversation blank (SP-4, fixed: `ghost-reply-guard.ts` persists a `role:'system'` notice, user cancels exempt); retry attempts duplicated streamed prefixes (JM-9, fixed: accumulators reset per attempt); persisted system rows never reached the API history, breaking the research fallback (JM-11, fixed).
- **Lesson:** every failure path must settle the turn and leave a visible trace.

## #7 — DeepSeek model retirement (SETTLED, pattern recurs)

- **Symptom:** stale selections of `deepseek-chat`/`deepseek-reasoner` → unrecoverable HTTP 400 after the provider deprecated the endpoints.
- **Fix (v0.15.6):** `RETIRED_MODEL_MAP` in `providers/registry.ts` silently remaps (chat→v4-flash, reasoner→v4-pro, v3→v4-flash, r1→v4-pro); all hardcoded legacy defaults swept.
- **Recurring pattern:** providers retire models. When it happens again: add to the map, sweep hardcoded ids (`grep -rn "<old-id>" electron/ src/`), remove catalog entries.

## #8 — The Unburdening deletions (SETTLED — do NOT rebuild)

Deleted deliberately in v0.14.0 (net −7,400 lines) on explicit user direction, after being fully built and measured. Anything below appearing in older docs/plans is **historical record**:

| Deleted | What it was |
|---|---|
| `agent-pipeline.ts` + safety wrapper + reviewer evidence packet | Always-on Planner→Coder→Reviewer multi-agent pipeline |
| `agent-router.ts` + telemetry + After-action routing IPC | L8 heuristic auto-router (single vs multi per prompt) |
| `proof-gate.ts`, `proof-rigor.ts`, ProofGateBanner, implicit contracts, receipts scan | Runtime proof gate blocking "untrusted completions" |
| `final-response-composer.ts` | Composer rewriting the model's final reply (now: reply is the model's reply, byte-for-byte) |
| `agent-store.ts`, Agents settings tab, `agentMode`/`agentRoster`/`proofGate`/`agenticCodingComposer` keys | Settings/type surface for all of the above |

**Kept:** the `multi_agent_run` model tool (Task-tool analog), coworker side chat, reasoning audit/trail/trace, ghost-reply guard, spill valve, sanitizer, `verify:proof` repo gate, and the DB tables (`proof_receipts`, `change_contracts`, `failure_ledger`) so historical rows stay readable. Retired settings keys ride through settings.json inert.

**Why:** the Opus 4.5-era product never had this machinery; it measurably degraded cheap-model output ("tortured"), and gating wasn't enough — deletion was.

## #9 — The F-code catalog (playbook failures, v0.10–v0.12 era)

Failure codes from live runs of the LL smoke playbook. Where each stands now:

| Code | What it was | Status now |
|---|---|---|
| F2 | Pipeline bailed after Coder mutated files → broken files on disk, no chat reply | Moot (pipeline deleted); the surviving principle: never end a mutating turn without a visible reply (ghost-reply guard) |
| F4 | Non-mutating turns tripping "Untrusted completion" | Moot (proof gate deleted) |
| F5 | Reviewer verdict-line intermittent | Was a downstream symptom of #2, not a real regression — the fix hypothesis (CR-6) was correctly declared a NO-OP after evidence |
| F7 | Repeated Unix-syntax failures on PowerShell | Contract bullet: adapt after ONE shell failure — lives on in the prompt contract |
| F9 | File edits via shell pipelines → silent UTF-8 corruption | Contract bullet: patch-based edits only, never shell pipelines |
| F12 | Reviewer volunteering unasked fixes | Resolved by v0.11.1; CR-7's second half correctly no-opped |
| F13 | Building whole systems from terse clarifications | Contract bullet: smallest correct fix |
| F15 | Stall watchdog tripping on progressing stages | Fixed by SP-5 activity-kick wiring; watchdog machinery survives in loop iterations |

## #10 — Drafted but never shipped (do not assume these exist)

| Plan | Status |
|---|---|
| `PLANNING/LAMPREY_HYBRID_CONTEXT_PLAN.md` | Drafted, never approved/executed |
| `PLANNING/LAMPREY_SANDBOX_PARITY_PLAN.md` | Partially delivered piecemeal; full roster (platform sandbox profiles) never executed as a phase |
| `PLANNING/LAMPREY_PERSISTENCE_AND_SEED_PLAN.md` | Elements delivered piecemeal (atomic writes, backups, fork lineage); never run as the formal 24-prompt phase; fork-with-parameters remains partially stubbed |
| `PLANNING/Lamprey_Data_Spine_Plan_and_Prompt_Timeline.md` | Research doc; produced the undocumented agentic-infra layer (automations/workflow runners) that Loops later built on |
| `PLANNING/LAMPREY_LIVE_AUDIT_HARDENING_PLAN.md` | Drafted; elements exist; formal phase never executed |

These lost the race to the era-lock/Unburdening direction. Reviving any of them = era-lock exception = explicit user authorization (`lamprey-change-control`).

## Provenance and maintenance

Compiled from `git log`, `DEVLOG.md`, `PLANNING/LAMPREY_JULY_2026_MAINTENANCE_AUDIT.md`, `PLANNING/LL_SMOKE_PLAYBOOK.md`, and CLAUDE.md phase entries, at v0.16.0 (2026-07-02).

Re-verify:
- Incident fix presence: `git log --oneline | head -40` (JM commits are the most recent block)
- Deleted modules stay deleted: `ls electron/services | grep -E "agent-pipeline|agent-router|proof-gate|final-response-composer"` (expect no output)
- Unshipped plans list: `ls PLANNING/` + CLAUDE.md Current State
- New incidents since 2026-07-02: read `DEVLOG.md` entries above the JM-31 wrap
