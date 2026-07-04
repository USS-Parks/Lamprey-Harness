---
name: lamprey-debugging-playbook
description: Symptom-to-triage playbook for the Lamprey Harness's real failure modes — chat sends failing with SQL errors, hung or ghosted turns, loops misfiring or duplicating, provider HTTP errors, malformed tool calls, silently skipping tests, vanished keys/settings, renderer state bleed, dev server exiting instantly. Load when something is broken and you need the fastest discriminating check.
---

# Lamprey Debugging Playbook

## When to use / when not

- **Use** when the app or a test is misbehaving and you need triage: what to check first, what the likely causes are, and the experiment that discriminates between them.
- **Don't use** for the full history of an already-solved defect (see `lamprey-failure-archaeology`), loop deep-work (see `lamprey-loop-reliability-campaign`), or building measurement tooling (see `lamprey-diagnostics-and-tooling`).

## TL;DR triage table

| Symptom | First check | Likely causes (ranked) | Discriminating experiment |
|---|---|---|---|
| Every chat send fails with a SQL error ("no column named …", "no such table") | DB schema version (see below) | 1. A migration never ran because init threw earlier 2. New code references a column its migration didn't add 3. Stale cached DB handle | Open `%APPDATA%\Lamprey\lamprey.db` read-only, run `PRAGMA user_version` — if it's behind `LATEST_VERSION` in `electron/services/db-migrations.ts`, init is aborting **before** migrations. Find the throw in `initLegacySchema` (`electron/services/schema-init.ts`). |
| Turn hangs, spinner forever | Whether the stream ever started (streaming vitals pill / `chat:streaming-vitals`) | 1. Pre-stream throw not settling the turn (historically JM-8) 2. SSE stall past `streamInactivityMs` 3. MCP tool call past `mcpCallTimeoutMs` 4. Abort controller never resolved | If no first chunk ever arrived → pre-stream path; check main-process console for a throw in `runHeadlessTurn` before `chatStream`. If chunks stopped mid-stream → watchdog should abort at 60s default; if it didn't, check `streamInactivityMs` in settings.json (0 disables it). |
| Conversation shows nothing after a turn ("ghost reply") | `messages` table for a `role='system'` notice row | 1. Turn failed and the ghost-reply guard fired (working as designed — read the notice) 2. Research pipeline hit `NoSourcesError` and fell through 3. Guard itself failed (regression) | The guard (`electron/services/ghost-reply-guard.ts`) persists a system notice on any failed turn with no visible reply; user cancels are exempt. If a failed turn left NO system row and NO assistant row, that's a guard regression — check `ghost-reply-regression.test.ts` still passes. |
| Loop never fires / fires twice / never stops | `loopsEnabled` in settings.json, then the loop tables | 1. Master toggle off (gates every entry point) 2. Ceiling already tripped (`loops` row status + reason) 3. Historical class: overlap/watchdog bugs (fixed v0.16.0) | `SELECT id,status,iteration,active_ms FROM loops;` and `SELECT status,fire_at FROM loop_wakeups ORDER BY fire_at DESC LIMIT 10;` — see `lamprey-loop-reliability-campaign` for the full protocol and expected values. |
| Provider returns HTTP 400 on a model that used to work | The model id against `RETIRED_MODEL_MAP` (`electron/services/providers/registry.ts`) | 1. Provider retired the model (DeepSeek did this v0.15.6) 2. Malformed request from a capability flag mismatch 3. Bad custom-model entry | If the id is in the retired map it should remap silently — a 400 means the id bypassed `resolveModel`. Grep the id: `grep -rn "<model-id>" electron/ src/`. |
| Provider 401 / key rejected | `settings:testProviderKey` path / Settings → API Keys test button | 1. Wrong or expired key 2. keys.json was corrupt and preserved aside | Look for `keys.json.corrupt-<timestamp>` next to `%APPDATA%\Lamprey\keys.json` — if present, a torn file was preserved and the live file may be empty. Re-enter keys; the corrupt copy is kept for forensics. |
| 429s / rate limiting | Retry behavior in `chatStream` | Normal: up to 3 retries with backoff for 429 and connection errors | Only escalate if retries exhaust; persistent 429 = provider quota, not a code bug. |
| Tool call executes with empty args, or model "calls tools" in prose | The tool_calls table + whether the model is on the fallback path | 1. Token exhaustion producing empty params (detected, corrective result returned) 2. Model doesn't support native tools → FC-6 fallback JSON contract 3. Capability downgrade engaged (3 mismatches) | Fallback call ids are prefixed `fb_`. `SELECT id,tool_name,status FROM tool_calls ORDER BY rowid DESC LIMIT 20;` — `fb_` prefixes mean the fallback parser produced them, which also disables persisted "always allow". |
| `tool_search` spam / model flailing on lazy surface | Whether the conversation got downgraded to the full catalog | Threshold is `MALFORMED_SEARCH_DOWNGRADE_THRESHOLD = 3` in `electron/services/tool-unlock-state.ts` | Note: lazy surface is opt-in (`toolSurface: 'lazy'`); era default is `'full'`. If flailing occurs on defaults, something re-enabled lazy. |
| Tests "pass" but a DB test never ran | Native-binding skip accounting | better-sqlite3 ABI vs the Node running vitest | `npm run verify:proof -- --list-native-skips` prints the guarded cohort and whether the binding loads. Since Electron 43 / Node 22 the ABIs match and these tests RUN — any skip reappearing is an event, not noise. See the v0.9.2 story in `lamprey-failure-archaeology`. |
| Settings or keys vanished | Corrupt-file preservation | Atomic-write layer (`electron/services/atomic-json.ts`) preserves parse-failing files as `<file>.corrupt-<timestamp>` and never heals to `{}` | If values are gone AND no `.corrupt-*` file exists, the loss predates v0.16.0 or something bypassed `writeJsonAtomic` — grep for raw `writeFileSync` on those paths. |
| Input locked app-wide during streaming, or stream text lands in the wrong conversation | Renderer streaming state | Historical class (fixed JM-21/22): conversation switches now clear streaming state; staleness guards added | If reproducible on ≥ v0.16.0, capture exact repro; this class was closed and a recurrence is a regression worth a DEVLOG entry. |
| Approval dialogs replacing each other / lost approvals | Approval queue in `src/App.tsx` | Historical class (fixed JM-23): queue replaced modal clobbering | Reproduce with two slow concurrent tool calls needing approval; second should queue, not clobber. |
| `npm run dev` exits instantly | `ELECTRON_EXEC_PATH` | The dev server on this machine needs the explicit Electron binary path | `ELECTRON_EXEC_PATH="<repo>/node_modules/electron/dist/electron.exe" npx electron-vite dev` — see `lamprey-build-and-env`. |
| vitest fails to even start / esbuild error | AV quarantine of esbuild.exe | Windows Defender or third-party AV blocking `node_modules/esbuild/bin/esbuild.exe` | Remedies in CONTRIBUTING.md: AV exclusion for `node_modules/esbuild`, or run `node node_modules/esbuild/bin/esbuild --version` once, or reinstall after exclusion. |

