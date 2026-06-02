# Code-Quality Review Assessment — Lamprey Harness

Assessment of an incoming code-quality review. Each flagged concern is verified
against the actual codebase and given a verdict, so we act only on real findings
and don't fight the project's documented architecture.

## Verdicts on the original concerns

| # | Concern | Verdict | Why |
|---|---------|---------|-----|
| 1 | `code-review.md` duplicated in `skills/` and `resources/skills/` | ❌ Reject — intentional | Build-time payload, not stray duplication. Per `CLAUDE.md`, `skill-loader.ts` reads `skills/` in dev and bootstraps `userData/skills/` from `resources/skills/` in production. The entire skills tree is mirrored (`git-commit`, `direct-voice`, all 7 `codex-*` SKILLs) — the signature of a packaged-resources copy. Merging into one `docs/` dir would break the production loader. |
| 2 | Skill descriptions repeated in `SKILLS.md` | ⚠️ Low priority | `SKILLS.md` (191 lines) is a user-facing catalog; overlap with per-skill frontmatter is expected. A future generator could derive it from frontmatter, but not worth restructuring now. |
| 3 | Large docs (`DEVLOG.md`) deter review | ⚠️ Cosmetic | `DEVLOG.md` (~117 KB) is an append-only build journal, intended to be long. Moving it under `logs/` is churn that breaks inbound links. Leave as-is. |
| 4 | `MemoryPanel.tsx` binds errors to local state | ✅ Valid — confirmed outlier | Centralized `toast` store exists and 26 components use it; `MemoryPanel` was the exception. See deep dive. **Fixed.** |
| 5 | Add static analysis (SonarQube/Codacy) | ✅ Partly valid | External SaaS is overkill, but the ESLint setup was broken (ESLint 10 + legacy config). Migrated to flat config + cycle detection. See deep dive. **Fixed.** |

Bottom line: concerns 1–3 are largely false positives that conflict with the
documented architecture. Concerns 4 and 5 are the real findings.

## Deep dive 1 — MemoryPanel error handling (FIXED)

The codebase has a centralized notification system:

- `src/stores/toast-store.ts` exposes `toast.error()/success()/warning()/info()`.
- Adopted by 26 components, including the sibling `src/components/memory/MemoryModal.tsx`.

`MemoryPanel.tsx` was the lone holdout, rolling its own error channel via an
`importError` `useState` plus a bespoke inline error banner.

**Change applied:** removed the `importError` state and inline banner; the
`handleImportFile` catch now calls
`toast.error(\`Import failed: ${(err as Error).message}\`)`, matching the rest of
the app. Net ~8 lines removed.

### Adjacent silent-failure smell (FIXED)

`memory-store.ts` previously swallowed most IPC failures silently — `addMemory`
returned `null` on failure, and `loadMemories` / `updateMemory` / `deleteMemory`
/ `restoreMemory` / `clearAll` / `exportMemories` all returned on
`!result.success` with no user feedback (import was the only operation that
surfaced errors). Every one of these now routes its failure through
`toast.error`. `clearAll` additionally restores the prior list on failure
(it optimistically clears state before the IPC call), and `importMemories`
throws on IPC failure so the caller's existing catch reports it through the same
toast path as parse/validation errors.

## Deep dive 2 — Static analysis config (IMPLEMENTED)

SaaS (SonarQube/Codacy) is unnecessary; the local linting had concrete problems,
now fixed. Confirmed empirically: under ESLint 10.4.1, `npm run lint` failed with
*"ESLint couldn't find an eslint.config.(js|mjs|cjs) file"* — linting was
completely dead.

**What changed:**

- **A. Flat-config migration.** Replaced `.eslintrc.cjs` (which ESLint 10 ignores)
  with `eslint.config.mjs`, mirroring the old ruleset. Also fixed the `lint`
  script: `eslint . --ext .ts,.tsx` → `eslint .` (flat config removed `--ext`).
