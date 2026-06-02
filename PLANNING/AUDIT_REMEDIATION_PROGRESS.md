# Audit Remediation — Progress Log

Tracks execution of `AUDIT_REMEDIATION_PLAN.md` (remediation of `REPO_AUDIT.md`,
2026-06-02). One row per prompt; one DEVLOG entry per landed prompt.

## Status legend

- **Done** — code in tree, both tsc configs pass, lint clean, vitest green, smokes pass where applicable, all acceptance criteria met.
- **Mostly done** — code in tree and tsc/lint pass, but one or more acceptance criteria not yet demonstrably met (see Known gaps).
- **Partial** — substantive work landed but the prompt is not finished.
- **Pending** — not started.

## Known decisions (carry forward)

- **agentMode (Prompt 11) = rewire, not remove.** Per user direction, the dead `agentMode` toggle/roster is wired to a real sequential Planner→Coder→Reviewer pipeline (reusing the dormant `agent:status` UI + `runChatRound` for the tool-enabled Coder). The `multi_agent_run` tool stays as the orthogonal mid-turn parallel fan-out path.
- **Test foundation (Prompt 5) before the renderer-touching prompts (8, 11).** Their jsdom tests depend on it.

## Known gaps (carry forward)

_None yet — populate as prompts land._

## Roster

| # | Title | Findings | Status |
|---|-------|----------|--------|
| 1 | Hygiene & quick wins | DOC-4, STRUCT-1/2, DEP-1/2/3, CI-3 | Done |
| 2 | Documentation refresh | DOC-1/2/3/5/6, SEC-4 | Pending |
| 3 | CI: run smokes on PRs | CI-1 | Pending |
| 4 | Streaming & connection bugs | BUG-1, BUG-2 | Pending |
| 5 | Test foundation (jsdom + stores/services) | TEST-1, TEST-2 | Pending |
| 6 | Renderer privilege hardening | SEC-1, SEC-7 | Pending |
| 7 | Main-process correctness | BUG-3, BUG-5, QUAL-2, QUAL-3 | Pending |
| 8 | Renderer + IPC-contract correctness | BUG-4, BUG-6 | Pending |
| 9 | Model-input security | SEC-2, SEC-5, SEC-6, SEC-8 | Pending |
| 10 | Secrets & OAuth hardening | SEC-3, SEC-9, SEC-10 | Pending |
| 11 | `agentMode` rewire (Planner→Coder→Reviewer) | QUAL-1, (opt) QUAL-4 | Pending |
| 12 | CI: macOS build + coverage baseline | CI-2 | Pending |

## Baseline (at planning time, `main` @ `dfc3f6e`)

- `npx tsc --noEmit -p tsconfig.node.json` / `-p tsconfig.web.json` — pass.
- `npm run lint` — 0 errors (200 intentional `no-explicit-any` warnings).
- `npm test` — 340 tests / 25 files.
- `npm run smoke:bundle` / `smoke:renderer` — PASS.
- `npm run typecheck` — **no-op** (DOC-4; fixed in Prompt 1).

## Prompt entries

## Prompt 1 — Hygiene & quick wins — Done (2026-06-02)

Low-risk cleanups; no behavior change. Closes DOC-4, STRUCT-1, STRUCT-2, DEP-1/2/3, CI-3.

### Files
- `package.json` — `typecheck` → `tsc --noEmit -p tsconfig.node.json && -p tsconfig.web.json` (DOC-4); removed `@playwright/test` (DEP-1); `electron-rebuild` → `@electron/rebuild` `^3.7.2`, `postinstall` unchanged (DEP-2); pinned the eslint toolchain to exact versions (DEP-3).
- `electron/ipc/settings.ts` — replaced the 3 `deepseekClient` calls with `resetProviderClient('deepseek')` / `validateProviderKey('deepseek')`, merged into the existing registry import (STRUCT-2).
- `electron/services/deepseek.ts` — **deleted** (legacy shim; settings.ts was the only importer).
- `src/components/mcp/MCPStatusBar.tsx`, `src/components/model/ModelSwitcher.tsx` — **deleted** (orphaned; dirs removed) (STRUCT-1).
- `.github/workflows/build.yml` — added a per-ref `concurrency` group (CI-3).
- `package-lock.json` — regenerated.

### Verification
- `npm run typecheck` — pass (now actually checks both configs; previously a no-op).
- `npm run lint` — 0 errors.
- `npm test` — 340 tests / 25 files (unchanged; deletions had no tests).
- `npm run build` + `npm run smoke:bundle` + `npm run smoke:renderer` — PASS.
- `@electron/rebuild` bin = `electron-rebuild` with `-f`/`-w` intact; `npm ci --dry-run` clean.

### Acceptance
- ✅ `npm run typecheck` compiles both subprojects (caught a latent duplicate import on first run).
- ✅ No importer of `deepseek.ts` remains; provider key save/test/delete flows route through the registry.
- ✅ Orphaned components gone; bundle smokes pass.
