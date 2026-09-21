# LAMPREY_WORLD_MODEL_PLAN.md — Workspace World Model Phase (WM-0–WM-19)

**Source paper:** GAVEL: Graph World Models for Verified and Efficient Long-Horizon LLM Task
Planning (Wang, Hsu, Mehta, Kim, Dou, Pajic — arXiv:2609.19315, Sep 2026).

**Mission.** Attain parity with the paper's long-horizon reliability and follow-through
inside Lamprey, for open-weight models of the Qwen class. GAVEL's full mechanism, not a
subset: an explicit world model that rolls entire plans forward before execution, repairs
mechanically derivable failures without an LLM round trip, returns structured verdicts for
the rest under a bounded budget, extracts goal predicates from the instruction, keeps
working until unmet goals reach zero or a ceiling is hit, tracks restoration constraints,
maintains beliefs over unobserved locations, and reorders remaining subtasks online as
observations arrive. Paper results this targets: Qwen3-8B single-task 41.2% → 91.8%,
multi-task 19.9% → 92.6%, repair-only beating feedback-only replanning at a third of the
LLM calls, and Qwen3-4B plus the world model (75.2%) beating GPT-5.6 Sol (24.6%) and
Claude Sonnet 5 (38.6%) running bare.

---

## §0.5 — Paper-to-Lamprey mapping (complete)

| GAVEL concept | Lamprey implementation | Seam |
| --- | --- | --- |
| Scene graph G = (V, E, Φ) | Per-conversation workspace state: files (hash at read), dirs listed, searches run, writes, git snapshot, processes started | new `electron/services/workspace-world-model.ts` (state pattern: `tool-unlock-state.ts`) |
| Action preconditions/effects ⟨pre, eff⟩, transition f(G, a) | Declarative per-tool semantics table; `mutates` flag on `LampreyToolDescriptor` is the existing anchor | new `electron/services/tool-action-semantics.ts` |
| Plan rollforward (Alg. 1 lines 10–19) | Whole-sequence simulation on a copied graph: multi-call batches and plan-mode step lists roll forward before the first dispatch; per-call gate remains the runtime backstop | new `electron/services/world-model-rollforward.ts` + `chat-tool-dispatch.ts` |
| VALIDATE verdict ω (applicability, unmet goals, safety) | Structured verdict: precondition violations, unmet goal predicates, unrestored constraints | new `electron/services/world-model-validate.ts` |
| REPAIR (Alg. 2: visited set, rank, best candidate) | Deterministic non-mutating observation insertion + argument normalization + restoration-action synthesis, cycle-safe, best-candidate retention | new `electron/services/world-model-repair.ts` |
| COMPLAINT prompt, LLM budget T | Structured verdict fed back to the model, bounded rounds per turn, honest downgrade on thrash (FC-10 pattern) | dispatch + turn loop |
| Task understanding (decompose, extract objects/goals) | Schema-validated structured extraction at turn start: subtasks + typed goal predicates (file-state, command-exit, restoration). Deterministic fast-path for explicit predicates; extraction model configurable, defaults to the conversation model. No training, no LoRA | new `electron/services/goal-extraction.ts` |
| unmet(g, G) = ∅ goal check + follow-through | Goal ledger on the existing GA goals store (`plan-goal-persistence.ts`); deterministic turn-end evaluation via the `verify-workspace` runner and file-state checks; unmet goals drive bounded continuation rounds instead of settling the turn as finished | new `electron/services/goal-ledger.ts`, `goal-followthrough.ts` |
| Trace-level safety safe(a): restore opened/toggled things | Restoration constraints: processes started get stopped, watch modes exited, stashes popped, temp scaffolding removed; violations synthesize restoration actions or verdicts | semantics table effects + validate |
| Belief b_o(r) over unobserved object locations | Deterministic location beliefs for named-but-unlocated files/symbols: candidate scopes ranked from repo layout conventions, filename index, and RAG embeddings when a collection exists; pruned by search observations exactly as the paper prunes searched rooms | new `electron/services/location-beliefs.ts` |
| Expected search cost C_srch, cost model (h, A) | Expected-effort scores per candidate scope (files-to-scan proxy for traversable area); pairwise subtask transition costs from shared-scope overlap | `location-beliefs.ts` + `subtask-ordering.ts` |
| Online reordering after each completed task (Eq. 7) | Execute the cheapest-first subtask only, update beliefs from its observations, re-rank the remainder; N ≤ 6 so exact enumeration, matching the paper | new `electron/services/subtask-ordering.ts` |
| Goal predicates in evaluation | Same predicate engine reused by the bench runner, so the bench measures the product mechanism, not a parallel one | `bench/wm/` |

