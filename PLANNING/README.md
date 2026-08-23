# Lamprey Planning Canon

## Canonical Shorthand

**P-SPR = Plan - Sequential Prompt Roster.**
A single canonical `PLANNING/*.md` file that defines one phase end to end: goal, scope, non-goals, ordered prompts, files, verify gates, commit/devlog discipline, completion criteria, and approval state. Pasted or drafted text becomes a P-SPR only after it is saved as that plan file.

**STS = Stem to Stern.**
After the user explicitly approves a P-SPR or says to run it STS, execute the roster in order from first prompt through phase wrap, verifying/logging/committing each prompt as specified. Do not treat a plan's own "STS authorization" wording as approval by itself. Do not skip prompts, batch prompts, push early, or reopen plan decisions unless blocked by new facts.

## Live canon (root)

| File | Role |
|------|------|
| `LAMPREY_OPERABILITY_DEBT_PLAN.md` | Active P-SPR (OD-0…OD-14) → v0.30.0 |
| `OD_BASELINE.md` / `OD_AFTER.md` | Before/after measurements for this phase |
| `LAMPREY_AUDIT_CLOSURE_PLAN.md` + `AC_AFTER.md` + `AC_BASELINE.md` + `AC_PARALLEL_HANDOFF.md` | Audit Closure authority (v0.29.0). Do not delete. |
| `LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md` + `CJ26_AFTER.md` + `CJ26_FOLLOW_ON_CANDIDATES.md` | Codex July 2026 parity ledger. Implementation-complete, not current-Codex parity. |
| `PSPR_TEMPLATE.md` | Blank roster template |

## Archive

Spent phase trees live in [`archive/`](archive/README.md). They are reference-only. PX2, Fluidity, Hygiene, Unburdening, and the rest of the shipped P-SPRs were moved there on 2026-08-23 (OD-10). Provider Discovery Expansion v2 (v0.27.0) and the v0.27.1 routing hotfix remain historical records in that folder; they are not a change to the Codex ledger.

M4 / Code Mode stays parked indefinitely.

---

Authored and reviewed by Basho Parks, copyright 2026
