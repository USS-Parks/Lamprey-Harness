# WM_AFTER.md — Workspace World Model phase, after measurement (WM-18)

Recorded 2026-09-21 at the WM-19 wrap. Companion to `PLANNING/WM_BASELINE.md`.
This is the honest post-phase state: what is proven in CI now, what awaits the
owner's machine, and the residual gaps.

## 1. What shipped

The full GAVEL mechanism, translated to the workspace, ON by default
(`workspaceWorldModel: 'full'`), `'off'` byte-compatible with the pre-phase
dispatch:

- **Verify** (WM-2/WM-3): every mutating tool call checked against typed
  preconditions on the live workspace before dispatch; doomed calls return a
  structured verdict (JM-10 shape) instead of executing.
- **Repair** (WM-4): deterministic non-mutating rewrites — path normalization,
  unique-basename resolution, whitespace re-anchor — with a visited set, edit
  cap, and best-candidate retention; no LLM round trip.
- **Rollforward** (WM-5): whole tool-call batches simulated on a shared overlay
  so a cross-call doom rejects the plan before anything mutates.
- **Budget + downgrade** (WM-6): per-turn intervention ceiling with an honest
  downgrade that cannot re-arm within a turn.
- **Goal extraction + ledger + follow-through** (WM-7/8/9): typed predicates
  extracted at turn start, tracked on the existing GA goals store, and driving
  bounded continuation rounds until met or capped.
- **Search pruning** (WM-10), **location beliefs** (WM-11), **belief-ordered
  subtasks** (WM-12).
- **Settings + parity + UI** (WM-13), **audit + After-action** (WM-14).

## 2. Measured now (CI-provable, this machine)

- **World-model phase test suites: 15 files, 163 tests, all passing.**
  (validate, repair, rollforward, budget, safety, workspace-world-model,
  tool-action-semantics, goal-extraction, goal-ledger, goal-followthrough,
  location-beliefs, subtask-ordering, after-action tally, dispatch integration,
  bench self-test.)
- **Prompt-surface byte delta: ZERO.** `system-prompt-builder.ts` and
  `core-tool-names.ts` were not touched this phase; the byte-guard suite
  (`system-prompt-builder.test.ts`, 62 tests) still passes. This is the thesis
  made concrete: the controls live entirely outside the model, so a cheap model
  gains reliability without spending a single extra prompt byte on instruction.
- **Off-mode inertness, non-mutating repair, no-re-arm budgets, defect-
  degrades-to-dispatch:** source-locked in `world-model-safety.test.ts` (14).
- **Bench harness** proven by known-bad/known-good self-test
  (`bench/wm/harness.test.ts`, 7); catalog is **8 single + 2 multi** tasks.

## 3. Awaiting the owner's machine (honest gaps)

- **The live bench numbers.** The pre-registered margins in
  `PLANNING/WM_BASELINE.md` §6 and `PLANNING/WM_SMOKE_PLAYBOOK.md` require
  Qwen3-8B/4B via Ollama and the built app. Not run here — this session has no
  GUI and no local model. Until the owner runs WM-17, the parity claim
  ("Qwen-class models complete measurably more per LLM call") is **supported by
  the mechanism and its unit proofs, not yet by a live number.** Status: OPEN.
- **The replay corpus** (`bench/wm/replay/`) holds only its README until the
  WM-0 capture protocol is run; the deterministic layers are covered by the
  pure suites and labeled-synthetic fixtures in the meantime.
- **GUI pass of the World model settings tab and the After-action World-model
  section** is an owner first-install check, like every prior phase's UI.

## 4. Corrections to the build record

- The WM-15 DEVLOG entry said "9 single + 2 multi" bench tasks. The catalog has
  **8 single + 2 multi** (`grep -c "id: 'single/"` = 8). The DEVLOG is
  append-only; this note is the correction of record.

## 5. Honest scope of the claim

Expect gains smaller than the paper's 41→92. GAVEL's world has 9 primitives and
fully formalizable goals; a workspace has 46+ tools and goals that are only
partially formalizable, and the paper's own residual failures were mostly
instruction grounding (21 of 38), which a world model does not fix. The bench
catalog is a representative floor across rename/guard/create/delete/config/
nested-edit/append/multi-part shapes, not a universal sample. What this phase
proves in CI: the deterministic layer is correct, inert when off, and free of
prompt cost. What it does NOT yet prove: the size of the live gain. That number
is the owner's to measure against margins already fixed in writing.

---

Authored and reviewed by Basho Parks, copyright 2026