## The traps that cost real time (with their stories)

**The silent test skip (v0.9.2).** The regression test that would have caught a fatal DDL error was skipping on every run — vitest's Node ABI didn't match the Electron-rebuilt better-sqlite3 binding, and `describe.skipIf(!HAS_NATIVE_SQLITE)` skipped quietly. The bug shipped; every chat send failed in production. Rule: **a skipped test is a finding, not background noise.** Always read the skip accounting in `verify:proof` output.

**The half-initialized DB handle (v0.9.2 amplifier, fixed JM-16).** `getDb()` cached its handle before initialization finished, so after an init throw, every later call returned a broken handle instead of retrying. If you see "impossible" schema states, ask whether init completed before anything cached.

**Tests that assert the bug (v0.11.1).** Two tests asserted the reviewer packet *excluded* the work product — the defect itself. When a behavior seems obviously wrong but tests are green, read what the tests actually assert before trusting them. Flip the suspicious assertion and see what breaks (recipe 7 in `lamprey-proof-and-analysis-toolkit`).

**Unix-on-PowerShell loops (F7, v0.11.x era).** Models repeated the same failing Unix-syntax shell command 3+ times on PowerShell. If a shell command fails on syntax, adapt after ONE failure — the primary dev machine is Windows; both PowerShell 7 and Git Bash exist, with different syntax.

**Editing files through shell pipelines (F9).** `[System.IO.File]::WriteAllText` and pipeline redirects caused silent UTF-8 corruption. Never edit source files via shell pipelines; use a proper editor/patch path.

**The wake-up that never woke (LP-0 / G1).** The original loop scaffold persisted a wake-up message and the renderer merely *reloaded the message list* — no turn ever ran. When a feature "runs" but has no visible effect, verify the actual execution path exists (documented-vs-wired audit, `lamprey-proof-and-analysis-toolkit` recipe 2).

## Where evidence lives

- **DB audit tables**: `events` (structured event log), `tool_calls` (every call with status), `loop_runs` / `loop_wakeups` / `loop_backlog`, `messages` (incl. `content_raw` for pre-sanitization originals, `reasoning` for chain-of-thought). 90-day retention sweep applies to the audit families (JM-18).
- **Streaming vitals**: `chat:streaming-vitals` heartbeat (~2s) drives the "Ns since last chunk" pill — the fastest way to distinguish "model is thinking" from "stream is dead."
- **Reasoning Trace viewer** (right panel) + `.md`/`.csv` export — full per-turn reasoning audit.
- **Debug trace**: opt-in ONLY. It writes tool arguments to a plaintext log (`lamprey-debug.log` in userData) — it must never ship force-enabled (the JM-1 incident). Turn it off when done.
- **Inspection scripts**: `lamprey-diagnostics-and-tooling` ships read-only DB inspection scripts with interpretation guides.

## General method

1. Reproduce once, capturing the exact error text.
2. Classify with the table above; run the discriminating experiment before touching code.
3. Check `lamprey-failure-archaeology` — most symptom classes here have a settled history; don't re-fight it.
4. Walk the causal chain to the FIRST cause, then ask what amplified it and why detection missed it (the v0.9.2 postmortem method — all three get fixed).
5. Route the fix through `lamprey-change-control`; add the test that would have caught it (often a source-lock test, see `lamprey-validation-and-qa`).

## Provenance and maintenance

Based on source reads of `ghost-reply-guard.ts`, `tool-unlock-state.ts`, `tool-result-spill.ts`, `providers/registry.ts`, `atomic-json.ts`, `loop-config.ts`, hooks and DEVLOG incident entries, at v0.16.0 (2026-07-02).

Re-verify:
- Watchdog defaults: `grep -n "DEFAULT_STREAM_INACTIVITY_MS\|MIN_STREAM_INACTIVITY_MS" electron/services/providers/registry.ts`
- Downgrade threshold: `grep -n "MALFORMED_SEARCH_DOWNGRADE_THRESHOLD" electron/services/tool-unlock-state.ts`
- Spill threshold: `grep -n "DEFAULT_SPILL_THRESHOLD" electron/services/tool-result-spill.ts`
- Native-skip status: `npm run verify:proof -- --list-native-skips`
