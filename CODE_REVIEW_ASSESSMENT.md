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
| 5 | Add static analysis (SonarQube/Codacy) | ✅ Partly valid | External SaaS is overkill, but the existing ESLint setup has real gaps and is very likely broken. See deep dive. |

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

### Adjacent silent-failure smell (not yet addressed)

`memory-store.ts` swallows most IPC failures silently — `addMemory` returns
`null` on failure, and `updateMemory` / `restoreMemory` / `clearAll` return on
`!result.success` with no user feedback. `MemoryPanel.handleExport` also bails
quietly if `exportMemories()` returns null. Import was the only operation that
surfaced errors. A higher-value follow-up is routing all of these failures
through `toast.error`, not just import.

## Deep dive 2 — Static analysis config (recommendation only)

SaaS (SonarQube/Codacy) is unnecessary; the local linting has concrete problems.

**A. The ESLint config is very likely non-functional.** `package.json` pins
`eslint: ^10.4.1`, but the only config is the legacy `.eslintrc.cjs` (no
`eslint.config.js`). ESLint 10 removed eslintrc (legacy) support — it is
flat-config only — so `npm run lint` most likely errors out / finds no config.
**Fix:** migrate `.eslintrc.cjs` → flat `eslint.config.js`. Highest-value lint
change; linting may currently be silently dead.

**B. No circular-dependency or unused-export detection.** Current config
(`eslint:recommended` + `@typescript-eslint/recommended`) can't do it. Add
`eslint-plugin-import` and enable `import/no-cycle` and
`import/no-unused-modules` — the no-SaaS equivalent of the SonarQube checks.

**C. No type-aware linting.** `.eslintrc.cjs` has no `parserOptions.project`, so
rules like `no-floating-promises` are off — notable in a codebase full of
`await window.api.*` calls and fire-and-forget handlers. Wire
`parserOptions.project` to the existing `tsconfig.node.json`/`tsconfig.web.json`.

**D. `no-explicit-any` is globally `off`** (`.eslintrc.cjs:23`). Defensible given
the IPC `{success,data}` casting pattern, but at least `warn` would stop new
`any` from creeping in.

Suggested no-SaaS upgrade path (priority order): (1) flat-config migration to
unbreak lint, (2) add `eslint-plugin-import` with `no-cycle`, (3) enable
type-aware linting + `no-floating-promises`.
