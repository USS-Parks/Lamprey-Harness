# Lamprey Planning Canon

## Canonical Shorthand

**P-SPR = Plan - Sequential Prompt Roster.**
A single canonical `PLANNING/*.md` file that defines one phase end to end: goal, scope, non-goals, ordered prompts, files, verify gates, commit/devlog discipline, completion criteria, and approval state. Pasted or drafted text becomes a P-SPR only after it is saved as that plan file.

**STS = Stem to Stern.**
After the user explicitly approves a P-SPR or says to run it STS, execute the roster in order from first prompt through phase wrap, verifying/logging/committing each prompt as specified. Do not treat a plan's own "STS authorization" wording as approval by itself. Do not skip prompts, batch prompts, push early, or reopen plan decisions unless blocked by new facts.

## Current roster

`LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md` is the current canonical roster.
Its Steering and Queue milestone shipped as v0.20.0, its independently approved Task and
Thread Control milestone shipped as v0.21.0, and its independently approved visualization
and artifact-editing milestone is locally complete as v0.22.0 but not published. M4 and later
milestones remain unapproved and must not start from any earlier release instruction. The
paired Steering replay and packaged task-control/artifact GUI playbooks remain open evidence
gates; these milestones are implementation-complete, not parity-complete.

---

Authored and reviewed by Basho Parks, copyright 2026
