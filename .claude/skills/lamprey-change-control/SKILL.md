---
name: lamprey-change-control
description: How changes are classified, gated, approved, committed, and shipped in the Lamprey Harness repo. Load this BEFORE making any change — code, docs, config, or release — or when you see terms like P-SPR, STS, verify gate, era-lock, commit trailer, push policy, or when a commit/push is rejected by a hook.
---

# Lamprey Change Control

## When to use / when not

- **Use** before starting any work in this repo, when planning a phase, when a hook rejects your commit, when deciding whether something needs user approval, or when tempted to add a feature.
- **Don't use** for the mechanics of running tests (see `lamprey-validation-and-qa`), release execution (see `lamprey-ship-and-release`), or writing DEVLOG/README entries (see `lamprey-docs-and-writing`).

## TL;DR

1. Classify the change: trivial one-off → just do it with the standard gates. Anything non-trivial → **plan first, get explicit approval, then execute**.
2. Non-trivial work follows **P-SPR → approval → STS**: a saved plan file, an explicit user green light, then prompt-by-prompt execution with a verify gate and one commit per prompt.
3. Every commit must pass the hook gates (lint, tsc ×2, AI-artifact scan, message rules including a mandatory trailer).
4. **Never push unless the user asked.** When they ask, push on the first try.
5. The project is **era-locked**: features beyond the Claude Code / Opus 4.5 era (2025-11-24 → 2026-01-24) require explicit user authorization, documented as such.

## Change classification

| You want to… | Classification | Required gate |
|---|---|---|
| Fix a typo, single small edit, answer a question | Trivial one-off | Standard commit gates (hooks run tsc ×2 + lint + artifact scan) |
| Fix a bug touching 1–3 files | Small change | Same + targeted `npx vitest run <affected tests>`; `npm run verify:proof -- --no-tests` if `electron/ipc/chat.ts` is touched |
| Add a feature, refactor across files, new subsystem | **Non-trivial** | Full P-SPR → approval → STS cycle (below) |
| Add anything beyond the Opus 4.5-era feature set | **Era-lock exception** | Explicit user authorization first; document the exception (see Loop Phase precedent) |
| Release a version | Ship | `lamprey-ship-and-release` pipeline + README update (`lamprey-docs-and-writing`) |
| Delete a subsystem | Non-trivial + user direction | Deletion is a legitimate tool here (Unburdening precedent) but only on explicit user direction |

## The P-SPR → approval → STS cycle

**P-SPR** = *Plan – Sequential Prompt Roster*. A single canonical plan file at `PLANNING/LAMPREY_<PHASE>_PLAN.md` (template: `PLANNING/PSPR_TEMPLATE.md`) defining one phase end to end: goal, scope, non-goals, ordered numbered prompts, files touched, verify gates, commit/DEVLOG discipline, completion criteria, and approval state.

- Drafted or pasted text is **not** a P-SPR until saved as that plan file.
- A plan's own "STS authorization" wording is **not** approval. Only the user's explicit go-ahead is.

**STS** = *Stem to Stern*. After explicit approval, execute the roster in order, first prompt through phase wrap. Per prompt:

1. Do the work of that prompt only. No skipping, batching, or reopening plan decisions unless blocked by new facts.
2. Pass the verify gate:
   - `npx tsc --noEmit -p tsconfig.node.json` — clean
   - `npx tsc --noEmit -p tsconfig.web.json` — clean
   - `npx vitest run <affected test files>` — passing
   - If `electron/ipc/chat.ts` was touched: `npm run verify:proof -- --no-tests` → exit 0
3. Write the DEVLOG entry (format in `lamprey-docs-and-writing`).
4. Commit — **one commit per prompt**, message per the hook rules below.
5. Mark the prompt `[x]` in the plan.

Phase wrap gate: full `npx vitest run` + `npm run build` + `npm run verify:proof`, version bump, README + CLAUDE.md current-state update, DEVLOG phase entry.

## Hook-enforced commit rules (verified against `scripts/hooks/` 2026-07-02)

Install once: `npm run hooks:install` (sets `core.hooksPath` to `scripts/hooks`).

**pre-commit** runs, in order: `node scripts/check-ai-artifacts.cjs` → `npm run lint` → `npx tsc --noEmit -p tsconfig.node.json` → `npx tsc --noEmit -p tsconfig.web.json`. First failure stops the commit.

