# Agentic Orchestration (v0.18.0)

> The light local orchestration layer: per-agent identity with tool grants, budgets enforced
> outside the model, fan-out/critic/advisor strategies, and an inventory + kill surface. OFF by
> default (`orchestrationEnabled: false`) — a deliberate, user-authorized extension past the
> Opus 4.5 era-lock (like the Loop Phase). Design brief: the Island Mountain post "Agentic
> Infrastructure Is Shedding Its Scaffolding. The Controls Have to Land Somewhere." Its thesis
> is this layer's architecture: **controls that hold are deterministic and live outside the
> model.** A system prompt is a request; a dispatch-level tool grant is a fact.

## The control plane vs. the strategies

Two layers. **Underneath:** identity, grants, budget, receipts, kill, audit — deterministic,
enforced in code. **On top:** composition — fan-out/judge, generator/critic, advisor,
outcome+budget — that encodes *search*, not business process.

```
 Settings → Orchestration (master toggle + ceilings + advisor model)
   │  orchestrationEnabled: false by default
   ▼
 orchestration-config.ts  ── readOrchestrationConfig() ─────────────┐
   │                                                                │
 chat.ts dispatch strip (filterOrchestrationTools)  ◄──────────────┤ zero tool bytes when off
   │  agent_fanout / agent_critique / agent_advisor stripped        │
   ▼                                                                │
 orchestration-tool-pack.ts  (the 3 strategy model tools)           │
   │        │              │                                        │
   ▼        ▼              ▼                                        │
 strategy-  strategy-   strategy-        governance:                │
 fanout     critic      advisor          governFork() ──► agent-identity-store (v19)
   │  (pure, budgeted, injected provider calls)   │        + agent-grants (resolveEffectiveTools)
   ▼                                              ▼
 orchestration-budget.ts  ── recordSpend / breach ──► receipts ──► agent_runs (v20 columns)
   │                                                                │
 agents:* IPC (list / revoke / kill) ◄── AgentsPanel (right-panel) ─┘
```

## The load-bearing spine it was built ON (not rebuilt)

This phase governs the pre-existing **A/B-series** fork spine (documented in AO_BASELINE):
- `subagent-types.ts` — typed agent registry with per-type `allowedTools`
- `subagent-runner.ts` — `forkAgent` + `resolveAllowedTools` (the deterministic grant
  intersection point) + the live-handle registry (the kill seam)
- `agent_runs` table + `agent-run-store` + `tasks:*` IPC (incl. `tasks:stop`)
- the era-kept tool-less `multi_agent_run`

Nothing here rebuilt the deleted Unburdening machinery (always-on pipeline, auto-router, proof
gate, composer) — those stay deleted. Orchestration runs only when the user (slash/outcome) or
the model (explicitly-offered, gated tools) invokes it; nothing auto-fans a plain turn.

## Identity lifecycle

`agent_identities` (migration v19): one row per governed fork — requested tools, the user's
granted subset, budget ceilings, running spend, status (`pending`→`active`→`revoked`).

1. **Mint** — `governFork(scope)` (OFF ⇒ returns `{identityId: null}`, writes nothing → the
   existing paths run byte-for-byte). ON ⇒ creates an identity, auto-granting the read-only
   floor and emitting a `security.decision created` event (ids + counts only).
2. **Grant** — tools beyond the floor become `needsApproval` chips (rides the existing
   permission surface); the decision persists to `granted_tools`.
3. **Enforce** — `agent-grants.resolveEffectiveTools(typeFloor, identity)`: a revoked identity
   yields ZERO tools; a refused tool is simply absent from `granted_tools`. This is the control
   point — never prompt language.
4. **Spend** — every fork completion writes a receipt (`agent_runs.tokens_est`/`tool_calls`,
   v20) and accumulates onto the identity; `orchestration-budget` breaches abort the tree.
