---
name: lamprey-diagnostics-and-tooling
description: How to MEASURE Lamprey instead of eyeballing it — verify-proof and its skip accounting, the smoke scripts, streaming vitals, the events/tool_calls audit tables, the reasoning trace surface, prompt byte measurement, token accounting — plus tested read-only inspection scripts (db-health.cjs, loop-state.cjs) shipped in this skill's scripts/ directory. Load when you need numbers, evidence, or an incident timeline rather than an impression.
---

# Lamprey Diagnostics & Tooling

## When to use / when not

- **Use** when you need to quantify something: is the stream alive, what did this turn cost, what happened at 14:32, how big is the prompt, is the DB healthy.
- **Don't use** for triage decision trees (see `lamprey-debugging-playbook`), the meaning of gate layers (see `lamprey-validation-and-qa`), or loop test protocols (see `lamprey-loop-reliability-campaign`).

## Shipped scripts (in `scripts/` next to this file — tested 2026-07-02)

Both are **read-only** (SQLite opened `readOnly: true`), take the DB path as an optional argument (default: the platform userData path), and degrade gracefully when tables are missing. Requires Node ≥ 22 (`node:sqlite`). **Copy the DB or close the app first if you're paranoid; read-only mode is safe alongside WAL but a copy is safer for long analysis.**

### `db-health.cjs` — one-shot health report

```bash
node .claude/skills/lamprey-diagnostics-and-tooling/scripts/db-health.cjs "%APPDATA%\Lamprey\lamprey.db"
```

Reports: file size, `user_version` (compare to `LATEST_VERSION` = 18 as of v0.16.0 — a lower live value means migrations aren't running: the v0.9.2 signature), `integrity_check`, table count, row counts for the 14 key tables, **orphan messages** (expected 0 since JM-17 transactional deletes), pending wake-up total, and loops stuck in `running`.

Real example output (synthetic fixture with one planted orphan):

```text
user_version: 18  (compare to LATEST_VERSION in electron/services/db-migrations.ts — 18 as of v0.16.0)
integrity_check: ok
...
orphan messages (no conversation): 1  (expected 0 — deleteConversation is transactional since v0.16.0)
pending loop wake-ups: 1  (cap is 10 per conversation; a big global number deserves a look)
loops currently marked running:
  {"id":"l1","status":"running","iteration":3}
```

Interpretation: non-zero orphans on a ≥v0.16.0 DB = a deletion path regressed. A `running` loop while the app is closed = crash-recovery sweep candidate (it should be settled on next launch — if it persists, that's a campaign finding).

### `loop-state.cjs` — loop subsystem dump

```bash
node .claude/skills/lamprey-diagnostics-and-tooling/scripts/loop-state.cjs "%APPDATA%\Lamprey\lamprey.db"
```

Dumps: `loops` (status, iteration, `active_ms` — the JM-6 working-time ceiling counter), recent `loop_runs`, `loop_backlog`, latest `loop_wakeups`, and pending wake-ups per conversation (cap 10). This is the primary evidence tool for `lamprey-loop-reliability-campaign`.

## The built-in diagnostic surfaces

| Surface | Where | How to read it |
|---|---|---|
| **verify:proof** | `npm run verify:proof` (flags `--no-tests`, `--require-smokes`, `--list-native-skips`) | Composite gate. Always read the native-skip accounting block: it states whether better-sqlite3 loads under the current Node and lists the guarded test cohort. Any skip on a dev machine ≥ Electron 43 is a finding. |
| **Bundle/renderer smokes** | `npm run smoke:bundle`, `npm run smoke:renderer` | Exit 0 or a specific failure (missing asset, empty chunk, no `createRoot`). A smoke failure after a dep bump usually means bundler hoisting/TDZ — see `lamprey-build-and-env`. |
| **Streaming vitals** | `chat:streaming-vitals` event (~2s) → "Ns since last chunk" pill | Distinguishes "model thinking" (N resets on chunks) from "stream dead" (N climbs toward the 60s watchdog). |
| **events table** | `SELECT * FROM events ORDER BY rowid DESC LIMIT 50` (read-only, node:sqlite) | Structured event log incl. `model.request.started/completed/failed`, key mutations (no key values), tool lifecycle. Reconstruct an incident timeline by conversation id + timestamps. 90-day retention. |
| **tool_calls table** | `SELECT tool_name,status,id FROM tool_calls ORDER BY rowid DESC LIMIT 50` | Every call with terminal status (completed/failed/denied). `fb_`-prefixed ids = fallback-parsed calls (trust-degraded). |
| **Reasoning Trace viewer** | right-panel pill; export to `.md`/`.csv` | Full per-turn chain-of-thought audit (local only). Use for "why did the model do that" questions instead of speculating. |
| **Token/cost accounting** | per-turn accumulation from `runChatRound` (JM-12: counts the full sent stack per round, not just the prompt) | Loop token budgets consume this; read a loop's spend from `loops` / `loop_runs` rows. |
| **Debug trace** | opt-in setting only | Writes tool arguments to plaintext `lamprey-debug.log` in userData. The JM-1 incident: it once shipped force-enabled. Enable for a session, harvest, **turn it off**. Never commit a force-enable. |

## Prompt byte measurement

Prompt size is a managed budget here (the Lampshade→Hygiene→Unburdening arc). To re-measure:

1. Locate the guard tests: `grep -rn "3,\?300\|3300\|3,\?900\|3900" electron/services/system-prompt-builder*.test.ts electron/services/*.test.ts 2>/dev/null | head` — the contract guard is < 3,300 bytes and the coding-mode prompt guard is < 3,900 bytes as of UB-8 (v0.14.0).
2. Measure directly: import/build the prompt in a scratch node script via the same builder functions a test uses (see how the guard test constructs it), then `Buffer.byteLength(prompt, 'utf8')`.
3. Any growth needs justification against the guard (see `lamprey-proof-and-analysis-toolkit` recipe 3). Raising a guard number is a reviewed decision, not a fix.

## Incident timeline recipe

1. Pin the window (user report time ± a few minutes).
2. `events` rows in that window for the conversation → request lifecycle + failures.
3. `tool_calls` for the same window → what executed, what was denied, `fb_` provenance.
4. `messages` (`content`, `content_raw`, `reasoning`, `role='system'` notices) → what the user saw vs what the model emitted.
5. If loops are involved: `loop-state.cjs` + `loop_runs` around the window.
6. Write the chain down (first cause → amplifier → detection gap) per the postmortem method in `lamprey-proof-and-analysis-toolkit` recipe 5.

## Provenance and maintenance

Scripts authored and run 2026-07-02 against a synthetic fixture (output above is real). Surfaces verified against `scripts/verify-proof.cjs`, `providers/registry.ts` (vitals), DEVLOG JM entries, at v0.16.0.

Re-verify:
- Scripts still run: `node .claude/skills/lamprey-diagnostics-and-tooling/scripts/db-health.cjs <db>` (exit 0)
- verify:proof flags: `head -25 scripts/verify-proof.cjs`
- Byte guards current values: `grep -rn "3300\|3900" electron/services/*.test.ts | head -5`
- Retention window: `grep -rn "90" electron/services/*retention* electron/services/*sweep* 2>/dev/null | head -3`
