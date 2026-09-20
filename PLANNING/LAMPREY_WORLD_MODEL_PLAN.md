# LAMPREY_WORLD_MODEL_PLAN.md — Workspace World Model Phase (WM-0–WM-13)

**Source paper:** GAVEL: Graph World Models for Verified and Efficient Long-Horizon LLM Task
Planning (Wang, Hsu, Mehta, Kim, Dou, Pajic — arXiv:2609.19315, Sep 2026).

**Why this paper matters to Lamprey.** GAVEL puts a deterministic world model between the
LLM and execution. The model rolls each proposed action forward against typed
preconditions and effects, repairs failures whose corrections follow mechanically from
those semantics without re-querying the LLM, and returns only genuinely semantic failures
as structured feedback. Results on BEHAVIOR-1K: Qwen3-8B single-task success 41.2% → 91.8%,
multi-task 19.9% → 92.6%. The variant that never re-queries the LLM (repair only,
`gavel-basic`) beat feedback-only replanning on Qwen3-4B by 12.3 points while using 1 LLM
call instead of 3.4. Most striking for us: Qwen3-4B plus the world model (75.2%) beat
GPT-5.6 Sol (24.6%) and Claude Sonnet 5 (38.6%) running bare, and the world model still
helped the frontier models (both reached ~99%). This is the cheap-model thesis from
`lamprey-research-frontier` with published numbers behind it: deterministic
verification and repair outside the model recovers most of what model scale buys.

**The Lamprey translation.** Lamprey's environment is not a kitchen; it is a workspace.
The analog of GAVEL's scene graph is a typed model of workspace state: which files exist,
which the model has actually read this conversation, whether they changed since that read,
which directories were listed, which searches ran and what they covered. The analog of
action preconditions is what must be true before a tool call can succeed: `apply_patch`
needs the target to exist, to have been observed, and to be unchanged since observation;
a file create needs its parent directory; a shell command referencing a path needs that
path. The analog of GAVEL's model-derived repair is inserting the observation a human
operator would insert: read the file before patching it, re-read a stale file and re-anchor
the hunk, list the directory the model is guessing about. None of those repairs mutate
anything and none need an LLM round trip. What cannot be repaired mechanically goes back
to the model as a structured verdict, exactly as JM-10 already does for malformed
arguments. This phase extends that JM-10 idea from argument shape to workspace state.

---

## §0.5 — Paper-to-Lamprey mapping (read before arguing with the roster)

| GAVEL concept | Lamprey analog | Seam |
| --- | --- | --- |
| Scene graph G = (V, E, Φ) | Per-conversation workspace observation state: files (hash at read), dirs listed, searches run, git snapshot | new `electron/services/workspace-world-model.ts` (pattern: `tool-unlock-state.ts`) |
| Action preconditions/effects ⟨pre, eff⟩ | Declarative per-tool semantics table keyed by descriptor name; `mutates` flag already exists on `LampreyToolDescriptor` | new `electron/services/tool-action-semantics.ts`; registry at `electron/services/tool-registry.ts` |
| VALIDATE (roll forward, structured verdict ω) | Pre-dispatch check inside `resolveSingleToolCall`, corrective tool result on violation (JM-10 shape) | `electron/services/chat-tool-dispatch.ts` |
| REPAIR (Alg. 2: visited set, budget, best-candidate rank) | Deterministic insertion of non-mutating observation actions + argument normalization before dispatch | new `electron/services/world-model-repair.ts` |
| COMPLAINT prompt with budget T | Structured verdict result + per-turn budget with honest downgrade (FC-10 pattern) | dispatch path |
| Belief over unobserved object locations | Search ledger: queries/globs run, scopes covered, zero-match pruning | workspace-world-model state (extends CR-9) |
| Belief-aware task reordering (5.4% travel savings) | PARKED — weak analog for coding work; see non-goals | n/a |
| Task-understanding LoRA adapters | NOT PORTED — no training, standing decision | n/a |
| Goal predicates unmet(g, G) | Bench-runner-only goal checks (file state, command exit codes). Deliberately NOT an in-product completion gate: the Unburdening Phase deleted the proof gate and this phase does not revive it | `bench/wm/` only |

