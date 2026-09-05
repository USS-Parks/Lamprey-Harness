# Lamprey Planning Canon

## Canonical Shorthand

**P-SPR = Plan - Sequential Prompt Roster.**
A single canonical `PLANNING/*.md` file that defines one phase end to end: goal, scope, non-goals, ordered prompts, files, verify gates, commit/devlog discipline, completion criteria, and approval state. Pasted or drafted text becomes a P-SPR only after it is saved as that plan file.

**STS = Stem to Stern.**
After the user explicitly approves a P-SPR or says to run it STS, execute the roster in order from first prompt through phase wrap, verifying/logging/committing each prompt as specified. Do not treat a plan's own "STS authorization" wording as approval by itself. Do not skip prompts, batch prompts, push early, or reopen plan decisions unless blocked by new facts.

## Live canon (root)

| File | Role |
|------|------|
| `LAMPREY_TRIPLE_LANE_PLAN.md` | **Current working P-SPR** — Triple Lane B/C is wired in the product as **v0.31.0** (not source-wrap-only). GitHub release v0.31.0 exists (tag workflow 32671185022; latest.yml version 0.31.0). README download links point there. Auto-update follows GitHub, not CDN. A Bucket run attempted R2 + CDN purge and then lost the GitHub Windows upload race to CI (PR #5). `scripts/bucket.ps1` later gained retry/reconcile; that does not close TL-W4. TL-W4 stays [ ] until GitHub asset sha256 == local dist/ == CDN is proven, or Bucket is re-run. Do not tell operators the installers are still v0.30.0. |
| `TL_BASELINE.md` | Triple Lane baseline (tip, touchpoints, Lane C audit) |
| `TL_CLAUDE_CODE_INVENTORY.md` | Lane A inventory + empty pick list (K12) |
| `TL_OPENROUTER_MAP.md` | Lane B request-seam map |
| `LAMPREY_TOOLS_MCP_ROSTER_PLAN.md` | Tools + MCP Roster P-SPR — shipped as v0.30.1 |
| `TR_BASELINE.md` | Roster baseline (packs, CORE lists, dual catalog, K8 table) |
| `LAMPREY_OPERABILITY_DEBT_PLAN.md` | Operability Debt P-SPR — shipped reference (v0.30.0) |
| `OD_BASELINE.md` / `OD_AFTER.md` | Operability Debt before/after measurements |
| `LAMPREY_AUDIT_CLOSURE_PLAN.md` + `AC_AFTER.md` + `AC_BASELINE.md` + `AC_PARALLEL_HANDOFF.md` | Audit Closure authority (v0.29.0). Do not delete. |
| `LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md` + `CJ26_AFTER.md` + `CJ26_FOLLOW_ON_CANDIDATES.md` | Codex July 2026 parity ledger. Implementation-complete, not current-Codex parity. |
| `PSPR_TEMPLATE.md` | Blank roster template |

## Archive

Spent phase trees live in [`archive/`](archive/README.md). They are reference-only. PX2, Fluidity, Hygiene, Unburdening, and the rest of the shipped P-SPRs were moved there on 2026-08-23 (OD-10). Provider Discovery Expansion v2 (v0.27.0) and the v0.27.1 routing hotfix remain historical records in that folder; they are not a change to the Codex ledger.

M4 / Code Mode stays parked indefinitely.

---

Authored and reviewed by Basho Parks, copyright 2026
