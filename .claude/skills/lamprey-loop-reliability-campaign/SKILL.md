---
name: lamprey-loop-reliability-campaign
description: The executable, decision-gated campaign for Lamprey's hardest live problem — proving loop autonomy (interval / self-paced / autonomous backlog) reliable in real use. Numbered phases with exact commands, expected observations at every gate, a ranked solution menu for failures, fenced-off wrong paths, and a promotion protocol through change control. Load for any loop work: testing, debugging, hardening, or the endurance soak.
---

# Lamprey Loop Reliability Campaign

## When to use / when not

- **Use** for anything loop-shaped: verifying loops work, investigating a loop misbehavior, planning loop hardening, or running the soak.
- **Don't use** for one-off loop symptom triage rows (start at `lamprey-debugging-playbook`, it routes here), or loop config key meanings (see `lamprey-config-and-flags`).

## Context (read once)

Loops are the one authorized extension past the era-lock (v0.15.0), OFF by default. The subsystem had four P0 defects fixed in v0.16.0 (prompt never reached the model; overlapping iterations; dropped watchdog signal; `schedule_wakeup` bypassing the master toggle — `lamprey-failure-archaeology` #5). The **mechanisms** are now fixed and source-locked; what remains unproven is **live reliability**: real cadence, real crash recovery, real endurance. That gap is this campaign. Success is measurable — never judged by eye.

Key modules: `electron/services/loop-runner.ts` (wake-ups), `loop-controller.ts` (iterations + ceilings), `loop-store.ts`, `loop-tool-logic.ts` (model tools `loop_enqueue`/`loop_complete_task`/`loop_control`), `loop-config.ts`, `automations-runner.ts` (cron tick), `electron/ipc/loops.ts`, UI `LoopsPanel.tsx`/`LoopSettings.tsx`. Tables (migration v17, `active_ms` v18): `loops`, `loop_backlog`, `loop_runs`, plus `loop_wakeups`.

Evidence tool for every phase: `node .claude/skills/lamprey-diagnostics-and-tooling/scripts/loop-state.cjs <db>`.

---

## Phase 0 — Preconditions

```bash
node -e "console.log(require('./package.json').version)"   # expect >= 0.16.0
```
A packaged install or dev build must be runnable (GUI phases are owner-run; say so, don't fake them — `lamprey-docs-and-writing` verification honesty).

Enable loops: Settings → Loops → master toggle, or set `"loopsEnabled": true` in `%APPDATA%\Lamprey\settings.json` (app restart picks it up). All other loop settings can stay default (25 iterations / 30 min active / 500k tokens / floor 30s).

**Gate:** the Loops right-panel pill shows "No loops yet" instead of a disabled state.
**If instead** the panel says loops are disabled → the setting didn't persist; check `settings.json` and `lamprey-config-and-flags` merge semantics.

## Phase 1 — Static verification (headless, no GUI)

```bash
npx vitest run electron/services/loop-safety.test.ts electron/services/loop-db-integration.test.ts electron/services/loop-config.test.ts electron/services/loop-controller.test.ts electron/services/loop-runner.test.ts electron/services/loop-turn-wiring.test.ts
```

**Gate:** all pass, **zero skipped** (loop-db-integration uses `node:sqlite`, so no ABI excuse exists).
**If a loop test skips** → environment problem, fix before proceeding (`lamprey-build-and-env`).
**If loop-safety fails** → a `loopsEnabled` gate was removed at some entry point. That is a P0 regression: stop, fix through change control, do not proceed to live phases.

## Phase 2 — Live interval loop (LP playbook tests 0–2)

In a throwaway conversation: `/loop 1m say the current time`.

Expected within ~90s: iteration counter increments; a real assistant reply appears (the injected prompt reached the model — the historical JM-2 defect); countdown resets.

Verify in the DB (app can stay open; scripts are read-only):
```bash
node .claude/skills/lamprey-diagnostics-and-tooling/scripts/loop-state.cjs "%APPDATA%\Lamprey\lamprey.db"
```
**Expected:** one `loops` row, `status` active/running, `iteration ≥ 1`, `active_ms > 0` and far below 30 min; one `loop_runs` row per iteration; no pending wake-up pile-up.

Headless check: switch to another conversation, then minimize the window → the loop conversation still gains a reply per minute.

**If no reply ever appears but iteration increments** → prompt-persist path regressed (JM-2 class). Check `messages` for the persisted iteration prompt (user-role row) before each run.
**If two runs share overlapping start times** → mutex regression (JM-3 class). Capture `loop_runs` timestamps as evidence.
**If nothing fires at all** → `tickLoops` (30s timer in `main.ts`) or the master gate; confirm `loopsEnabled` actually true at runtime.

## Phase 3 — Self-paced and autonomous (LP tests 3–4)

Self-paced: `/loop keep summarizing the open file, pausing longer each round`.
**Expected:** the model calls `loop_control` with `continue` + its own delay — visible as rows in `tool_calls` (`SELECT tool_name,status FROM tool_calls ORDER BY rowid DESC LIMIT 20`), and the observed cadence varies.

Autonomous: `/loop --auto find typos in README`.
**Expected:** backlog seeds (`loop_backlog` rows); the model calls `loop_enqueue`/`loop_complete_task`; completed tasks are **not** redone (the progress-ledger idempotency); the loop self-terminates with a mission-complete/backlog-empty reason rather than running to a ceiling.

**If a completed task repeats** → ledger injection failing; inspect the iteration prompt actually persisted (it should carry settled-work state).
**If the model never calls the loop tools** → tool surface problem: are the loop tools present for the model this conversation? (Cheap-model cogency interacts here — record model id, this is exactly the campaign's frontier data.)

## Phase 4 — Ceilings and stop authorities (LP tests 5–6)

Set low ceilings (Settings → Loops or settings.json): `loopMaxIterations: 3`.
**Expected:** loop stops exactly at 3 with terminal reason `max-iterations` in the `loops` row / panel.

Repeat conceptually for: wall-clock (set `loopMaxWallclockMs` low; confirm it trips on **active_ms** — pause the loop mid-window and confirm paused time does NOT count), token budget (`loopTokenBudget` small), and the runaway floor (request `/loop 5s …` → interval clamps to ≥ 30s default floor).

Stop authorities, each must halt within one iteration: panel Pause (and Resume), panel Stop, model-side `loop_control stop`. **Stop/pause during a long-running turn must abort the in-flight turn** (JM-4/5) — start an iteration with a slow prompt and hit Stop mid-stream.

**0-disable semantics (verified against `loop-config.ts`):** ceilings (iterations/wallclock/tokens) treat 0 as disabled; `maxConcurrent` and `minIntervalSeconds` are floor-clamped to ≥ 1 and **cannot** be disabled. If you observe 0 behaving as "infinite concurrency", that's a defect, not a feature.

## Phase 5 — Adversarial trials (the historical failure modes as test cases)

Each of these once shipped broken; each must now pass:

| Trial | Method | Pass |
|---|---|---|
| Toggle-off mid-flight | disable `loopsEnabled` while a loop is active | no further firings; pending wake-ups held, not fired |
| Sleep/wake burst | let ≥3 intervals elapse in system sleep | wake-ups drain **sequentially**, no parallel LLM burst |
| Crash mid-iteration | kill the app process during a run | on relaunch, the recovery sweep settles the orphaned `running` run; no stuck state (`db-health.cjs` shows no phantom running loops) |
| Quit during turn | quit the app during an iteration | quit drains the in-flight turn (JM-7) |
| Wake-up cap | have the model schedule wake-ups repeatedly | hard cap at 10 pending per conversation |
| schedule_wakeup with loops off | fresh install, loops disabled, ask the model to schedule a wake-up | refused/gated — never fires a headless turn |

Record every trial outcome (pass/fail + evidence rows) — these become the AFTER doc.

## Phase 6 — Endurance soak (the frontier)

Proposal (owner-run, bounded): one autonomous loop with a 20-task synthetic backlog, ceilings at defaults, running unattended for 24h of machine uptime.

**Measurable pass criteria:** 0 ceiling violations; 0 overlapping `loop_runs` (assert by timestamp intersection); 0 repeated completed tasks; every iteration reconstructable from `loops`+`loop_runs`+`tool_calls`+`events` alone (audit completeness); token spend within budget accounting ±10%; app responsive after.

This soak, passed and written up, is the "safe local autonomy" milestone of `lamprey-research-frontier`.

---

## Solution menu for failures found (ranked; theory obligation each)

1. **Gate/mutex/ordering fix in loop-runner/controller** — first choice for overlap/gating findings. Obligation: explain the interleaving that produced the observation (timestamps), extend `loop-safety.test.ts` or a controller test to lock it.
2. **State-machine fix in loop-store transactions** — for stuck statuses/orphans. Obligation: show which transition wasn't transactional; add a node:sqlite integration case.
3. **Prompt/ledger content fix** — for repeated tasks or incoherent iterations. Obligation: show the exact persisted prompt vs expected; measure bytes (prompts are budgeted — `lamprey-diagnostics-and-tooling`).
4. **Ceiling accounting fix** — for budget drift. Obligation: numeric before/after on the same recorded run.
5. **New watchdog/recovery machinery** — last resort; new machinery must itself be gated by `loopsEnabled` and source-locked.

## Known wrong paths (fenced off — do not go here)

- **Renderer-driven wake-ups** (the original G1 scaffold). Turns run in the main process through `setLoopTurnRunner` only.
- **Any loop entry point not gated by `loopsEnabled`** (the LP-4 P0). If you add an entry point, extend `loop-safety.test.ts` first.
- **Calendar-time ceilings.** Wall-clock means `active_ms` (working time) since v18 (JM-6).
- **Assuming 0 disables everything** — concurrency and the interval floor are clamped to ≥ 1 by design.
- **Parallel wake-up draining** — the sequential drain exists because of the sleep/wake burst incident.

## Validation & promotion protocol

1. Every campaign run produces a dated results doc (BASELINE/AFTER pattern — `lamprey-research-methodology`): configuration pinned, per-phase pass/fail, evidence rows quoted.
2. Fixes route through `lamprey-change-control`: trivial = standard gates; anything touching gating/ceilings/state machine = P-SPR + explicit approval.
3. Every fixed defect gets a locking test (usually source-lock or node:sqlite integration — `lamprey-validation-and-qa`).
4. Public claims about autonomy safety wait for the Phase 6 milestone (`lamprey-docs-and-writing` claims discipline).

## Provenance and maintenance

Grounded in `PLANNING/LP_SMOKE_PLAYBOOK.md` (tests 0–7), the JM Track A remediation (DEVLOG 2026-07-02), `loop-config.ts` clamp semantics (verified 2026-07-02), and the loop test suite filenames (verified present). At v0.16.0. GUI phases are owner-run; nothing here has been live-verified in this authoring session — that is the campaign's point.

Re-verify:
- Test files: `ls electron/services/loop-*.test.ts`
- Gate lock: `npx vitest run electron/services/loop-safety.test.ts`
- Clamp semantics: `sed -n '/resolveLoopConfig/,/^}/p' electron/services/loop-config.ts`
- Playbook: `cat PLANNING/LP_SMOKE_PLAYBOOK.md`