**Honesty section: what this will not do.**
- The paper's world has 9 primitives and fully formalizable goals. Lamprey has 46+ native
  tools plus MCP, and most user goals cannot be formalized. Expect the gains to be real but
  smaller than 41→92. The falsifiable claim we CAN make is narrower: first-dispatch tool-call
  validity and bench task success for Qwen-class models must move measurably (WM-11 sets the
  numbers before the live run, per `lamprey-research-methodology`).
- GAVEL's own residual failures were mostly instruction grounding (21 of 38), which a world
  model does not fix. Same will be true here.
- Auto-observed reads consume context. They ride the HY3 spill valve and a size cap; the
  bench measures net token cost, and if repair mode costs more than it saves on small
  models, the AFTER doc says so and the default gets revisited.
- Replay fixtures (WM-10) capture one model version's failure distribution and will rot.
  They lock the deterministic machinery, not model behavior.
- Cross-writer invalidation (a loop iteration or `multi_agent_run` child mutating the same
  workspace) is out of scope in v1: the state is per-conversation. A shell command whose
  written paths cannot be determined conservatively degrades observations to unknown rather
  than pretending freshness.

---

## §0 — Governance

### Goal (one sentence)
Put a deterministic workspace world model in front of tool dispatch that verifies each
proposed tool call against typed preconditions, repairs mechanically derivable failures
without an LLM round trip, and returns structured verdicts for the rest, so that compact
open-weight models (Qwen3-class) complete measurably more coding tasks per LLM call in
Lamprey.

### Scope (what this phase touches)
- `electron/services/workspace-world-model.ts` (+ test, new) — per-conversation observation state
- `electron/services/tool-action-semantics.ts` (+ test, new) — declarative preconditions/effects
- `electron/services/world-model-validate.ts` (+ test, new) — verdict construction
- `electron/services/world-model-repair.ts` (+ test, new) — repair loop (visited set, budget, rank)
- `electron/services/chat-tool-dispatch.ts` — the single wiring point, gated on the new setting
- `electron/services/default-app-settings.ts`, `electron/ipc/settings.ts`, `src/stores/settings-store.ts`, `electron/services/default-app-settings.test.ts` — new settings keys, parity-locked
- `src/components/settings/` — one new Settings section (World model)
- `electron/services/after-action-report.ts` + its renderer panel — verdict/repair/downgrade counts
- `bench/wm/` (new) + `scripts/wm-bench.cjs` (new) — fixture tasks, goal predicates, headless runner, metrics JSON
- `PLANNING/WM_BASELINE.md`, `PLANNING/WM_SMOKE_PLAYBOOK.md`, `PLANNING/WM_AFTER.md` (new)
- `DEVLOG.md`, `README.md`, `CLAUDE.md`, `package.json` version bump (phase-wrap prompt only)

### Non-goals (explicitly out of scope)
- **No proof-gate revival.** No in-product completion gating, no receipts requirement, no
  banner. Goal predicates exist only inside the bench runner. The Unburdening deletions stay
  deleted.
- **No training.** GAVEL's LoRA task-understanding adapters are not ported. Deterministic
  code only. "No training UI" remains a standing decision.
- **No plan-then-execute mode change.** Lamprey stays a per-action agent loop; the world
  model gates individual dispatches, it does not demand whole-plan generation.
- **No belief-aware task reordering.** The 5.4% travel savings does not translate to coding
  work at a value that justifies the machinery. Parked, not promised.
- **No new providers, no new model rows, no cloud, no telemetry.**
- **No behavior change when off.** `workspaceWorldModel: 'off'` must be byte-compatible with
  today's dispatch, source-locked the same way `loop-safety.test.ts` locks `loopsEnabled`.