- **B. Circular-dependency detection.** Added `eslint-plugin-import-x`
  (the actively-maintained fork; the original `eslint-plugin-import` caps its
  peer at ESLint 9 and won't install against ESLint 10) with
  `import-x/no-cycle: error`, plus `eslint-import-resolver-typescript` so the
  `@/` alias and `.ts` extensions resolve.
- **D. `no-explicit-any`** bumped from `off` → `warn` (surfaces 200 pre-existing
  sites; non-blocking, stops new `any`).
- **React hooks linting.** The source already wrote
  `// eslint-disable-next-line react-hooks/exhaustive-deps` directives against a
  plugin that was never installed. Added `eslint-plugin-react-hooks@7` and
  enabled the two classic rules (`rules-of-hooks`, `exhaustive-deps`); the v7
  React-Compiler ruleset is deliberately left off.
- **`jsx-a11y` directives.** `eslint-plugin-jsx-a11y` caps its peer at ESLint 9,
  so installing it would break CI's `npm ci`. Since the 2 inline
  `jsx-a11y/no-autofocus` directives referenced a plugin that was never present
  (always a no-op), they were removed instead.
- **Vendor bundles ignored.** `resources/vendor/**` (minified mermaid/babel) is
  now in `ignores` — the legacy `--ext .ts,.tsx` never reached them, but a flat
  config that lints `.js` would otherwise report ~12.5k noise errors there.

**Verification:** `npm run lint` runs; `npm ci --dry-run` resolves with no peer
conflicts (CI-safe); both `tsc` projects pass.

**Not done — deferred (C):** type-aware linting (`parserOptions.project` +
`no-floating-promises`). It roughly doubles lint time and would surface a large
new error set; worth a dedicated pass.

### Pre-existing findings surfaced by the now-working linter (FIXED)

These were latent issues the broken linter could never report. All 19 are now
fixed, so `npm run lint` is clean (0 errors; the remaining 200 `no-explicit-any`
warnings are intentional and non-blocking). Verified: lint clean, both `tsc`
projects pass, all 307 tests pass.

- `react-hooks/rules-of-hooks` — `ModelSettings.tsx`: the click handler `usePreset`
  was renamed to `applyPreset` (it was never a hook; the `use*` name tripped the
  rule and was misleading).
- `preserve-caught-error` (7) — `image-gen-providers.ts` (×5),
  `native-aux-tools.ts`, `resources/mcp/node-repl/server.js`: re-thrown errors now
  pass `{ cause: err }`, preserving the original error chain.
- `@typescript-eslint/no-unused-expressions` (3) — `MarkdownRenderer.tsx`,
  `ApiKeyModal.tsx`, `ApiKeySettings.tsx`: `cond ? a() : b()` / `a ?? b`
  side-effect statements converted to `if/else`.
- `no-useless-assignment` (3) — `file-handler.ts`, `frontend-qa-tool.ts`,
  `tool-calls-store.ts`: dropped dead initializers (`let x: T` declared, assigned
  on every path).
- `no-useless-escape` (4) — `smoke-bundle.cjs`: removed needless backtick escapes
  inside a single-quoted string.
- `@typescript-eslint/no-require-imports` (1) — `pty-manager.ts`: the lazy
  `require('fs')` became a top-level `import { existsSync } from 'fs'`.

## Error-chaining hardening

To stop dropped error causes from recurring:

- **Audit beyond the linter.** `preserve-caught-error` only sees `try/catch`
  re-throws. Swept the codebase for patterns it cannot reach — custom `Error`
  subclasses (none), `.catch()` handlers, and `reject(new Error(...))` in Promise
  executors / event handlers. One genuine gap found and fixed:
  `electron/ipc/mcp.ts` `server.on('error', ...)` wrapped the underlying error
  without `cause`. (The `onError(error: string)` provider-stream boundaries in
  `chat.ts`/`registry.ts` are string-typed by contract — a `cause` cannot cross
  the IPC boundary there — and the `main.ts` `.catch()` handlers are terminal
  log-only, so neither is a chaining defect.)
- **Pinned the rule explicitly.** `preserve-caught-error: 'error'` is now set
  directly in `eslint.config.mjs` (both the TS and JS blocks) rather than relying
  on `js.configs.recommended`, so it stays enforced even if the recommended set
  changes. Verified end-to-end: an injected re-throw-without-`cause` is reported
  as an error (non-zero exit).
