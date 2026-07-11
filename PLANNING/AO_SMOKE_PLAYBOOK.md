# AO_SMOKE_PLAYBOOK — Agentic Orchestration live smoke (owner-run)

The orchestration layer ships OFF by default and its strategies spend real provider tokens,
so this playbook — not CI — is the live gate. Everything statically checkable already gates in
vitest (the `orchestration-safety` source-locks: master default off, every entry-point gate,
zero-prompt-byte lock, config totality; plus the pure strategy/budget/grant/parser suites and
the node:sqlite identity DDL). Run the below against a v0.18.0 build with real keys.

## 0. Toggle-OFF pass (nothing should be visible)

1. Fresh install, do NOT enable Orchestration.
2. Settings → Orchestration exists and shows the master toggle OFF.
3. Right panel → **Agents** pill renders "Orchestration is off — enable it in Settings".
4. In a normal chat, ask the model to "use agent_fanout" — it should NOT have the tool (say so),
   because the dispatch strip removed it. **Pass = the model reports the tool isn't available.**
5. `/fanout do X`, `/critique do X`, `/outcome "do X"` — each expands to a prompt that, with the
   tools stripped, leads the model to tell you to enable Orchestration. **Pass = it says so.**

## 1. Enable + grant flow

1. Settings → Orchestration → toggle ON; set an advisor model (a frontier model — e.g. an
   OpenAI/Anthropic model from the v0.17.0 connectors) if you want to test advisor.
2. Run a `multi_agent_run` turn (ask the model to fan out planners/verifiers). Right panel →
   **Agents** now lists an identity (`multi_agent_run`, scope conversation, active) with its
   spend. **Pass = the identity appears with a non-zero token spend.**
3. (When the permission→grant chip path is exercised) request a fork with a mutating tool and
   confirm the approve/refuse chips appear; refuse one and confirm the refused tool shows under
   "refused" on the Agents card and never runs.

## 2. Fan-out + judge

1. `/fanout Draft a function that parses ISO-8601 durations` (or ask the model to call
   `agent_fanout` with two distinct `candidateModels` — a cheap local + a frontier model).
2. **Pass** = the result names N candidates with per-candidate token/ms, a judgment with a
   winnerIndex + rationale, and a winner. The Agents pill shows the run's spend against the
   ceiling.
3. Set `orchMaxTokensPerRun` very low (e.g. 500), re-run: **Pass = the run stops with a breach
   note naming the ceiling, no judge runs, and the failure is honest** (not a silent partial).

## 3. Generator + critic

1. `/critique Write a regex that validates a hex color` (or the model calls `agent_critique`).
2. **Pass** = the summary shows iterations, a final verdict (SHIP after a REVISE round is ideal),
   and the improved output. Confirm it never exceeds the max iterations even if the critic keeps
   finding issues.

## 4. Advisor escalation

1. With an advisor model set, have a sub-agent/turn call `agent_advisor` with a stuck question.
   **Pass = the advisor's answer returns and the caller's identity shows the added spend.**
2. Unset the advisor model, call `agent_advisor` again. **Pass = "No advisor model is configured"
   — honest, no crash, no phantom answer.**

## 5. Outcome + budget

1. `/outcome "summarize the repo README" --tokens 20k --strategy fanout`.
2. **Pass** = the model runs a fan-out toward the goal; the hard ceiling is the Settings value
   (the flag can only ask for less — verify by setting `orchMaxTokensPerRun` below 20k and
   confirming the lower number wins).

## 6. Revoke + kill mid-run

1. Start a long orchestrated run (a fan-out with several candidates).
2. Right panel → **Agents** → **Revoke / kill** on the running identity.
3. **Pass** = the in-flight run aborts (tree-wide — children too), the identity flips to
   "revoked", and it resolves zero tools thereafter. The After-action / events timeline shows a
   `security.decision` revoked event carrying counts, no tool arguments.

## 7. Results ledger

Record outcomes below (pass / fail / not-run per section). A breach that reports honestly is a
PASS, not a failure — the point is that the budget is a fact enforced outside the model.
