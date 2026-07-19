# Lamprey Planning Canon

## Canonical Shorthand

**P-SPR = Plan - Sequential Prompt Roster.**
A single canonical `PLANNING/*.md` file that defines one phase end to end: goal, scope, non-goals, ordered prompts, files, verify gates, commit/devlog discipline, completion criteria, and approval state. Pasted or drafted text becomes a P-SPR only after it is saved as that plan file.

**STS = Stem to Stern.**
After the user explicitly approves a P-SPR or says to run it STS, execute the roster in order from first prompt through phase wrap, verifying/logging/committing each prompt as specified. Do not treat a plan's own "STS authorization" wording as approval by itself. Do not skip prompts, batch prompts, push early, or reopen plan decisions unless blocked by new facts.

## Current roster

`LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md` is the current canonical roster.
Its Steering and Queue milestone shipped as v0.20.0, and its independently approved Task and
Thread Control milestone shipped as v0.21.0. The visualization/artifact and PR Chat
milestones shipped together as v0.23.0.
M4 / Code Mode is parked indefinitely and is not a dependency or blocker. The independently
approved M6 MCP resources/authenticated-session lane was released as v0.24.0 on 2026-07-19.
M7, M8, and M9 remain unapproved. The paired
Steering replay, packaged task-control/artifact/PR Chat GUI playbooks, and M6 local-fixture/
hosted-auth playbooks remain open evidence gates; these milestones are implementation-
complete, not parity-complete.

---

Authored and reviewed by Basho Parks, copyright 2026
