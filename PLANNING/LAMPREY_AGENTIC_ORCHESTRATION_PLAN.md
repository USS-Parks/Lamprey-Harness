# LAMPREY_AGENTIC_ORCHESTRATION_PLAN.md — Agentic Orchestration Phase (AO-0–AO-12)

Goal in the user's words: *"agentic orchestration at local level, built into the harness as a
light layer"* — design brief: the 2026-07-11 Island Mountain post **"Agentic Infrastructure
Is Shedding Its Scaffolding. The Controls Have to Land Somewhere."**

The post's thesis is the plan's architecture: the scaffolding's *capability* job is obsolete,
but its *control* job never belonged to it — controls that hold are **deterministic and live
outside the model**. So this phase builds the blog's six signals as a local control plane +
composition layer: **identity, grants, budgets, receipts, kill switch, audit** underneath;
**strategy composition** (fan-out/judge, generator+critic, advisor escalation,
outcome+budget) on top. A system prompt is a request; a dispatch-level tool grant is a fact.

**The load-bearing pre-plan discovery (grounds the whole roster):** the tree already carries
an UNDOCUMENTED agentic spine from the pre-Loop "A/B-series" era that CLAUDE.md never listed:

- `electron/services/subagent-types.ts` — typed agent registry (built-ins Explore / Plan /
  code-reviewer / general) with per-type `allowedTools` ('*' or descriptor-id lists) +
  filesystem user types at `userData/subagent-types/*.md`
- `electron/services/subagent-runner.ts` — `forkAgent`: curated tool subsets, schema-forced
  structured output, abort handles, worktree isolation (A3), injected runner (pure/testable)
- `electron/services/agent-run-store.ts` + **existing `agent_runs` table** (schema-init) +
  `electron/ipc/tasks.ts` (`tasks:list/get/output/stop/update`) — a background-run lifecycle
  with a per-run stop, already persisted
- `electron/services/workflow-runner.ts` + `electron/ipc/workflows.ts`,
  `worktree-runner.ts` — deterministic multi-agent scripts, worktree-isolated forks
- `multi_agent_run` (era-kept Task-tool analog) — since the A1 refactor it *delegates to
  forkAgent* but exposes only tool-less role prompts (planner/reader/verifier/reviewer/
  coworker, ≤5 tasks, 32KB context, 60s default timeout)

This phase therefore **wires and governs, not rebuilds** (the LP-0 lesson: audit
documented-vs-wired before adding). What the blog demands that is genuinely MISSING:
a first-class identity object with an approve/refuse grant flow and revocation; budgets
(tokens/wall/candidates/depth) enforced outside the model with receipts; the three
composition strategies; an outcome+budget entry point; an inventory/audit surface; and one
era-faithful master toggle over all of it.

**Relationship to the Unburdening deletions (non-negotiable):** the always-on
Planner→Coder→Reviewer pipeline, the auto-router, the runtime proof gate, and the composer
STAY DELETED. Nothing in this phase fans out a plain turn automatically, routes modes, or
re-grows stage chrome on default turns. Strategies run only when the user (slash command /
outcome) or the model (explicitly offered tools, themselves gated) invokes them. Like the
Loop Phase, this is a **user-authorized deliberate extension past the era lock
(2026-07-11)** that ships **OFF by default** — `orchestrationEnabled: false` — so the
era-faithful default experience is unchanged, including zero added tool-schema bytes when
the toggle is off.

---

## §0 — Governance

### Goal (one sentence)
Give Lamprey a light, opt-in local orchestration layer — per-agent identity with
approve/refuse tool grants, externally-enforced budgets with receipts, fan-out/judge +
generator/critic + advisor strategies, an outcome+budget entry point, and an
inventory/audit surface with a kill switch — built on the existing forkAgent/agent_runs
spine, gated behind one master toggle that defaults off.

### Scope (what this phase touches)
- `electron/services/subagent-runner.ts`, `multi-agent-run-tool.ts`,
  `multi-agent-run-tool-pack.ts`, `subagent-types.ts` — identity + budget wiring on the
  existing fork path (public shapes preserved; every existing test stays green)