**commit-msg** hard rules:
- Required trailer, verbatim, on its own line: `Agentically Engineered and Reviewed by Basho Parks - 2026`
- Subject: non-empty, ≤ 72 chars, states the change (no filler openers: "This commit", "Updated", "Various", "Misc", "WIP", "Changes", "Some")
- Banned phrases anywhere in the message (case-insensitive): `Co-Authored-By: Claude`, `Generated with`, `🤖`, `As an AI`, `Certainly`, `Here's what`, `Here is what`, `Key changes:`, `Summary of changes`, `In this commit`, `This PR `, `delve`, `seamlessly`, `leverages `
- Body cap: subject + up to 12 body lines (trailer excluded). Long explanations go in `DEVLOG.md`.
- Bypass requires `--no-verify` — a deliberate human decision, not a convenience.

**pre-push** runs `npm run verify:proof` (full gate).

**check-ai-artifacts.cjs** scans the *staged diff* (added lines) for machine residue: elision placeholders ("… existing code …"), placeholder tags/secrets (`YOUR_API_KEY`), assistant voice ("As an AI…"), narration comments in code ("Let's…", "TODO: implement"). Exempt paths include `PLANNING/**`, `DEVLOG.md`, `README.md`, `*.md`. Deliberate bypass: `ALLOW_AI_ARTIFACTS=1 git commit …` (rare).

## Push policy

- The **user is the reviewer and pusher**. Do not volunteer pushes.
- When the user explicitly asks to push (any phrasing), execute on the first try — the request itself satisfies the review step.
- Never `--force` without an explicit force-push instruction.
- Parallel sessions on this repo must run in separate git worktrees so commits don't conflate.

## Era-lock as a change-control rule

Scope is locked to Claude Code / Opus 4.5-era parity (2025-11-24 → 2026-01-24). Features from later eras are **out of scope by default**. The one shipped exception is the Loop Phase (v0.15.0), and it is the template for how an exception happens:

1. Explicit user authorization in their own words ("incorporate a Looping option").
2. Documented as a deliberate exception in CLAUDE.md, the plan, and the DEVLOG.
3. Shipped **OFF by default** (`loopsEnabled: false`) so the era-faithful default experience is unchanged.

Corollary: the multi-agent pipeline, auto-router, runtime proof gate, and composer were deliberately **deleted** (Unburdening, v0.14.0, −7,400 lines). Do not rebuild them. If old docs reference them, those entries are historical record.

## The non-negotiables and the incident behind each

| Rule | Rationale | Incident |
|---|---|---|
| Every prompt passes its verify gate before commit | A green gate that silently skips is how P0s ship | **v0.9.2**: the schema-init regression test was silently skipping under a native-binding ABI mismatch; an invalid DDL shipped and every chat send failed. See `lamprey-failure-archaeology`. |
| Tests must assert the *right* invariant, not just pass | A passing suite can codify a defect | **v0.11.1**: two unit tests asserted that the Coder's reply was *excluded* from the reviewer packet — locking the bug in and making it invisible at CI. |
| No debug/diagnostic code force-enabled in shipped builds | Plaintext logs can capture secrets | **JM-1/SEC-3**: v0.15.x shipped with `forceDebugTraceOn()` persisting tool arguments to a plaintext log. Removed in v0.16.0. |
| Config-file writes must be atomic; corrupt files preserved, never healed to `{}` | A torn write must not destroy credentials | **JM-13**: pre-v0.16.0, a crash mid-write to `keys.json` could wipe every provider key permanently. Now temp+rename via `electron/services/atomic-json.ts`. |
| Prefer deletion over gating for out-of-scope machinery | Gated dead weight still costs prompt bytes, maintenance, and cogency | **Unburdening (v0.14.0)**: user-directed excision of the multi-agent stack; the product got simpler and prompt bytes dropped. |
| Any settings default must change in BOTH canonical and renderer literals | Silent drift between main and renderer once shipped wrong behavior | **SP-1**: renderer said `'auto'`, main said `'single'`, main silently won. Now `default-app-settings.test.ts` locks them byte-for-byte. |
| Documented ≠ wired: verify call sites | Load-bearing claims were found scaffolded but dead | **Wiring Closure (v0.9.1)**: seven documented features had no caller. **LP-0**: the loop scaffold never ran a turn. See `lamprey-proof-and-analysis-toolkit` recipe 2. |

## Provenance and maintenance

Based on direct reads of `scripts/hooks/commit-msg`, `scripts/hooks/pre-commit`, `scripts/hooks/pre-push`, `scripts/check-ai-artifacts.cjs`, `PLANNING/PSPR_TEMPLATE.md`, and CLAUDE.md Execution Rules, at v0.16.0 (2026-07-02).

Re-verify when in doubt:
- Trailer text: `grep -n "TRAILER=" scripts/hooks/commit-msg`
- Gate composition: `cat scripts/hooks/pre-commit scripts/hooks/pre-push`
- Current version: `node -e "console.log(require('./package.json').version)"`
- Active plan (should be none unless a new phase started): `ls PLANNING/*.md` + check CLAUDE.md "Current State"