- **Mutating repairs are never automatic.** Auto-inserted actions are restricted to
  non-mutating, approval-free descriptors (read, list, search). A repair that would require
  a mutation or an approval demotes to a verdict for the model.

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run <the_test_files_this_prompt_touches>` — clean
4. Any prompt that touches `electron/ipc/chat.ts` or `electron/services/chat-tool-dispatch.ts` also runs `npm run verify:proof -- --no-tests` — exits 0
5. Final phase gate (WM-13): full `npx vitest run` + `npm run build` + `npm run verify:proof`

### Commit discipline
- One commit per prompt, present-tense imperative subject (`feat(world-model): WM-2 …`)
- DEVLOG entry per prompt under a new `## <YYYY-MM-DD> — Workspace World Model Phase` section
- No squashing across prompts; no co-author trailer
- Every commit ends `Authored and reviewed by Basho Parks, copyright 2026`
- No push until the wrap prompt unless the user explicitly says push earlier

### Worktree / branch
- Branch: `feat/workspace-world-model` (separate git worktree if run parallel to another track)

### Decision points (answer at approval; recommendations inline)
1. **D1 — default mode.** `workspaceWorldModel: 'off' | 'verify' | 'repair'`.
   Recommendation: default **`'repair'`**. Rationale: `'verify'` is a natural extension of
   JM-10 corrective results (already default-on), and the repair tier only ever inserts
   non-mutating observations a careful operator would insert anyway. The conservative
   alternative is `'verify'` default with `'repair'` opt-in; `'off'` default would follow
   the Loop/AO precedent but makes the phase inert for the stated goal. Your call.
2. **D2 — bench scope.** Recommendation: 30 single-turn + 10 multi-step fixture tasks with
   deterministic goal predicates, runnable headless against any configured provider
   (including keyless Ollama). CI runs replay fixtures only; live Qwen runs are owner-run
   via the playbook. Larger is better science but this is the affordable floor.
3. **D3 — search ledger.** Recommendation: include (WM-6). It is the one cheap piece of
   GAVEL's belief machinery that maps cleanly (zero-match pruning, repeat-search rejection,
   extends CR-9). Say the word and it drops to keep the phase leaner.
4. **D4 — era-lock.** This is the third deliberate extension past the Opus 4.5 era-lock
   (after Loop and Agentic Orchestration). Approval of this plan is the authorization; if
   you want it gated OFF by default purely on era grounds, that is D1 answered `'off'`.

### Completion criteria
- All WM-0–WM-13 prompts `[x]`, final gate green, DEVLOG phase-complete entry written,
  CLAUDE.md "Current State" updated, version bumped to **v0.34.0**.
- WM_AFTER.md records measured bench numbers (llm-only vs verify vs repair) for at least
  Qwen3-8B, or records honestly that the live run awaits the owner's machine.

### Approval state
- **PENDING** — awaiting explicit user green light + STS instruction, with D1–D4 answered.

---

## §1 — Prompt Roster

### **WM-0 — Baseline and mapping record**
- [ ] Author `PLANNING/WM_BASELINE.md`: the paper-to-seam mapping table above expanded with
      cited `file:line` anchors; the current dispatch order inside `resolveSingleToolCall`
      (parse → schema validate → empty-params guard → shell inspection → approval → native
      dispatch) documented as the byte-baseline; metric definitions fixed before any code:
      first-dispatch validity rate, corrective-result rate per turn, LLM calls per completed
      task, bench task success, net tokens per task. Record the D1–D4 answers verbatim.
      Author the live-capture protocol (10 asks against Qwen3-8B via Ollama, transcripts
      retained) that feeds WM-10 fixtures; executing it is owner-run and not a blocker.
- Verify: doc-only; gate items 1–2 to prove the tree still compiles untouched.