- NEW pure modules: `agent-identity-store.ts`, `orchestration-budget.ts`,
  `strategy-fanout.ts`, `strategy-critic.ts`, `strategy-advisor.ts`,
  `parse-outcome-command.ts`
- `electron/services/db-migrations.ts` — migration **v19**: `agent_identities` table +
  `agent_runs.identity_id` column (additive only; K2 rule — historical rows readable forever)
- `electron/services/default-app-settings.ts` + `src/stores/settings-store.ts` literal —
  `orchestrationEnabled: false` + bounded ceiling defaults (SP-1 parity-locked)
- `electron/services/tool-registry.ts` / tool packs — three new model tools
  (`agent_fanout`, `agent_critique`, `agent_advisor`), registered ONLY when the master
  toggle is on (zero prompt-surface bytes when off)
- `electron/ipc/` — `agents:*` IPC (identities list/revoke, grant respond rides the
  existing permissions channel), `/outcome` + `/fanout` command plumbing in the existing
  slash path; `electron/preload.ts` surface
- `src/components/` — Settings → Orchestration panel; right-panel **Agents** pill
  (LoopsPanel pattern): identity list, grants, receipts, revoke/kill; MultiAgentRunCard
  receipt line; After-action Agents section
- Events spine — `agent.identity.*`, `orchestration.budget.*`, extended `agent.run.*`
- Tests throughout + `PLANNING/AO_BASELINE.md`, `PLANNING/AO_SMOKE_PLAYBOOK.md`,
  `ARCHITECTURE/AGENTIC_ORCHESTRATION.md`
- `DEVLOG.md`, `README.md`, `CLAUDE.md`, `package.json` → **v0.18.0** (wrap prompt only)

### Non-goals (explicitly out of scope)
- **No resurrection of deleted machinery.** No always-on pipeline, no per-turn auto-router,
  no proof gate, no composer, no stage chrome on default turns. Deletion was the product
  decision (Unburdening, v0.14.0); this phase does not relitigate it.
