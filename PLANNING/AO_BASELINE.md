# AO_BASELINE — Agentic Orchestration Phase baseline + documented-vs-wired seam audit

Recorded 2026-07-11 (AO-0), before any code change, against the v0.17.0 tree. Every claim
carries a file:line cite (proof-toolkit recipe 2 — documented ≠ wired). This is the map the
rest of the roster builds and governs; nothing here is rebuilt.

## §1 — The A/B-series agentic spine (undocumented in CLAUDE.md until this phase)

A full fork/run/workflow layer already exists from a pre-Loop "A/B-series" era. CLAUDE.md's
Loop entry acknowledges it in passing ("an earlier undocumented agentic-infra/'Data Spine'
phase") but never inventories it. Here it is.

### 1a. Typed agent registry — `electron/services/subagent-types.ts`
- `AllowedTools = '*' | string[]` — [subagent-types.ts:22](electron/services/subagent-types.ts:22)
- `SubagentTypeDef` (name, description, `allowedTools`, systemPrompt, source) —
  [subagent-types.ts:24](electron/services/subagent-types.ts:24)
- `BUILT_IN_SUBAGENT_TYPES` — Explore / Plan / code-reviewer (all three tool-scoped to
  `['read_file','grep_search','glob_search','shell_command']`) + general (`'*'`) —
  [subagent-types.ts:39](electron/services/subagent-types.ts:39)
- Filesystem user types at `userData/subagent-types/*.md` (gray-matter frontmatter, user
  types shadow built-ins by name); `getSubagentType(name)` is the resolver.

**Reachable from:** `forkAgent` (via `loadType`), `multi_agent_run` roles are a *separate*
list (below). No model tool exposes "pick an agent type" directly today.

### 1b. Fork primitive — `electron/services/subagent-runner.ts`
- `forkAgent(opts, deps): ForkAgentHandle` — synchronous return, abortable handle whose
  `promise` resolves the structured result — [subagent-runner.ts:428](electron/services/subagent-runner.ts:428)
- `resolveAllowedTools(parentTools, typeAllowed, callOverride)` — deterministic sorted
  intersection; `'*'` on a layer = no narrowing — [subagent-runner.ts:239](electron/services/subagent-runner.ts:239).
  **This is the deterministic tool-grant enforcement point AO-3 extends** — grants land as a
  fourth intersection layer here, not in any prompt.
- `ForkAgentDeps`: injected `runner` (pure/testable), `defaultModel`, `loadType`,
  `parentTools`, `agentRunStore`, `notify`, `worktreeManager` —
  [subagent-runner.ts:119](electron/services/subagent-runner.ts:119)
- Schema-forced structured output: `buildSchemaInstruction` + `validateAgainstSchema`
  (retry cap `SUBAGENT_SCHEMA_RETRY_MAX=3`) — the seam AO-6's judge/AO-7's critic reuse.
- Live-handle registry: `getLiveHandle(runId)` / `listLiveHandleIds()` —
  [subagent-runner.ts:403](electron/services/subagent-runner.ts:403). **The kill seam** (AO-3
  revoke, AO-5 tree-wide kill) drives this.
- Caps: `SUBAGENT_DEFAULT_TIMEOUT_MS=60_000`, `SUBAGENT_MAX_TIMEOUT_MS=600_000`,
  `SUBAGENT_MAX_CONTEXT_BYTES=32_768` — [subagent-runner.ts:21](electron/services/subagent-runner.ts:21).
  Token accounting today is `approxTokens = ceil(len/4)` — a *display estimate only*, no
  budget enforcement. **AO-4 adds the enforced meter; the estimator method is reused.**

### 1c. Run persistence — `agent_runs` table + store + IPC
- DDL: id, parent_conv_id, parent_run_id, agent_type, label, status
  CHECK(`running|done|error|aborted`), started_at, finished_at, result_text, error,
  worktree_path, background — [schema-init.ts:285](electron/services/schema-init.ts:285),
  indexes on conv / status / parent_run.
- `agent-run-store.ts`: insertRun / finishRun / updateLabel / get / list / getOutput.
- IPC `electron/ipc/tasks.ts`: `tasks:spawn` (:35), `tasks:list` (:63), `tasks:get` (:71),
  `tasks:output` (:82), **`tasks:stop`** (:93 — per-run kill via the live-handle registry),
  `tasks:update` (:134). **AO-5 reuses `tasks:stop` for tree-wide kill; AO-10 reuses the
  reads for the inventory surface.**

### 1d. Deterministic scripts + isolation
- `electron/services/workflow-runner.ts` + `electron/ipc/workflows.ts` — multi-agent
  scripts over forkAgent. `electron/services/worktree-runner.ts` — `WorktreeManager` for
  `isolation: 'worktree'` forks. Both stay as-is; AO governs the forks they spawn.

### 1e. The era-kept model tool — `multi_agent_run`
- Registered in `multi-agent-run-tool-pack.ts:19` — `enabled: true`, `risks:['network','read']`,
  `requiresApproval: false`. Runner = `chatOnce` body-only ([:102](electron/services/multi-agent-run-tool-pack.ts:102)).
- Roles are a **fixed enum** planner/reader/verifier/reviewer/coworker
  ([multi-agent-run-tool.ts:72](electron/services/multi-agent-run-tool.ts:72)) — these
  sub-agents are **tool-less by contract** (reason on bounded context only). Caps: ≤5 tasks,
  32KB context, 60s default timeout ([multi-agent-run-tool.ts:27](electron/services/multi-agent-run-tool.ts:27)).
- Since the A1 refactor it **delegates to forkAgent** ([multi-agent-run-tool.ts:8](electron/services/multi-agent-run-tool.ts:8)).
  **AO-5 gives it an auto-granted tool-less identity; its public shapes stay byte-compatible
  (a test locks OFF-toggle behavior).**

## §2 — What the blog demands that is genuinely MISSING

| Blog signal | Missing piece | Prompt |
|---|---|---|
| Agent identity (approve A,B,C; refuse D) | No identity object; `resolveAllowedTools` narrows but there is no per-agent grant ledger, no approve/refuse flow, no revocation | AO-2, AO-3 |
| Outcome + budget | `approxTokens` is display-only; nothing aborts a fork tree on token/wall/candidate/depth ceilings; no receipts | AO-4, AO-9 |
| Strategy composition | forkAgent is a single-fork primitive; no fan-out+judge, no generator+critic, no advisor escalation as first-class strategies | AO-6, AO-7, AO-8 |
| The wall (audit/inventory) | `tasks:*` lists *runs* but there is no identity inventory, no grant/spend ledger surface, no consolidated kill switch UI | AO-10 |

## §3 — Master-toggle gate points (the AO-11 source-lock enumerates ALL of these)

`orchestrationEnabled: false` (AO-1) must gate every path that can start orchestrated work
or expose an orchestration tool. Enumerated now so AO-11's LP-10-pattern test is complete:

1. **Model tool registration → dispatch array.** The three new tools (`agent_fanout`,
   `agent_critique`, `agent_advisor`) register in the pack list like everything else, but
   must be **stripped from the dispatch array when the toggle is off** so ZERO prompt bytes
   reach the model. Gate site: `buildDispatchTools`
   ([chat.ts:716](electron/ipc/chat.ts:716)) and `rebuildToolsForNextRound`
   ([chat.ts:737](electron/ipc/chat.ts:737)) — a name-filter after the registry returns the
   array. (Mechanism note: this is *stronger* than the Loop precedent, where loop tools stay
   in the surface and refuse at the handler — [loop-tool-pack.ts:166](electron/services/loop-tool-pack.ts:166)
   gates on `readLoopConfig().enabled`. Orchestration gets the zero-byte guarantee instead.)
2. **Slash commands** `/fanout`, `/critique`, `/outcome` — refuse with a one-line "enable
   Orchestration in Settings" when off (the loop `/loop` precedent).
3. **`agents:*` IPC** — identity list/revoke/kill return an empty/disabled result when off.
4. **Loop outcome envelope** (AO-9) — a backlog task carrying an outcome runs single-agent
   (no orchestration) when the toggle is off.

## §4 — Prompt-surface byte baseline (must be unchanged with the toggle OFF)

Current guards in `system-prompt-builder.test.ts` (the numbers AO-11 re-asserts):
- contract `< 3300` ([:165](electron/services/system-prompt-builder.test.ts:165))
- coding-mode prompt `< 3900` ([:199](electron/services/system-prompt-builder.test.ts:199))
- role fragments `< 1500` / `< 280` ([:234](electron/services/system-prompt-builder.test.ts:234), [:444](electron/services/system-prompt-builder.test.ts:444))
- composer `< 1024` / `< 3305` / `< 3300`

**Contract:** the phase adds ZERO bytes to any of these with the toggle off. Orchestration
adds nothing to the system prompt at all — its surface is tools (gated) + slash commands +
UI, never prose in the base prompt. AO-11 re-measures and asserts equality.

## §5 — Migration ceiling

`db-migrations.ts` tops out at **v18** ([db-migrations.ts:206](electron/services/db-migrations.ts:206)).
The identity ledger (AO-2) is **migration v19** — additive `agent_identities` table +
`safeAddColumn agent_runs.identity_id TEXT` (K2 rule: historical rows readable forever, no
schema rewrite; the v0.9.2 crash is why additive-only is non-negotiable).

## §6 — Reuse ledger (build ON, never rebuild)

| Need | Existing seam reused | New work |
|---|---|---|
| Spawn a governed sub-agent | `forkAgent` + `ForkAgentDeps` | identity + budget slice threaded through deps |
| Enforce tool grants | `resolveAllowedTools` (4th layer) | `agent_identities.granted_tools` as that layer |
| Approve/refuse UX | `tools:approvalRequired` permission chips | grant-request shape + persist decisions |
| Kill / revoke | live-handle registry + `tasks:stop` | tree-wide propagation + `agents:revoke` |
| Run persistence | `agent_runs` + `agent-run-store` + `tasks:*` | `identity_id` link + receipt columns |
| Structured judge/critic output | `buildSchemaInstruction` + schema retry | strategy envelopes |
| Cross-model panels | v0.17.0 registry (`resolveModel`, 17 providers) | per-candidate `modelId` overrides |
| Inventory UI | LoopsPanel right-panel pattern + `tasks:*` reads | Agents pill |
| OFF-by-default toggle | Loop `loopsEnabled` precedent | `orchestrationEnabled` + zero-byte gate |