**Relation to deleted machinery (read once, then it is settled).** The Unburdening Phase
deleted the composer-era proof gate: receipt scans, trust pills, and a banner that judged
the model's claim after the fact. The goal ledger here is a different object: typed
predicates extracted from the instruction, evaluated deterministically, driving bounded
continuation the way GAVEL's unmet(g) drives replanning. It gates nothing retroactively and
issues no trust verdicts; it makes the turn keep working. The deleted subsystems stay
deleted.

**Pre-registered claims (per `lamprey-research-methodology`; numbers set in WM-0, before
any live run).** Expect gains smaller than 41→92: the paper's world has 9 primitives and
fully formalizable goals, a workspace has 46+ tools and partially formalizable ones. The
phase passes only if, on the bench with Qwen3-8B: full mode beats today's Lamprey on
multi-step task success by the WM-0 margin at equal or fewer LLM calls per completed task,
and repair-only beats verdict-only the way `gavel-basic` beat SayPlan-style feedback.
A frontier-model row tests the paper's complementarity finding. Misses get recorded as
misses in WM_AFTER.md.

---

## §0 — Governance

### Goal (one sentence)
Give Lamprey GAVEL's full mechanism: a deterministic workspace world model that rolls
plans forward before execution, repairs what its own semantics determine, budgets
structured feedback for the rest, extracts goal predicates and follows through until
unmet goals reach zero or a ceiling, and orders multi-part work by belief-weighted
expected cost, so Qwen-class models complete long-horizon coding tasks at rates the
paper demonstrates are reachable.

### Scope (what this phase touches)
- `electron/services/workspace-world-model.ts` (+ test, new) — observation state
- `electron/services/tool-action-semantics.ts` (+ test, new) — preconditions/effects/restoration
- `electron/services/world-model-rollforward.ts` (+ test, new) — whole-plan simulation
- `electron/services/world-model-validate.ts` (+ test, new) — verdict construction
- `electron/services/world-model-repair.ts` (+ test, new) — repair loop
- `electron/services/goal-extraction.ts` (+ test, new) — subtask + predicate extraction
- `electron/services/goal-ledger.ts`, `electron/services/goal-followthrough.ts` (+ tests, new) — unmet-goal tracking and bounded continuation, on the GA goals store
- `electron/services/location-beliefs.ts`, `electron/services/subtask-ordering.ts` (+ tests, new)
- `electron/services/chat-tool-dispatch.ts`, `electron/ipc/chat.ts` — wiring points, gated
- `electron/services/plan-goal-persistence.ts` — additive ledger fields only if required; no schema rewrite
- `electron/services/default-app-settings.ts`, `electron/ipc/settings.ts`, `src/stores/settings-store.ts`, parity test — new settings keys
- `src/components/settings/` — World model section; Plans & goals surface shows ledger goals
- `electron/services/after-action-report.ts` + renderer panel — verdict/repair/continuation counts
- `bench/wm/` (new) + `scripts/wm-bench.cjs` (new) — fixtures, predicate engine reuse, headless runner, metrics JSON
- `PLANNING/WM_BASELINE.md`, `PLANNING/WM_SMOKE_PLAYBOOK.md`, `PLANNING/WM_AFTER.md` (new)
- `DEVLOG.md`, `README.md`, `CLAUDE.md`, `package.json` version bump (wrap prompt only)

### Non-goals (explicitly out of scope)
- **No training.** GAVEL's LoRA adapters are replaced by schema-validated structured
  extraction; "No training UI" stands.
- **No revival of composer-era machinery.** No receipt scans, no trust pills, no
  after-the-fact claim gating. See §0.5.
- **No new providers, model rows, cloud, or telemetry.**
- **No behavior change when off.** `workspaceWorldModel: 'off'` is byte-compatible with
  today's dispatch and turn loop, source-locked at every entry (the `loop-safety.test.ts`
  pattern).
- **Mutating repairs are never automatic.** Auto-inserted actions are non-mutating and
  approval-free (read, list, search) plus the restoration class the user's own plan
  implied (stop a process this turn started). Anything else demotes to a verdict.