### **WM-1 — Workspace observation state**
- [ ] New `electron/services/workspace-world-model.ts` + test. Per-conversation in-memory
      state (pattern: `tool-unlock-state.ts`): observed files with content hash and mtime at
      read; directories listed; searches run (query, scope, hit count); files written this
      conversation; staleness marks. Update entry points fed from tool results: reads and
      lists observe, `apply_patch` re-observes what it wrote, shell commands invalidate the
      paths `inspectShellCommand` can attribute and degrade to unknown when it cannot.
      State clears on conversation delete (JM-11 pattern). Pure module, injectable clock,
      no DB.
- Verify: gate 1–3 (`workspace-world-model.test.ts`).

### **WM-2 — Action semantics table**
- [ ] New `electron/services/tool-action-semantics.ts` + test. Declarative
      preconditions/effects keyed by descriptor name for the core mutating tools:
      `apply_patch` (target exists, observed, fresh), file create (parent exists, target
      absent), file delete (exists, observed), shell commands that reference workspace paths
      (paths exist where attributable). Precondition kinds: `exists`, `observed`, `fresh`,
      `parent-exists`, `absent`. Effects: observe, write, invalidate. Unknown tools and all
      MCP tools have no entry and pass through untouched. Source-lock test: every
      `mutates: true` core native tool either has an entry or sits on an explicit named
      exemption list in the same file, so the table cannot silently drift as tools are added.
- Verify: gate 1–3 (`tool-action-semantics.test.ts`).

### **WM-3 — VALIDATE wired into dispatch (verify mode)**
- [ ] New `electron/services/world-model-validate.ts` + test: given a pending tool call,
      its semantics entry, and WM-1 state, produce a structured verdict
      `{ applicable, violations: [{kind, subject, evidence, repairable}] }`. Wire into
      `resolveSingleToolCall` after schema validation and before approval, gated on
      `workspaceWorldModel !== 'off'`. In `'verify'` mode a violated call is not dispatched;
      the model receives a corrective tool result carrying the verdict (JM-10 shape, so
      every provider already knows how to consume it). Emit a `world_model.verdict` audit
      event (kinds and subjects, never argument payloads).
- Verify: gate 1–4 (`world-model-validate.test.ts` + dispatch tests).

### **WM-4 — REPAIR loop (repair mode)**
- [ ] New `electron/services/world-model-repair.ts` + test, mirroring GAVEL Alg. 2:
      visited-set against cyclic repair, bounded edit count, best-candidate rank so a
      non-monotonic edit chain still returns the best plan seen. Repairs implemented:
      (a) auto-observe — run the read or list the violated precondition implies, then
      re-validate; (b) freshness repair — re-read a stale target and proceed only if the
      patch still anchors, else verdict; (c) argument normalization — path separator and
      workspace-relative resolution when exactly one candidate matches. Auto-actions are
      restricted to non-mutating, approval-free descriptors; anything else demotes to a
      verdict. Auto-read results ride the HY3 spill valve with a size cap. Active only in
      `'repair'` mode.
- Verify: gate 1–4 (`world-model-repair.test.ts`, includes a cycle fixture and a
  stale-then-reanchor fixture).

### **WM-5 — Verdict format and budget**
- [ ] Structured complaint format finalized: violated precondition, the state facts that
      prove it, and the minimal fix, in that order, compact enough for a 4B model. Per-turn
      budget: at most `worldModelRepairBudget` (default 5) verdict-or-repair interventions
      per turn; on exhaustion, dispatch downgrades to `'verify'`-without-verdicts for the
      rest of the turn and emits a `world_model.downgrade` event (FC-10 pattern) so a
      thrashing model cannot loop forever against the gate.
- Verify: gate 1–4 (budget + downgrade tests).

