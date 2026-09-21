# WM_SMOKE_PLAYBOOK.md — Workspace World Model live evidence gate (WM-17)

The owner-run protocol that turns the phase's pre-registered claims
(`PLANNING/WM_BASELINE.md` §6) into measured numbers. It mirrors the paper's
three experiments: single-task reliability, multi-task execution, and the
does-scaling-replace-it check. The expected observations are written down
HERE, before the run, per `lamprey-research-methodology`; a run that misses
them is recorded as a miss in `PLANNING/WM_AFTER.md`, not explained away.

Everything below needs the built app and a live model, so it is owner-run on a
machine with the GUI and provider access. The bench harness itself
(`bench/wm/harness.test.ts`) is what CI proves; these numbers come from here.

---

## 0. Setup

1. Build: `npx electron-vite build`.
2. Model: `ollama serve` with `qwen3:8b` and `qwen3:4b` pulled; select the model
   in Lamprey. For the frontier row, any keyed provider model (e.g. a Claude or
   GPT model already configured).
3. Confirm the world-model tab (Settings → Advanced → World model) shows the
   four modes.
4. Bench invocation: the runner is `node scripts/wm-bench.cjs --bench <b> --out <f>`
   launched inside the built app's bench bootstrap (see `bench/wm/README.md`).
   Run five seeds per configuration; report mean ± spread.

---

## 1. Experiment 1 analog — single-task reliability (Qwen3-8B and Qwen3-4B)

Sweep `workspaceWorldModel` across `off`, `verify`, `repair`, `full` on the
`single` bench.

**Pre-registered expectations (the phase's claims):**
- `off` is the floor. Qwen3-8B off should sit low — the paper's llm-only
  single-task was 41.2%; expect the workspace analog in the same low band.
- `repair` beats `verify` by **≥ 8 points** at equal-or-fewer LLM calls per
  completed task (the `gavel-basic`-beats-SayPlan finding: graph-derived repair
  without re-querying the model).
- `full` ≥ `repair` on success, and **`full` beats `off` by ≥ 20 points**.
- LLM calls per completed task: `repair` ≤ `verify` ≤ `off`-that-completes.
  Repair must not cost extra model calls — that is its entire point.

Record per mode: success %, LLM calls per completed task, first-dispatch
validity, interventions (verdicts + repairs), net tokens per completed task.

---

## 2. Experiment 2 analog — multi-task execution (Qwen3-8B)

Run the `multi` bench in `off` and `full`.

**Pre-registered expectations:**
- `off` multi-task success is low (the paper's llm-only multi was 19.9% — the
  compounding-failure regime).
- **`full` beats `off` on multi-task success by ≥ 25 points.**
- Follow-through rounds used per completed task is bounded (≤ the configured
  ceiling) and the After-action World-model section shows goals met > goals
  unmet on the successes.

Record per mode: success %, follow-through continues/exhausted, goals met/unmet,
LLM calls per completed task.

---

## 3. Experiment 3 analog — does scaling replace the world model?

On the same `single` bench, one frontier-keyed model row, `off` vs `full`.

**Pre-registered expectation (reported, not margin-gated):**
- The frontier model `off` scores higher than Qwen `off` (scaling helps
  semantic planning) but still leaves action-level failures.
- `full` does not reduce the frontier model's success and closes its residual
  applicability failures — the paper's complementarity finding. Qwen3-4B + full
  should approach or beat the frontier model run bare, which is the cheap-model
  thesis with a number behind it.

---

## 4. Verdict

The phase's live claim PASSES only if §1 and §2's four margins all hold on
Qwen3-8B. Any miss is written into `PLANNING/WM_AFTER.md` as a miss with the
measured number, and the default mode is reconsidered there. A pass is
reproducible: the same seeds, same fixtures, same margins.

Residual honesty: the fixture catalog is a representative floor
(`bench/wm/README.md`), so a pass here is evidence the mechanism works on these
shapes, not a universal guarantee. Extending the catalog strengthens the claim.

---

Authored and reviewed by Basho Parks, copyright 2026