- **Cross-writer invalidation is v1-limited.** Another conversation, loop, or
  `multi_agent_run` child writing the same workspace degrades observations to unknown;
  full shared-state modeling is a follow-on.

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run <the_test_files_this_prompt_touches>` — clean
4. Any prompt touching `electron/ipc/chat.ts` or `electron/services/chat-tool-dispatch.ts` also runs `npm run verify:proof -- --no-tests` — exits 0
5. Final phase gate (WM-19): full `npx vitest run` + `npm run build` + `npm run verify:proof`

### Commit discipline
- One commit per prompt, present-tense imperative subject (`feat(world-model): WM-3 …`)
- DEVLOG entry per prompt under `## <YYYY-MM-DD> — Workspace World Model Phase`
- No squashing across prompts; no co-author trailer
- Every commit ends `Authored and reviewed by Basho Parks, copyright 2026`
- No push until the wrap prompt unless the user explicitly says push earlier

### Worktree / branch
- Branch: `feat/workspace-world-model` (separate git worktree if run parallel to another track)

### Settings (defaults ship ON; `'off'` is the escape hatch)
- `workspaceWorldModel: 'off' | 'verify' | 'repair' | 'full'` — default **`'full'`**
  (`'full'` = repair + goal follow-through + ordering; `'repair'` = no follow-through;
  `'verify'` = verdicts only)
