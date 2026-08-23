# Lamprey July 2026 Maintenance Phase — P-SPR (JM-0 … JM-31)

**Status: APPROVED — user approved all audit findings and authorized STS 2026-07-02 ("Approved all. STS.").**
**Source:** `PLANNING/LAMPREY_JULY_2026_MAINTENANCE_AUDIT.md` (2026-07-02, v0.15.6 baseline). Finding IDs (LP/CC/SEC/RD/DB/HY-*) refer to that report.
**Target version:** v0.16.0.

---

## §0 Discipline

1. **Branch:** work lands on `main` locally (single session, no parallel tracks); push to `origin/main` only at the JM-31 wrap.
2. **Verify gate per prompt:** `npx tsc --noEmit -p tsconfig.node.json` + `npx tsc --noEmit -p tsconfig.web.json` + targeted vitest for touched areas. Full suite + lint + build + smokes at JM-31 (and at any prompt that touches build config). The wired pre-commit hook (JM-0) additionally runs lint + both tscs on every commit.
3. **Commit per prompt.** Subject: plain-speak imperative, ≤ 72 chars, says what and enough why. Body: short, no dogpiled summaries. Every commit carries the trailer line `Agentically Engineered and Reviewed by Basho Parks - 2026`. No Co-Authored-By lines. Enforced mechanically by the JM-0 commit-msg hook.
4. **DEVLOG:** one entry per prompt (date, prompt id, what/why, gate results), plus a phase-complete entry at JM-31.
5. **Honesty rule:** anything that cannot be completed in-session (e.g. a signing certificate that must be purchased) is documented as an explicit deferred item, never faked.

## §1 Roster

**Governance + quick wins**
- [ ] **JM-0 — Commit discipline hard rules.** New `scripts/hooks/commit-msg` (trailer required, subject/body plain-speak checks, slop-phrase denylist); new `scripts/check-ai-artifacts.cjs` staged-diff scanner wired into `scripts/hooks/pre-commit`; `git config core.hooksPath scripts/hooks`; `npm run hooks:install` script; CONTRIBUTING.md "Commit discipline (hard rules)" section.
- [ ] **JM-1 — Quick wins.** SEC-3 remove `forceDebugTraceOn()`; HY-1 `git rm --cached .bucket.json`; HY-5 fix flaky memory-store timeout; HY-6 declare `js-yaml`; HY-7 delete untracked PLANNING drafts; HY-11/12 delete `output/` + root logs, ignore `output/`; HY-14 align copyright holder; CC-16 synthesizer default model; RD-15 dedupe fallback model list.

**Track A — Loop integrity**
- [ ] **JM-2 — LP-1:** persist the iteration prompt as a user message before the headless turn (mirror `fireDueWakeups`); test asserting the prompt reaches the API message stack.
- [ ] **JM-3 — LP-2/LP-8/LP-16:** in-flight guard so a loop can't run overlapping iterations; sequential/capped wake-up firing (no post-sleep burst); per-automation in-flight guard.
- [ ] **JM-4 — LP-3/LP-15/CC-9:** thread the watchdog abort signal through `LoopTurnRunner` → `runHeadlessTurn`; stop/pause aborts the in-flight turn; ghost-reply guard moves into `runHeadlessTurn` so loop/wake-up turns get it.
- [ ] **JM-5 — LP-4/LP-5/LP-6/LP-14:** `loopsEnabled` gates `schedule_wakeup`, `fireDueWakeups` turn execution, `tickLoops`, `loop_control continue`, and automations; per-conversation pending-wakeup cap; widen `loop-safety.test.ts` to lock every entry point.
- [ ] **JM-6 — LP-7/LP-11/LP-17/LP-18/LP-19/LP-22/LP-23:** date-qualified automation dedup key; wall-clock counts active loop time (reset on resume, documented); ceiling `0` = disabled for all three caps; error/timeout iterations run post-flight ceilings + record a token estimate; `Number.isFinite` interval validation; honor model `continue` delay in all modes; document cron DST semantics.
- [ ] **JM-7 — LP-10/LP-12/LP-13/LP-20/LP-21/LP-24:** frozen Math proxy for the workflow sandbox; startup sweep for stale `in_progress` items + orphaned `running` runs; per-iteration commit in one transaction; pending-only backlog reorder; loop-existence check on enqueue; drain in-flight turns on quit.

**Track B — Chat core correctness**
- [ ] **JM-8 — CC-1/CC-3/CC-20:** every pre-stream throw and `onDone`-body throw settles the turn (persist error, reject, ghost-guard); IPC error contract holds for untyped throws; unify success payload shape.
- [ ] **JM-9 — CC-2/CC-14/CC-15:** reset stream accumulators per retry attempt; guard `tc.index` undefined in the tool-call accumulator; gate `reasoning_content` echo on `resolveModel` output at both sites.
- [ ] **JM-10 — CC-4/CC-6/CC-13:** inject `FALLBACK_TOOL_INSTRUCTION` + tool list for non-native/downgraded models (rebuild on mid-conversation downgrade); malformed native args → `argument_parse_failed` tool result; fallback validation failure → structured feedback round instead of rendering raw JSON.
- [ ] **JM-11 — CC-5/CC-7/CC-12:** persisted system rows reach the API history; `resolveModel` consults custom models before the DeepSeek fallback; wire per-conversation unlock/capability cleanup into conversation delete.
- [ ] **JM-12 — CC-10/CC-11/CC-17/CC-18/CC-19/CC-21/CC-22/CC-23:** byte-true reasoning-trail cap; per-round token accounting returned from `runChatRound` (fixes loop budget undercount, corrects docs); unify `toolSurface` gates; spill threshold naming/measurement; strict user-abort detection; delete dead PSEUDO_TAG_GUARD scans + legacy shim + fix `validateViaChatProbe` comment/behavior; cached settings accessor; title-generation timeout.