### **WM-6 — Search ledger** *(drops if D3 says no)*
- [ ] Zero-match search pruning on WM-1's search records: an exact-repeat search returns a
      deterministic corrective result citing the ledger instead of re-executing; after three
      zero-match searches (CR-9's threshold) the corrective result includes the ledger
      summary and the scopes not yet covered. No LLM involvement, no reordering, no beliefs
      beyond covered/not-covered.
- Verify: gate 1–3 (ledger tests).

### **WM-7 — Settings, parity, UI**
- [ ] `workspaceWorldModel: 'off' | 'verify' | 'repair'` (default per D1) and
      `worldModelRepairBudget` (default 5, 0 disables repair) added to
      `DEFAULT_APP_SETTINGS`, the renderer mirror, and the parity test. One new Settings
      section (World model) with the three-way mode control and the budget field, following
      the Loops tab pattern so nobody edits settings.json by hand.
- Verify: gate 1–3 (`default-app-settings.test.ts` + settings surface tests).

### **WM-8 — Audit surface**
- [ ] `world_model.verdict` / `world_model.repair` / `world_model.downgrade` events land in
      the existing events table (ids, kinds, path subjects; never tool argument payloads).
      After-action panel gains a World model section with the three counts. Repaired calls
      carry a small metadata note on their tool result row so the transcript shows that an
      observation was inserted; no new panel, no new pill.
- Verify: gate 1–3 (event emission + After-action wiring tests).

### **WM-9 — Lamprey Workspace Bench (LWB)**
- [ ] New `bench/wm/`: 30 single-turn + 10 multi-step fixture tasks (per D2), each a small
      fixture tree plus a deterministic goal predicate (expected file states and/or command
      exit codes; the analog of unmet(g) that lives outside the product per the non-goal).
      New `scripts/wm-bench.cjs`: headless runner that drives `runHeadlessTurn` per task
      against whatever provider the local settings name (Ollama Qwen included), evaluates
      predicates, and writes a metrics JSON (success, first-dispatch validity, LLM calls,
      interventions, tokens). Bench runs are owner-invoked, never CI.
- Verify: gate 1–3 + a self-test of the predicate evaluator against a known-good and a
  known-bad fixture.

### **WM-10 — Replay corpus and zero-delta locks**
- [ ] Record/replay seam at the provider boundary so captured transcripts (WM-0 protocol
      output, or synthetic ones marked as such until the capture lands) re-drive dispatch
      deterministically in vitest with no network. Source-lock tests in
      `world-model-safety.test.ts`: (a) `'off'` mode is byte-compatible with today's
      dispatch at every entry point (the `loop-safety.test.ts` pattern); (b) the auto-action
      allowlist is non-mutating by construction; (c) the budget downgrade cannot be
      re-armed within a turn.
- Verify: gate 1–4, full replay suite green.

### **WM-11 — Smoke playbook with pre-registered numbers**
- [ ] `PLANNING/WM_SMOKE_PLAYBOOK.md`: owner-run protocol for Qwen3-8B and Qwen3-4B via
      Ollama across the bench in all three modes, with the expected numbers written down
      BEFORE the run (per `lamprey-research-methodology`): the phase claims success only if
      `'repair'` beats `'off'` on bench success by a stated margin at equal-or-fewer LLM
      calls per task, and claims failure honestly otherwise. Includes one frontier-model
      row (any keyed provider) to test the paper's complementarity finding.
- Verify: doc-only; gate 1–2.

### **WM-12 — AFTER doc**
- [ ] `PLANNING/WM_AFTER.md`: measured replay-suite numbers, contract/prompt byte deltas
      (expected: zero — this phase adds no prompt text, which is the point: the controls
      live outside the model), live bench results if the owner has run WM-11 by wrap time,
      otherwise the honest "awaits first install" note, and the residual-gap list.
- Verify: doc-only; gate 1–2.

### **WM-13 — Phase wrap**
- [ ] Full gate green (vitest + build + verify:proof), DEVLOG phase-complete entry,
      CLAUDE.md Current State + reference-only list updated, README currency check,
      `package.json` → **0.34.0**. No release, no Bucket: shipping is a separate owner
      decision after the playbook verdict.
- Verify: final phase gate (§0 item 5).

---

Authored and reviewed by Basho Parks, copyright 2026