- `worldModelRepairBudget` — default 5 interventions per turn, 0 disables repair
- `worldModelFollowThroughRounds` — default 5 (the paper's T), 0 disables follow-through;
  every continuation round is also bounded by the existing turn/loop ceilings, which stay
  the hard caps
- `worldModelExtractionModel` — optional model id for goal extraction; unset = the
  conversation's model

### Era-lock
This is the third deliberate extension past the Opus 4.5 era-lock (after Loop and Agentic
Orchestration), shipping ON by default per the owner's direction that long-horizon parity
with the paper is the point of the phase. Approval of this plan is the authorization.

### Completion criteria
- All WM-0–WM-19 `[x]`, final gate green, DEVLOG phase-complete entry, CLAUDE.md Current
  State updated, version bumped to **v0.34.0**.
- WM_AFTER.md records bench numbers against the WM-0 pre-registered margins for Qwen3-8B
  (and Qwen3-4B where the owner's hardware allows), or records honestly that the live run
  awaits the owner's machine, with the replay-suite numbers standing in.

### Approval state
- **APPROVED 2026-09-20** by the owner: "Run the World Model Plan STS now with my full
  approval for commit and push to main after every verified successful prompt has been
  completed." Two §0 overrides recorded in WM_BASELINE.md §1: push to `main` after every
  verified prompt (supersedes push-at-wrap), and work on the session branch
  `claude/lamprey-harness-pspr-vltrbb` pushed to both refs (supersedes the
  `feat/workspace-world-model` line). Era-lock authorization carried by this approval.

---

## §1 — Prompt Roster

### Track A — Substrate

### **WM-0 — Baseline, metrics, pre-registered margins**
- [x] `PLANNING/WM_BASELINE.md`: mapping table with `file:line` anchors; current
      dispatch-order byte-baseline inside `resolveSingleToolCall`; metric definitions
      (first-dispatch validity, LLM calls per completed task, bench single/multi success,
      continuation rounds used, net tokens per task); the pre-registered pass margins for
      §0.5; the live-capture protocol (10 Qwen3-8B asks via Ollama, transcripts retained)
      feeding WM-16 fixtures.
- Verify: doc-only; gate 1–2.

### **WM-1 — Workspace observation state**
- [x] `workspace-world-model.ts` + test: per-conversation state — files observed (hash,
      mtime at read), dirs listed, searches (query, scope, hits), writes, processes
      started, git snapshot; staleness marks; updates fed from tool results (reads/lists
      observe, `apply_patch` re-observes its writes, shell writes invalidate what
      `inspectShellCommand` attributes and degrade to unknown otherwise). Cleared on
      conversation delete. Pure, injectable clock, no DB.
- Verify: gate 1–3.

### **WM-2 — Action semantics and restoration constraints**
- [x] `tool-action-semantics.ts` + test: declarative ⟨pre, eff⟩ for core native tools —
      `apply_patch` (exists, observed, fresh), create (parent exists, target absent),
      delete (exists, observed), path-referencing shell commands (attributable paths
      exist); effects observe/write/invalidate; restoration constraints registered as
      trace obligations (process started ⇒ must stop; stash pushed ⇒ must pop; watch mode
      entered ⇒ must exit). Unknown and MCP tools pass through. Source-lock: every
      `mutates: true` core tool has an entry or a named exemption.
- Verify: gate 1–3.

### **WM-3 — VALIDATE and the per-call gate**
- [x] `world-model-validate.ts` + test: verdict
      `{applicable, violations[], unmetGoals[], unrestored[]}` from a pending call, its
      semantics, and state. Wire into `resolveSingleToolCall` after schema validation,
      before approval, gated on the setting; violated calls return the verdict as a
      corrective tool result (JM-10 shape) instead of dispatching. `world_model.verdict`
      audit events (kinds and path subjects, never argument payloads).
- Verify: gate 1–4.

### **WM-4 — REPAIR loop**
- [x] `world-model-repair.ts` + test, mirroring Alg. 2: visited set, bounded edits,
      best-candidate rank. Repairs: auto-observe (read/list the violated precondition
      implies, then re-validate); freshness repair (re-read, proceed only if the hunk
      still anchors); argument normalization (separators, unique workspace-relative
      resolution); restoration synthesis (stop the process this turn started). Auto-read
      results ride the HY3 spill valve with a size cap. Cycle fixture and
      stale-then-reanchor fixture required.
- Verify: gate 1–4.

### Track B — Long horizon

### **WM-5 — Plan rollforward**
- [x] `world-model-rollforward.ts` + test: simulate an ordered sequence of tool calls on
      a copied graph via f(G, a); stop at first violation; return the trace verdict
      (violation step, state at failure, unmet goals at horizon, unrestored obligations).
      Applied to multi-call batches from one model turn and to plan-mode step lists
      before the first call dispatches; per-call gate (WM-3) remains the backstop for
      calls arriving one at a time.
- Verify: gate 1–4.

### **WM-6 — Structured complaint and turn budget**
- [x] Complaint format for rollforward and per-call verdicts: violated precondition or
      unmet goal, the state facts proving it, minimal fix, compact enough for a 4B model.
      Per-turn budget `worldModelRepairBudget` across repairs and verdicts; on exhaustion
      dispatch downgrades for the rest of the turn and emits `world_model.downgrade`
      (FC-10 pattern). Best-candidate plan retained across complaint rounds as Alg. 2
      retains π*.
- Verify: gate 1–4.

### **WM-7 — Goal extraction**
- [x] `goal-extraction.ts` + test: at turn start (mutating-intent turns), decompose the
      instruction into subtasks and typed goal predicates — file-state (exists, contains,
      absent), command-exit (via the `verify-workspace` runner), restoration. Deterministic
      fast-path for explicitly stated predicates; otherwise one schema-validated
      structured call to `worldModelExtractionModel` (default: conversation model), output
      rejected and retried once on schema failure, then degraded honestly to no-ledger for
      the turn. Extraction failures never block the turn.
- Verify: gate 1–3.

### **WM-8 — Goal ledger on the GA goals store**
- [x] `goal-ledger.ts` + test: persist extracted subtasks/predicates through
      `plan-goal-persistence.ts` (additive fields only if needed), lifecycle wired to the
      existing Plans & goals surface so extracted goals are visible, editable, and
      cancellable by the user. Deterministic `unmet(g, workspace)` evaluation using the
      predicate engine; evaluation results recorded as goal completion evidence
      (the GA store already has the column).
- Verify: gate 1–3.

### **WM-9 — Follow-through**
- [x] `goal-followthrough.ts` + test: at turn end, evaluate the ledger; if unmet goals
      remain and rounds remain (`worldModelFollowThroughRounds`, default 5), inject the
      structured unmet-goal complaint as a continuation round of the same turn instead of
      settling; on exhaustion or a `blocker`, settle honestly with the unmet list in the
      reply metadata and the ledger left open. Existing turn/loop ceilings remain the
      hard caps; user cancel always wins immediately (JM-3 abort path). Source-lock: the
      continuation loop cannot re-arm after exhaustion within a turn.
- Verify: gate 1–4.

### Track C — Beliefs and ordering

### **WM-10 — Search ledger and pruning**
- [x] Zero-match pruning on WM-1 search records: exact-repeat searches return a
      deterministic corrective result citing the ledger; after three zero-match searches
      (CR-9's threshold) the result includes covered and uncovered scopes.
- Verify: gate 1–3.

### **WM-11 — Location beliefs**
- [x] `location-beliefs.ts` + test: for a named-but-unlocated file/symbol, rank candidate
      scopes from repo layout conventions and a filename index, plus RAG embedding
      similarity when a collection exists (the RSN analog, deterministic at inference);
      full distribution retained, never collapsed to the top candidate (the paper's
      47%-top-1 lesson); search observations prune support exactly as searched rooms are
      pruned.
- Verify: gate 1–3.

### **WM-12 — Expected cost and online subtask reordering**
- [x] `subtask-ordering.ts` + test: expected-effort score per candidate scope
      (files-to-scan proxy), first-task costs h and pairwise transition costs A from
      shared-scope overlap, exact enumeration for N ≤ 6 (Eq. 7); execute the cheapest
      admissible first subtask only, update beliefs from its observations, re-rank the
      remainder; an ordering whose concatenated rollforward fails falls through to the
      next, as the paper does for cross-task interference.
- Verify: gate 1–3.

### Track D — Product surface

### **WM-13 — Settings, parity, UI**
- [x] The four settings keys in `DEFAULT_APP_SETTINGS`, renderer mirror, parity test;
      Settings → World model section (mode, budgets, extraction model), Loops-tab
      pattern.
- Verify: gate 1–3.

### **WM-14 — Audit and After action**
- [x] `world_model.verdict` / `.repair` / `.downgrade` / `.followthrough` events in the
      existing events table (ids, kinds, path subjects only); After-action World model
      section with the four counts; repaired calls carry a metadata note on their tool
      result row; extracted goals already visible via Plans & goals (WM-8).
- Verify: gate 1–3.

### Track E — Evidence

### **WM-15 — Bench: single-task and multi-task**
- [x] `bench/wm/`: 30 single-turn long-horizon fixtures (Experiment 1 analog) and 20
      multi-part fixtures with 2–5 independent subtasks each (Experiment 2 analog), goal
      predicates expressed in the SAME predicate engine the product uses; fixture trees +
      expected-state definitions; `scripts/wm-bench.cjs` drives `runHeadlessTurn` per
      task against the locally configured provider (Ollama Qwen included), evaluates,
      writes metrics JSON (success, validity, LLM calls, continuation rounds,
      interventions, tokens). Owner-invoked, never CI.
- Verify: gate 1–3 + predicate-engine self-test on a known-good and known-bad fixture.

### **WM-16 — Replay corpus and zero-delta locks**
- [x] Record/replay seam at the provider boundary: captured transcripts (WM-0 protocol
      output; synthetic and labeled as such until capture lands) re-drive dispatch,
      rollforward, repair, and follow-through deterministically in vitest, no network.
      `world-model-safety.test.ts`: `'off'` byte-compatible at every entry; auto-action
      allowlist non-mutating by construction; budget and follow-through exhaustion cannot
      re-arm within a turn; extraction failure cannot block a turn.
- Verify: gate 1–4, full replay suite green.

### **WM-17 — Smoke playbook (Experiments 1–3 analog)**
- [x] `PLANNING/WM_SMOKE_PLAYBOOK.md`: owner-run protocol — Qwen3-8B and Qwen3-4B via
      Ollama across both benches in `'off'`, `'verify'`, `'repair'`, `'full'`; one
      frontier-keyed row for the complementarity check; the WM-0 margins restated beside
      each expected observation; capture instructions feeding WM-16 fixtures.
- Verify: doc-only; gate 1–2.

### **WM-18 — AFTER doc**
- [x] `PLANNING/WM_AFTER.md`: replay-suite numbers, prompt-surface byte delta (expected
      zero: the controls live outside the model, which is the thesis), live bench results
      against the pre-registered margins if run by wrap time, else the honest awaiting
      note; residual gaps named.
- Verify: doc-only; gate 1–2.

### **WM-19 — Phase wrap**
- [x] Full gate green (vitest + build + verify:proof), DEVLOG phase-complete entry,
      CLAUDE.md Current State + reference-only list updated, README currency,
      `package.json` → **0.34.0**. Release/Bucket is a separate owner decision after the
      playbook verdict.
- Verify: final phase gate (§0 item 5).

---

Authored and reviewed by Basho Parks, copyright 2026