5. **Revoke / kill** — `agents:revoke` flips status, aborts in-flight runs via the live-handle
   registry (tree-wide through `parent_run_id`), and empties future tool resolution.

## Budget: a fact, not a suggestion

`orchestration-budget.ts` accounts tokens + active wall-clock against ceilings a per-call
override can only TIGHTEN (never raise). A breach aborts the whole fork tree and reports
honestly (a `role:'system'` note naming the ceiling and the spend). 0 disables an individual
cap. `depthExceeded` + `clampCandidates` bound the fork tree and fan-out N. Token estimation is
the JM-12 chars/4 method the caller supplies; the module only accumulates and decides.

## The strategies (pure, injected, tested)

| Strategy | Module | Tool | Slash | Shape |
|---|---|---|---|---|
| Fan-out + judge | `strategy-fanout.ts` | `agent_fanout` | `/fanout` | N candidates (per-candidate model), budget, judge → winner |
| Generator + critic | `strategy-critic.ts` | `agent_critique` | `/critique` | draft → critique → revise to a hard cap; critic is tool-less (read-only by construction) |
| Advisor escalation | `strategy-advisor.ts` | `agent_advisor` | — | one bounded question → `orchAdvisorModel`; honest when unset |
| Outcome + budget | `parse-outcome-command.ts` | — | `/outcome` | parse goal + budget flags, clamp downward, route to a strategy |

All provider calls are injected, so the loops / budget / winner selection are unit-tested
without a network. Cross-model panels are the point of the v0.17.0 seventeen-connector
substrate: a cheap local generator with a frontier judge or advisor.

## Master-toggle gate points (source-locked in `orchestration-safety.test.ts`)

1. **Dispatch strip** — `filterOrchestrationTools` removes the 3 tools from the model's array
   when off (both `buildDispatchTools` + `rebuildToolsForNextRound`) — the zero-byte guarantee.
2. **Tool handlers** — each strategy tool refuses if called while off.
3. **Slash templates** — `/fanout` `/critique` `/outcome` name the enable-check.
4. **`agents:*` IPC** — `agents:list` returns empty when off.
5. **System prompt** — ZERO orchestration surface leaks in (locked), so the L9/UB byte guards
   stay meaningful.

## Migrations

- **v19** — `agent_identities` + `agent_runs.identity_id` (shared DDL in
  `agent-identity-schema.ts`, node:sqlite integration test).
- **v20** — `agent_runs.tokens_est` + `tool_calls` (receipt columns).

Both additive (K2 rule — historical rows readable forever). Revoked identities age out of the
90-day retention sweep.

## Deliberate non-goals

- **No agent-to-agent network exposure** — Lamprey does not stand an MCP server in front of
  itself for other agents to call. Internal fork trees are bounded by identity + depth ceilings;
  inbound A2A is a future phase with its own security plan.
- **No standing "skip the review" approvals** — the blog names this as the authority
  agentjacking inherits. Approvals stay per-action; nothing persists a blanket ship-it grant.
- **No dollar billing, no cloud control plane, no telemetry egress** — budgets are
  tokens/wall/candidates/depth, enforced and receipted locally. On your own hardware the burst
  is measured in watts, and the budget you hand an agent is a governance decision, not a
  procurement event.

## Honest gaps (owner follow-ups)

- Live keyed smoke (`PLANNING/AO_SMOKE_PLAYBOOK.md`) and a GUI pass of the Agents pill are the
  owner's first-install checks.
- The parsed `/outcome` budget is advisory guidance to the model; the HARD enforcement is the
  strategy tools' settings-derived ceilings. A per-run downward budget override threaded into
  the tools, and a dedicated `scope_kind: 'outcome'` identity tree, are the documented
  follow-up (the settings ceiling still hard-caps, so nothing is unbounded).
- Explicit `granted`/`refused` events land when the permission→grant chip path is fully wired;
  the auto-grant path emits its counts via `created`.
