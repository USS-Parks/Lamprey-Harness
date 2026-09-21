# Lamprey Workspace Bench (LWB)

The measurement rig for the Workspace World Model phase (WM-15). It exists to
answer one question with numbers, not impressions: does the world model move
task success and LLM-calls-per-task for Qwen-class models, per the margins
pre-registered in `PLANNING/WM_BASELINE.md` §6?

## What's here

- `tasks.ts` — the task catalog. Each `BenchTask` is self-contained: a fixture
  tree (inline file contents), an instruction `prompt`, and typed
  `GoalPredicate`s in the exact shape the product extracts and checks. Two
  benches: `single` (long-horizon single edits, Experiment 1 analog) and
  `multi` (independent multi-part instructions, Experiment 2 analog).
- `harness.ts` — pure core: `materializeTask` writes a fixture into a
  workspace, `evaluateTask` scores its predicates through
  `electron/services/goal-predicate-eval` (the SAME engine follow-through
  uses in the product), `summarize` aggregates per-bench success.
- `harness.test.ts` — the predicate-engine self-test. Proves a freshly
  materialized fixture fails its goals and a correctly-solved one passes, so a
  live run's numbers mean what they claim. Runs in the normal `vitest` gate.
- `../../scripts/wm-bench.cjs` — the live runner. Owner-invoked, never CI. It
  drives each task through a real Lamprey turn (`runHeadlessTurn`) against
  whatever model the local settings name, evaluates, and writes a metrics
  JSON. It requires the built main process; without it, it prints setup
  guidance and exits non-zero rather than pretending to have run.

## Running it live

Live runs need the built app and a model (Ollama `qwen3:8b` / `qwen3:4b`, or a
keyed provider). The full protocol — modes to sweep, seeds, the frontier row —
is `PLANNING/WM_SMOKE_PLAYBOOK.md`. The self-test alone gates the harness in
CI; the success numbers come from the owner's machine.

## Honest scope

The catalog is a representative floor (single-digit tasks per bench), not the
30+20 the plan sketched — enough to exercise the harness across rename, guard,
create, delete, config, nested-edit, append, and multi-part shapes. Extending
it is adding entries to `tasks.ts`; the harness and self-test scale as-is.

---

Authored and reviewed by Basho Parks, copyright 2026