- **No agent-to-agent network exposure.** Lamprey does not stand an MCP server in front of
  itself for other agents to call (blog signal 2's east-west traffic). Named as deferred —
  a future phase decision with its own security plan, not a stowaway here.
- **No standing "skip the review" approvals.** The blog names this exact convenience as the
  authority agentjacking inherits. Approvals stay per-action through the existing
  permissions store; nothing in this phase persists a blanket ship-it authority.
- **No dollar-denominated billing, no cloud control plane, no telemetry egress.** Budgets
  are tokens / wall-clock / candidates / depth, enforced locally, receipted locally.
- **No schema deletions or rewrites** — migration v19 is additive; `agent_runs`' existing
  shape and the tasks IPC contract are preserved.
- **No new wire protocols and no new providers** — strategies compose models the v0.17.0
  registry already reaches (that phase is this phase's substrate: a cheap local generator
  with a frontier judge/advisor is exactly the point of having seventeen connectors).
- Deep Research, RAG, Snip, Skills/Plugins, Loop internals: untouched except where a prompt
  names its integration seam explicitly (AO-9's loop outcome envelope).

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run <the test files this prompt touches>` — clean
4. Any prompt touching `electron/ipc/chat.ts` also runs
   `npm run verify:proof -- --no-tests` — exits 0
5. Migration prompt (AO-2) additionally runs the native-DB suites
   (`schema-init` + new identity-store DB tests — they RUN under the matched ABI)
6. Final phase gate (AO-12): full `npx vitest run` + `npm run build` +
   `npm run verify:proof`

### Commit discipline
- One commit per prompt, present-tense imperative subject
- Hook-enforced trailer on every commit: `Agentically Engineered and Reviewed by Basho Parks - 2026`
- DEVLOG entry per prompt under `## <date> — Agentic Orchestration Phase`
- No squashing; no push until the wrap prompt unless explicitly told earlier

### Worktree / branch
- Branch: `feat/agentic-orchestration` (separate git worktree if parallel with another track)

### Completion criteria
- All AO-0–AO-12 `[x]`, final gate green, DEVLOG phase-complete entry, CLAUDE.md Current
  State updated (including retiring the "undocumented agentic-infra layer" caveat — AO-0
  documents it), README "New in 0.18.0", version bumped. Live keyed/GUI checks are the
  owner-run `AO_SMOKE_PLAYBOOK.md`.

### Approval state
- **APPROVED 2026-07-11** by user with answers: (1) strategy primitives offered as model
  tools AND slash commands when the toggle is on, (2) advisor auto-offer manual-only by
  default, (3) grant flow rides the existing permissions approval chips, (4) `/outcome`
  included in this phase, (5) version target v0.18.0. STS instructed same message.

---

## §1 — Prompt Roster

### **AO-0 — Baseline + documented-vs-wired seam audit**
- [x] Write `PLANNING/AO_BASELINE.md`: full inventory of the A/B-series spine
      (subagent-types, forkAgent, agent_runs + tasks IPC, workflow-runner,
      worktree-runner, any activity/dashboard surface) — for each seam: documented?,
      wired?, reachable from (model tool / IPC / UI / dormant), and the exact call sites.
      Measure `multi_agent_run`'s real wire (roles, tool-lessness, caps). Enumerate every
      entry point the master toggle must gate. Record current prompt-surface byte baseline
      (L9/UB guards) so AO-12 can prove zero regression with the toggle off. No code.
- Verify: doc complete; every claim carries a file:line cite (proof-toolkit recipe 2).

### **AO-1 — Master toggle + settings spine**
- [x] `orchestrationEnabled: false` plus bounded defaults — `orchMaxTokensPerRun`,
      `orchMaxWallclockMs`, `orchMaxCandidates` (cap for fan-out N), `orchMaxDepth`
      (fork-tree depth), `orchAdvisorModel: ''` — added to `DEFAULT_APP_SETTINGS` AND the
      renderer literal (SP-1 parity lock extended). Settings → **Orchestration** panel
      (toggle + ceilings + advisor model picker fed by `model:list`). 0-disables per
      ceiling knob, LP-7 style. A seed `orchestration-safety.test.ts` starts the LP-10
      source-lock pattern; per-feature gate assertions accrete in later prompts.
- Verify: tsc ×2; `default-app-settings.test.ts` + new safety test green.

### **AO-2 — Agent identity ledger (migration v19)**
- [x] `agent_identities` table: id, label, agent_type, scope kind+id (conversation / loop /
      workflow / outcome), requested_tools JSON, granted_tools JSON, status
      (`pending`/`active`/`revoked`), created_at, revoked_at, budget columns
      (tokens_ceiling, wall_ms_ceiling), tokens_spent, wall_ms_spent. `safeAddColumn`
      `agent_runs.identity_id TEXT` links runs to identities (NULL = pre-phase rows,
      readable forever). Transactional `agent-identity-store.ts` (create / grant / revoke /
      spend-accumulate / list-by-scope) + retention-sweep inclusion for terminal rows.
- Verify: tsc ×2; identity-store DB tests green under the matched ABI (they RUN, not
      skip — v0.16.0+ reality); `schema-init.test.ts` updated table list green.

### **AO-3 — Grant flow: "approve A, B, C; refuse D" + revocation**
- [x] The blog's signal 1 made deterministic: a fork whose requested tools exceed its
      type's floor produces a **grant request** through the existing
      `tools:approvalRequired` permissions channel (chips UI already exists) listing the
      requested descriptor ids; the user's per-tool approve/refuse decisions persist to the
      identity row; dispatch resolves the effective set as
      `type.allowedTools ∩ identity.granted_tools` **at the tool-resolution site** — never
      in the prompt. `agents:revoke` IPC flips status, aborts the identity's in-flight
      run (existing abort seam), and empties future tool resolution. Read-only-floor types
      (Explore/Plan/code-reviewer and the tool-less multi_agent_run roles) auto-grant their
      floor with zero prompts — no new friction on the era-kept path.
- Verify: tsc ×2; grant-enforcement tests (denied tool absent from the resolved set; a
      revoked identity resolves zero tools; auto-grant floor produces no approval event).

### **AO-4 — Budget meter, enforced outside the model**
- [ ] Pure `orchestration-budget.ts`: per-identity and per-run-tree accounting using the
      JM-12 real-chars method; ceilings = settings defaults, per-call overrides accepted
      only downward (a call may tighten, never exceed). Breach → abort the whole fork tree,
      persist an honest `role:'system'` note naming identity + ceiling, receipt the partial
      spend, emit `orchestration.budget.breached`. Every fork completion writes its receipt
      (tokens_est, wall_ms, outcome, tool_calls_count) to `agent_runs` + accumulates onto
      the identity. Wall-clock counts active time (the `loops.active_ms` lesson).
- Verify: tsc ×2; budget tests (breach aborts mid-tree, receipts sum to parent accounting,
      downward-only overrides, 0-disables).

### **AO-5 — Govern the existing paths: multi_agent_run + forkAgent callers**
- [ ] Every fork acquires an identity + budget slice: `multi_agent_run` (auto-granted
      tool-less floor; behavior byte-compatible when the toggle is OFF — locked by test),
      tasks IPC forks, and workflow-runner forks. Kill propagation verified tree-wide
      (`tasks:stop` → children). `MultiAgentRunCard` gains a per-agent receipt line
      (tokens · ms · outcome) and a kill affordance. Public shapes of
      `validateMultiAgentArgs` / result envelopes unchanged — existing tests stay green.
- Verify: tsc ×2; multi-agent-run + subagent-runner suites green including the
      toggle-OFF byte-compat lock; receipts appear on the card (source-read test).

### **AO-6 — Strategy: fan-out + judge**
- [ ] Pure `strategy-fanout.ts`: N candidate forks (per-candidate `modelId` override — the
      v0.17.0 seventeen-connector substrate is the point: cheap/local generators, distinct
      judge), judge fork receives candidates + rubric and returns winner + rationale
      (schema-forced via the existing forkAgent schema seam); envelope persists all
      candidate receipts + the judgment. Exposed as model tool `agent_fanout` (registered
      only when `orchestrationEnabled`) and `/fanout <task>` slash command. N capped by
      `orchMaxCandidates`; whole run budgeted per AO-4.
- Verify: tsc ×2; fanout tests (N-cap, judge schema retry, budget breach mid-fanout,
      cross-model candidate dispatch descriptors); safety test gains the gate assertion.

### **AO-7 — Strategy: generator + adversarial critic**
- [ ] Pure `strategy-critic.ts`: generate → critique → revise loop with a hard iteration
      cap; the critic runs under a **read-only identity** (deterministic grants, not
      prompt language — the blog's advisory-vs-fact line implemented literally). Model tool
      `agent_critique` + `/critique` command, same gating + budgeting.
- Verify: tsc ×2; critic tests (iteration cap, critic denied mutating tools at dispatch,
      revise consumes critique, budget receipts per iteration).

### **AO-8 — Strategy: advisor escalation**
- [ ] Pure `strategy-advisor.ts`: a running sub-agent (or the main turn) escalates ONE
      bounded question + context excerpt to `orchAdvisorModel` via `chatOnce`; answer
      returns as a tool result; spend receipts onto the caller's identity. Model tool
      `agent_advisor` (gated). Optional auto-offer after N consecutive failed tool rounds
      ships **manual-only by default** (`orchAdvisorAutoOffer: false`) — §2 decision.
      Unset advisor model → the tool reports "no advisor configured" honestly.
- Verify: tsc ×2; advisor tests (one-shot bound, budget receipt, unset-model path,
      auto-offer stays inert at default).

### **AO-9 — Outcome + budget entry point**
- [ ] The blog's closing line as a command: `/outcome "<goal>" [--tokens 200k]
      [--wall 20m] [--candidates 3] [--strategy fanout|critic|single]` — pure
      `parse-outcome-command.ts` (LP-8 pattern) → an orchestrated run in-conversation under
      one outcome-scoped identity tree; defaults from settings; ceilings clamp downward.
      Loop integration: a backlog task may carry an outcome envelope, with loop ceilings
      remaining the outer bound (inner orchestration budget ≤ loop budget slice).
- Verify: tsc ×2; parser table tests + integration test (outcome run produces identity
      tree + receipts; loop-enveloped outcome respects both ceilings).

### **AO-10 — Inventory + audit surface**
- [ ] Right-panel **Agents** pill (LoopsPanel pattern): identities with type, scope,
      grants (granted vs refused), status, live spend vs ceiling, per-run receipts, and
      **Revoke** / **Kill** actions; run-tree drill-down reuses `tasks:*` reads. After-action
      panel gains an Agents section (identities touched this conversation + totals).
      Events spine completes the ledger: `agent.identity.created/granted/refused/revoked`,
      `agent.run.receipted`, `orchestration.budget.breached` — payloads carry ids and
      counts, never tool arguments (the keychain-event rule).
- Verify: tsc ×2; source-read UI wiring tests (WC-8 pattern); event-payload shape tests.

### **AO-11 — Guard tests + smoke playbook**
- [ ] `orchestration-safety.test.ts` completed: master-toggle gate asserted at EVERY entry
      point enumerated by AO-0 (tool registration, slash commands, IPC, loop envelope) —
      the LP-10 pattern; prompt-surface byte guard re-measured with toggle off (must equal
      AO-0 baseline); parity lock covers the new settings; grant/budget/kill invariants
      consolidated. Write `PLANNING/AO_SMOKE_PLAYBOOK.md`: toggle-off nothing-visible pass,
      grant approve/refuse live flow, cross-model fanout ask (local generator + frontier
      judge), critic loop ask, advisor escalation ask, `/outcome` with a deliberately tiny
      budget (breach + honest report is the PASS), revoke-mid-run, kill-mid-run.
- Verify: tsc ×2; full new-suite green; playbook complete.

### **AO-12 — Phase wrap**
- [ ] `ARCHITECTURE/AGENTIC_ORCHESTRATION.md` (control plane, strategy contracts, identity
      lifecycle, the A/B-series provenance note); README "New in 0.18.0"; CLAUDE.md Current
      State + retire the "undocumented agentic-infra layer" caveat (now documented);
      `package.json` → 0.18.0; full gate (§0 item 6); DEVLOG phase entry. Push/artifacts
      per the standing STS ship convention when instructed.
- Verify: final phase gate.

---

## §2 — Decision menu (answer at approval)

1. **Model-tool exposure** — when the toggle is ON, are `agent_fanout` / `agent_critique` /
   `agent_advisor` offered to the model as tools AND as slash commands (recommended — the
   model deciding when to orchestrate is the era-kept multi_agent_run philosophy), or
   slash-commands-only first?
2. **Advisor auto-offer** — manual-only default (recommended) vs auto-offer after N failed
   rounds ON when an advisor model is set.
3. **Grant-flow UX** — ride the existing permissions approval chips (recommended; zero new
   modal surface) vs a dedicated grants modal.
4. **`/outcome` scope** — include in this phase (recommended; it is the blog's end state
   and mostly composition of AO-4/AO-6) or defer to a follow-up.
5. **Version target** — v0.18.0 (recommended).

## §3 — Blog signal → local control → prompt map

| Blog signal | Where the weight lands locally | Prompt(s) |
|---|---|---|
| 1. Agents hold identities ("approve A,B,C; refuse D") | `agent_identities` ledger; grant flow on the permissions channel; dispatch-site enforcement; revocation that propagates | AO-2, AO-3 |
| 2. Agents call agents | **Deferred** (non-goal) — inbound A2A exposure needs its own security plan; internal fork trees are covered by identity + depth ceilings | AO-4 (depth), non-goals |
| 3. Scaffolding comes down | No process boxes rebuilt; no auto-router; strategies are explicit invocations on the kept primitives | Non-goals, AO-5 |
| 4. Strategy composition | Fan-out/judge, generator+adversarial critic, advisor escalation — cross-model via the v0.17.0 connector substrate | AO-6, AO-7, AO-8 |
| 5. Ambient, eventually unprompted | Already local + opt-in (Loop/automations, OFF by default); outcome envelopes ride loop ceilings; standing "skip review" approvals explicitly rejected | AO-9, non-goals |
| 6. Outcome + budget ("Go.") | `/outcome` with budgets enforced outside the model; receipts; breach = honest abort | AO-4, AO-9 |
| The wall: security/compliance | Master toggle default-off; audit ledger on the events spine; inventory surface with revoke + kill; zero egress; budgets as governance (watts, not invoices — it's your hardware) | AO-1, AO-10, AO-11 |
