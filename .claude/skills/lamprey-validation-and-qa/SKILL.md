---
name: lamprey-validation-and-qa
description: What counts as evidence in Lamprey — the layered verify gate, current baseline numbers, the source-lock test pattern, native-skip accounting, the LL and LP smoke playbooks, and the checklist for adding tests. Load before claiming anything works, when writing or modifying tests, when interpreting test/skip counts, or when a gate fails.
---

# Lamprey Validation & QA

## When to use / when not

- **Use** before claiming a change works, when adding tests, interpreting suite output, or deciding what evidence a claim needs.
- **Don't use** for environment/ABI setup issues (see `lamprey-build-and-env`), the analysis recipes behind these techniques (see `lamprey-proof-and-analysis-toolkit`), or release gating (see `lamprey-ship-and-release`).

## TL;DR — the evidence bar

- A claim of "works" requires the relevant gate **run in this session** with its output. Never report a gate as passed without running it; failing output gets quoted, not summarized away.
- A skipped test is a finding, not noise (the v0.9.2 lesson).
- Behavioral quality claims (model cogency, UX) require a **playbook run**, not vibes.

## The layered gate and what each layer catches

| Layer | Command | Catches |
|---|---|---|
| Lint | `npm run lint` | style + obvious defects |
| Types | `npx tsc --noEmit -p tsconfig.node.json` AND `-p tsconfig.web.json` | both process worlds; both must pass, always |
| Unit/integration | `npm test` (vitest, colocated `*.test.ts(x)`, node env, 15s timeout) | logic + the source-lock invariants |
| Bundle smoke | `npm run smoke:bundle` | load-time failures the bundler can introduce (TDZ/hoisting) — requires `out/` from a build |
| Renderer smoke | `npm run smoke:renderer` | built `index.html` asset integrity, non-empty chunks, React mounts |
| Composite | `npm run verify:proof` | all of the above + **native-skip accounting**; flags: `--no-tests` (CI static mode), `--require-smokes`, `--list-native-skips` |

**Baseline numbers (v0.16.0, 2026-07-02 — re-verify, they drift):** vitest **2334 passed / 130 skipped / 0 failed**; `npm audit --omit=dev` = 0 vulnerabilities; coverage floors statements 13 / branches 12 / functions 9 / lines 14 % (regression guards, **not** quality targets); zero `.only` anywhere.

## Skip taxonomy (why 130 skips is currently honest)

- **Native-DB guard**: ~23 files wrap suites in `describe.skipIf(!HAS_NATIVE_SQLITE)` where the flag is a runtime probe (`new BetterSqlite3(':memory:')` in a try/catch). Historically these skipped due to the Electron-vs-Node ABI mismatch; since Electron 43/Node 22 the binding loads and they **run**. `verify:proof` prints the accounting either way (SP-9) — read it every run.
- **Platform gates** (Windows-only behavior on ubuntu CI), one network skip, one Linux-integration skip, one hard `describe.skip`.
- If the skip count jumps, treat it as an incident: `npm run verify:proof -- --list-native-skips` and find out what stopped loading.

## The source-lock test pattern (this project's signature technique)

A source-lock test doesn't execute behavior — it **reads source text and asserts a structural invariant**, locking wiring/defaults/vocabulary claims that behavioral tests can't reach cheaply. Canonical examples:

| Test | Locks |
|---|---|
| `electron/services/default-app-settings.test.ts` | canonical defaults ≡ renderer literal, byte-for-byte (SP-1 drift incident) |
| `electron/services/loop-safety.test.ts` | `loopsEnabled` gate present at every loop entry point |
| `src/components/chat/era-chrome.test.ts` | no pipeline/stage/proof jargon in UI strings |
| `src/components/layout/Sidebar.project-flow.test.ts` | **negative lock**: `window.prompt(` never returns to the sidebar |

**Write one when** the claim is "X is wired / gated / absent / identical in two places" and a regression would be silent. **Don't** use it for behavior a normal test can execute — source-locks are brittle to refactors by design; that brittleness is the alarm.

## The node:sqlite alternative for DB tests

`electron/services/loop-db-integration.test.ts` runs the exact v17/v18 DDL and query shapes against Node's built-in `node:sqlite` — zero ABI risk, zero skips. Prefer this pattern for pure-schema/query-shape coverage; use better-sqlite3-gated tests only when the native binding's behavior itself matters.

## The smoke playbooks (the live evidence bar)

- **`PLANNING/LL_SMOKE_PLAYBOOK.md`** — 8 fixed asks (trivia, one-line edit, typo fix, bug investigation, feature build, cross-file refactor, phase ship, plan draft) with per-ask expected signals. Current criteria (v0.14.0+): all asks single-agent, zero machinery chrome, reply is the model's reply byte-for-byte. **Run it after any change to prompts, contracts, routing, or model dispatch** — this is how the F-code regressions were caught (see `lamprey-failure-archaeology` #9).
- **`PLANNING/LP_SMOKE_PLAYBOOK.md`** — 8 live loop tests (enable, interval cadence, headless, self-paced, autonomous backlog, ceilings, stop authorities, backlog persistence). The executable superset lives in `lamprey-loop-reliability-campaign`.

Playbook runs need a built app and live provider keys — they are user/owner-run when a GUI is required; say so honestly rather than skipping silently.

## Checklist: adding a test

1. Colocate as `*.test.ts` (or `.tsx`) next to the source; vitest picks up `electron/**` and `src/**` patterns.
2. Choose the type: behavioral (default) / source-lock (wiring/parity/absence claims) / node:sqlite integration (schema shapes).
3. If it needs better-sqlite3: use the `HAS_NATIVE_SQLITE` probe guard, and **confirm the test actually runs** in your environment (`npx vitest run <file>` and check it's not skipped) — a guarded test you never saw run proves nothing.
4. Never commit `.only`. Keep the 15s timeout in mind for anything spawning processes.
5. If the test locks a fixed defect, name the incident in a comment so future readers don't "simplify" it away.
6. Run the affected subset + both tsc configs before commit (the pre-commit hook enforces types + lint anyway).

## Provenance and maintenance

Based on reads of `vitest.config.ts`, `scripts/verify-proof.cjs` (flags verified 2026-07-02), the four source-lock tests, `scripts/smoke-*.cjs`, and both playbooks, at v0.16.0.

Re-verify:
- Current counts: `npm test 2>&1 | tail -5`
- Skip accounting: `npm run verify:proof -- --list-native-skips`
- Coverage floors: `grep -n "statements\|branches\|functions\|lines" vitest.config.ts`
- Playbooks still current: `ls PLANNING/*PLAYBOOK*`