**Track C — Data durability**
- [ ] **JM-13 — DB-1/DB-2/DB-13:** shared atomic JSON writer (temp + rename) for keys.json and settings.json; corrupt files preserved aside and surfaced, never healed to `{}`; all four settings writers unified through one `patchSettings`.
- [ ] **JM-14 — DB-3/DB-7/DB-12/DB-22:** fallback-latch only on DB-unavailable errors (RAG, memory-store FTS, event-log, agent-run-store) with recovery probe; per-query FTS-syntax fallback; ring-buffer the memory fallbacks.
- [ ] **JM-15 — DB-4/DB-18:** `deleteCollection` deletes `rag_chunk_vec` rows in-transaction; `deleteDocument` reuses the transactional chunk delete.
- [ ] **JM-16 — DB-5/DB-19/DB-20:** `getDb()` nulls + closes the handle on init failure (fail loud); `safeAddColumn` probes `PRAGMA table_info`; delete the dead copy; `transactional()` stops degrading silently.
- [ ] **JM-17 — DB-6/DB-10/DB-21:** `saveMessage` group transactional inside the retry; `deleteConversation` covers the five orphan families + stops conversation-scoped loops/wakeups in one transaction; `clearConversationMessages` transactional.
- [ ] **JM-18 — DB-8/DB-9/DB-11/DB-16/DB-17:** FTS token quoting for session search; startup retention sweep (events/tool_calls/snip_command_log/fired wakeups/loop_runs, 90-day default, configurable); encrypted-aware backup source + persistent failure warning; hoist N+1 prepares; positioned spill reads.

**Track D — Security hardening**
- [ ] **JM-19 — SEC-1/SEC-2/SEC-8:** `will-navigate` guard on all windows; scheme-filtered `setWindowOpenHandler` (http/https only); artifact CSP + deny-all window-open on artifact surfaces.
- [ ] **JM-20 — SEC-4/SEC-5/SEC-6:** confine `files:readText`/`listDir`/`walkProject` to the workspace root; route MCP stdio server creation (add-server, plugin connectors) through the approval flow + pin the bundled playwright package; SEC-6: wire electron-builder signing config behind env-provided cert (documented deferred item — cert acquisition is owner action).

**Track E — Renderer correctness + perf**
- [ ] **JM-21 — RD-1/RD-3/RD-10:** streaming state cleared/tracked across conversation switches; staleness guard on async message load; captured-id title writes.
- [ ] **JM-22 — RD-2/RD-12/RD-13/RD-19:** fix `conversationId` field reads in `/fork` + duplicate; debounced/sequenced session search; check mutation envelopes (conversation delete, loops store); uuid attachment identity.
- [ ] **JM-23 — RD-4/RD-5/RD-11:** queue concurrent approval requests; focus-scoped chip hotkeys + confirmation for workspace-scope grants; dialog semantics/focus trap/Esc on ToolApprovalModal.
- [ ] **JM-24 — RD-6/RD-16:** `memo(MessageBubble)` + per-field store selectors + list windowing for long transcripts; LoopsPanel ticker gating + per-loop backlog state.
- [ ] **JM-25 — RD-7/RD-8/RD-9/RD-14/RD-17/RD-18/RD-20:** per-listener disposers replacing `offAll`; App/UpdateBanner subscription cleanup; lazy `window.api` in ipc-client; FTS snippet sentinel fix; SideChatPanel init deps + stable keys; drag-end robustness.

**Track F — Currency + docs + wrap**
- [ ] **JM-26 — Minor/patch dependency bumps** (better-sqlite3 12.11.1, electron-builder, electron-updater, eslint, mermaid, openai, prettier, react, shiki, tailwind, ts-eslint, vitest, playwright, MCP SDK, js-yaml) + `npm audit` recheck; full gate.
- [ ] **JM-27 — HY-2 Electron major upgrade** (35 → newest major that passes: target 43; fallback to highest green major); electron-rebuild; verify WebContentsView/safeStorage/single-instance/updater; previously ABI-skipped test cohort now runs; update pin rationale docs.
- [ ] **JM-28 — HY-3 embedder migration** `@xenova/transformers` → `@huggingface/transformers` 3.x; audit chain re-check (target: 0 critical/high).
- [ ] **JM-29 — HY-9/HY-10/HY-13/HY-15:** CI `windows-latest` test leg; TypeScript bump to current 5.x with caret (TS 6 evaluated, documented); Node alignment (CI 24 + `@types/node` ^24 + `engines`); `noUncheckedIndexedAccess` trial — enable if diff is tractable, else document count + defer.
- [ ] **JM-30 — HY-4 docs refresh:** CLAUDE.md both copies (five providers, v0.15.2–0.15.6 entries, corrected token-budget note, this phase's entry), README "New in v0.16.0", version bump to 0.16.0.
- [ ] **JM-31 — Phase wrap:** full gate (lint, both tscs, full vitest, electron-vite build, smoke:bundle, smoke:renderer, verify:proof), `npm run build:win` → `dist/Lamprey-x64.exe` + `.zip` + blockmap + latest.yml verified, DEVLOG phase-complete entry, push `main`.

## §2 Completion criteria
- All roster boxes checked; every commit passes the JM-0 hooks; full vitest green (no new skips beyond documented platform/network guards); `npm audit --omit=dev` shows 0 critical/high; dist artifacts present with v0.16.0 `latest.yml`; `origin/main` updated.
