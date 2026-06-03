# Audit Remediation Plan

Implementation roster for closing out the findings in `REPO_AUDIT.md` (committed `f37a823` on `claude/code-quality-review-z3VhL`): 6 High, ~10 Medium, plus Low/Info across security, correctness, tests/CI, deps, docs, and structure.

Each prompt is one focused PR (per CONTRIBUTING's one-feature-per-PR rule) and copy-pasteable into a fresh Claude Code session. Prompts are ordered so quick-wins and the PR-smoke guard land first (small surface area, immediate hygiene win); High-severity bugs and the test foundation land before the renderer hardening that depends on jsdom; the dormant `agentMode` rewire comes after the test foundation so the new pipeline ships with coverage; CI breadth lands last.

Companion tracker: [AUDIT_REMEDIATION_PROGRESS.md](AUDIT_REMEDIATION_PROGRESS.md). Flip a row from `Pending` to `Done` only after the prompt's `Acceptance` bullets all hold and the universal gate passes.

## Universal gate (every prompt)

```
npx tsc --noEmit -p tsconfig.node.json
npx tsc --noEmit -p tsconfig.web.json
npm run lint
npm test
```

Prompts that touch the bundle additionally run:

```
npm run smoke:bundle
npm run smoke:renderer
```

Docs-only and CI-only prompts skip the bundle smokes; the per-prompt `Verification:` block calls this out.

## Key decisions

- **`agentMode` is rewired, not removed.** The renderer-side Planner→Coder→Reviewer pipeline (`AgentRunBanner.tsx`, `agent-store.ts`, `useChat.ts`, `preload.ts` `agent:status`) is fully built and dormant; main-process orchestration was never wired. Prompt 11 lights up the existing renderer surface from a new `electron/services/agent-pipeline.ts`.
- **`multi_agent_run` (mid-turn, parallel, tool-less, `MultiAgentRunCard`) and `agentMode` (turn-level, sequential, tool-enabled Coder, `AgentRunBanner`) are orthogonal.** Both stay; the distinction is documented in Prompt 11.

## Finding → prompt coverage

Every REPO_AUDIT finding maps to exactly one prompt.

| Finding | Prompt | Notes |
|---|---|---|
| BUG-1 | P4 | Stream-state reset on retry |
| BUG-2 | P4 | MCP onerror+onclose double-reconnect |
| BUG-3 | P7 | Hooks-runner stdio buffer hang |
| BUG-4 | P8 | SideChatPanel effect deps |
| BUG-5 | P7 | Corrupt `mcp-servers.json` regenerated silently |
| BUG-6 | P8 | Preload listener contract (`removeAllListeners`) |
| SEC-1 | P6 | `files.*` IPC unconfined |
| SEC-2 | P9 | Loopback/SSRF in `web_open` / `web_find` |
| SEC-3 | P10 | `keys.json` permissions |
| SEC-4 | P2 | Doc-only: clarify artifact content trust boundary |
| SEC-5 | P9 | Branch-name shell injection in `worktree.ts` |
| SEC-6 | P9 | `openInVSCode` `shell:true` |
| SEC-7 | P6 | Main-renderer CSP + artifact-scheme matching |
| SEC-8 | P9 | `browser-manager` allows `file:` from model |
| SEC-9 | P10 | OAuth `state` missing |
| SEC-10 | P10 | Silent plaintext-keychain fallback |
| QUAL-1 | P11 | `agentMode` dead plumbing — rewire |
| QUAL-2 | P7 | `as any` on `ChatCompletionMessageParam` |
| QUAL-3 | P7 | `resolveModel` silently defaults unknown ids |
| QUAL-4 | P11 (optional) | `chat.ts` size — relieved by `agent-pipeline.ts` extraction |
| TEST-1 | P5 | No renderer test env |
| TEST-2 | P5 | Store/service round-trip coverage gap |
| CI-1 | P3 | Smokes only run on main/tags |
| CI-2 | P12 | No macOS build / no coverage baseline |
| CI-3 | P1 | Workflow concurrency control |
| DEP-1 | P1 | `electron-rebuild` deprecated |
| DEP-2 | P1 | `@playwright/test` unused |
| DEP-3 | P1 | eslint trio unpinned |
| DOC-1 | P2 | README version drift |
| DOC-2 | P2 | CLAUDE.md "three providers" wrong |
| DOC-3 | P2 | CONTRIBUTING.md "DeepSeek-only" stale |
| DOC-4 | P1 | Two dead component files |
| DOC-5 | P2 | SKILLS.md 64K figure wrong |
| DOC-6 | P2 | `settings.ts:82` comment outdated |
| STRUCT-1 | P1 | Empty dirs left by DOC-4 deletes |
| STRUCT-2 | P1 | `deepseek.ts` dead, still imported in `settings.ts` |

## Roster

| # | Title | Findings | Status |
|---|---|---|---|
| 1 | Hygiene & quick wins | DOC-4, STRUCT-1, STRUCT-2, DEP-1, DEP-2, DEP-3, CI-3 | Pending |
| 2 | Documentation refresh | DOC-1, DOC-2, DOC-3, DOC-5, DOC-6, SEC-4 (doc) | Pending |
| 3 | CI: run smokes on PRs | CI-1 | Pending |
| 4 | Streaming & connection bugs | BUG-1, BUG-2 | Pending |
| 5 | Test foundation (jsdom + stores/services) | TEST-1, TEST-2 | Pending |
| 6 | Renderer privilege hardening | SEC-1, SEC-7 | Pending |
| 7 | Main-process correctness | BUG-3, BUG-5, QUAL-2, QUAL-3 | Pending |
| 8 | Renderer + IPC-contract correctness | BUG-4, BUG-6 | Pending |
| 9 | Model-input security | SEC-2, SEC-5, SEC-6, SEC-8 | Pending |
| 10 | Secrets & OAuth hardening | SEC-3, SEC-9, SEC-10 | Pending |
| 11 | `agentMode` rewire (Planner→Coder→Reviewer) | QUAL-1, QUAL-4 (optional) | Pending |
| 12 | CI: macOS build + coverage baseline | CI-2 | Pending |

---

### Prompt 1 — Hygiene & quick wins

Cheap repo hygiene: deprecated dep names, unused devDeps, unpinned linter, dead source files, missing CI concurrency control, and one structural cleanup (the dead `deepseek.ts` module is still imported in three places). Small surface area, immediate readability win, no behavioral change.

```
Prompt: Land repo hygiene + STRUCT-2 cleanup as one PR.

Read first to ground:
- REPO_AUDIT.md (findings DOC-4, STRUCT-1, STRUCT-2, DEP-1, DEP-2, DEP-3, CI-3)
- package.json (the typecheck script, electron-rebuild dep, eslint trio, @playwright/test entry)
- tsconfig.json (root — confirm files:[] so bare `tsc` no-ops without -b)
- electron/services/deepseek.ts (the dead client)
- electron/ipc/settings.ts (~lines 144, 161, 181 — the three deepseekClient call sites)
- electron/services/providers/registry.ts (the equivalents to call instead)
- src/components/mcp/MCPStatusBar.tsx and src/components/model/ModelSwitcher.tsx (the dead components)
- .github/workflows/build.yml (for the concurrency entry)

Then:
1. package.json: rename `typecheck` from bare `tsc` to `tsc -b` (root tsconfig has files:[] so the bare form no-ops). Replace `electron-rebuild` with `@electron/rebuild` (DEP-1). Drop `@playwright/test` from devDependencies (DEP-2, unused). Pin the eslint trio (`eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`) to exact versions — drop the `^` (DEP-3).
2. Delete src/components/mcp/MCPStatusBar.tsx and src/components/model/ModelSwitcher.tsx; remove the now-empty parent directories if any (DOC-4, STRUCT-1). Grep for any stray imports.
3. Replace the three `deepseekClient.*` calls in electron/ipc/settings.ts (~:144, ~:161, ~:181) with the `providers/registry` equivalents (`chatOnce` / `validateProviderKey`). Then delete electron/services/deepseek.ts (STRUCT-2). Verify no other imports of `./deepseek` remain.
4. .github/workflows/build.yml: add a top-level `concurrency:` block keyed by workflow + ref with `cancel-in-progress: true` (CI-3).

Run the universal gate (tsc.node + tsc.web + lint + npm test) and the bundle smokes (smoke:bundle + smoke:renderer — the deepseek deletion changes the main bundle). Add a DEVLOG entry. Flip the Prompt 1 row in PLANNING/AUDIT_REMEDIATION_PROGRESS.md from Pending to Done.
```

Files:
- `package.json` — typecheck script, deps cleanup
- `electron/ipc/settings.ts` — three call-site swaps (~:144, :161, :181)
- `electron/services/deepseek.ts` — delete
- `src/components/mcp/MCPStatusBar.tsx` — delete
- `src/components/model/ModelSwitcher.tsx` — delete
- `.github/workflows/build.yml` — add concurrency block
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ `npm run typecheck` actually runs the project-references build.
- ✅ `@electron/rebuild` resolves; `electron-rebuild` and `@playwright/test` are gone from `package.json`.
- ✅ Eslint trio pinned with no `^` prefix.
- ✅ Two deleted component files and their parent dirs (if newly empty) are gone; no remaining imports.
- ✅ `electron/services/deepseek.ts` is deleted; `settings.ts` exclusively uses `providers/registry`.
- ✅ `build.yml` cancels in-progress runs on the same ref.
- ✅ Both bundle smokes pass.

---

### Prompt 2 — Documentation refresh

Five stale doc strings plus one trust-boundary note that belongs in CLAUDE.md. No code changes; the only `.ts` touch is a comment.

```
Prompt: Refresh stale docs as one PR. Pure documentation, no behavioral changes.

Read first:
- REPO_AUDIT.md findings DOC-1, DOC-2, DOC-3, DOC-5, DOC-6, SEC-4
- README.md (the version strings ~lines 18-29, 125, 199)
- CLAUDE.md ("Current State" section, the "three providers" line ~line 4, the architecture-quick-pointers paragraph ~line 16)
- CONTRIBUTING.md (~line 66 services blurb, ~line 120 "DeepSeek-only")
- SKILLS.md (~line 62 — the 64K figure that's wrong)
- electron/ipc/settings.ts (~line 82 — the comment listing provider IDs that's missing `openrouter`)
- electron/services/artifact-sandbox.ts (orient on what guarantees the artifact sandbox actually gives, since SEC-4 is about clarifying that artifact content is untrusted-but-contained)

Then:
1. README.md: bump every `0.1.24` to `0.1.26` (~:18-29, :125, :199). Sanity-check download links and the "Built and shipped" roadmap header against the current release.
2. CLAUDE.md: rewrite the "Current State" section to reflect that Prompts 1-20 are committed, the multi-provider revision is committed, the Codex Agent Discipline sprint is in progress through Prompt 14, and Prompt 15 (Regression Pass) is pending. Update "three providers" to "four" in both the opening paragraph (~:4) and the architecture pointers (~:16). The four are deepseek, google, dashscope, openrouter.
3. CONTRIBUTING.md: drop the "DeepSeek-only" framing at ~:120; generalize the services blurb (~:66) to "OpenAI-compatible providers via providers/registry".
4. SKILLS.md:62 — fix the 64K figure (the cap is whatever the loader actually enforces; check skill-loader.ts and use the real number).
5. electron/ipc/settings.ts:82 — extend the comment to list `openrouter` alongside the other provider IDs (DOC-6).
6. CLAUDE.md: add one sentence (or extend an existing paragraph) noting that artifact content rendered inside the artifact sandbox is treated as untrusted — the sandbox enforces CSP + isolation so that constraint is contained, but readers of the codebase should not assume artifact source has been validated upstream (SEC-4).

No tests change. Run tsc.node + tsc.web + lint + npm test (vitest will run, but no behavior moved — bare gate is enough). Skip bundle smokes (no bundle change). Add a DEVLOG entry. Flip the Prompt 2 row.
```

Files:
- `README.md` — version bumps
- `CLAUDE.md` — Current State + "three"→"four" + SEC-4 note
- `CONTRIBUTING.md` — drop DeepSeek-only framing
- `SKILLS.md` — fix 64K figure
- `electron/ipc/settings.ts` — comment at :82
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest. **Skip** `smoke:bundle` / `smoke:renderer` (no bundle change).

Acceptance:
- ✅ Every `0.1.24` in README is now `0.1.26`; download links match the current release.
- ✅ CLAUDE.md "Current State" matches the actual landed prompts.
- ✅ "three providers" replaced with "four" in both CLAUDE.md spots; the four are named.
- ✅ CONTRIBUTING.md no longer says "DeepSeek-only" anywhere.
- ✅ SKILLS.md:62 reflects the real cap from `skill-loader.ts`.
- ✅ `settings.ts:82` comment includes `openrouter`.
- ✅ CLAUDE.md contains one explicit line about the artifact sandbox trust boundary.

---

### Prompt 3 — CI: run smokes on PRs

Tight, single-file workflow change. Closes the gap where `smoke:bundle` and `smoke:renderer` only ran on main / tag pushes — meaning a PR could go green without ever exercising the bundle the v0.1.25 TDZ regression slipped through.

```
Prompt: Add a PR-triggered smoke job to CI.

Read first:
- REPO_AUDIT.md finding CI-1
- .github/workflows/ (orient on which file currently runs on push vs pull_request and where the existing smoke steps live)
- package.json (confirm the smoke:bundle and smoke:renderer script names + what they expect)
- scripts/smoke-bundle.cjs and any companion smoke-renderer script

Then:
1. In .github/workflows/ci.yml (or whichever workflow is PR-triggered today), add a job — or a step on an existing PR job — that on `pull_request` runs: `npm ci` → `npm run build` → `npm run smoke:bundle` → `npm run smoke:renderer`. Cache npm to keep CI minutes reasonable.
2. Match the OS choice already in use on the existing smoke runner (likely `ubuntu-latest` — the existing main-branch smoke step is the reference).
3. Do NOT add macOS here; macOS is Prompt 12. Do NOT change the existing main/tag smoke steps; this is additive.

Verification: this prompt's CI gate IS the PR's own CI run. Locally run tsc.node + tsc.web + lint + npm test as a sanity baseline. Add a DEVLOG entry. Flip the Prompt 3 row.
```

Files:
- `.github/workflows/ci.yml` (or equivalent PR-triggered workflow) — new PR smoke job
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest **locally**; the smokes are verified by CI on the PR itself.

Acceptance:
- ✅ Opening a PR triggers a job that runs `smoke:bundle` and `smoke:renderer` after build.
- ✅ The existing main/tag smoke steps are unchanged.
- ✅ A deliberately broken bundle (e.g., a temporary TDZ reintroduction) would fail the new PR job — confirmed by a dry-run if possible, otherwise reasoned and documented in the DEVLOG entry.

---

### Prompt 4 — Streaming & connection bugs

Two High-severity correctness bugs in the same area: the provider streaming retry duplicates content because per-request accumulators are declared above the retry loop, and the MCP client double-reconnects when a server emits both `onerror` and `onclose` for the same crash.

```
Prompt: Fix BUG-1 and BUG-2 — provider stream retry + MCP double-reconnect — as one PR.

Read first:
- REPO_AUDIT.md findings BUG-1 and BUG-2
- electron/services/providers/registry.ts (currently :544 declares `let fullContent = ''` and :545 `const toolCallsAccumulator = new Map()` above the `while (retries <= maxRetries)` at :549; the `continue` statements at :616 and :623 reuse the same accumulator on retry, duplicating content)
- electron/services/mcp-manager.ts (:411-424 `client.onerror`, :426-437 `client.onclose` — both currently call `connectServer` unconditionally)
- electron/services/providers/*.test.ts and electron/services/mcp-manager.test.ts (if they exist) — orient on the existing test pattern before adding new cases

Then:
1. registry.ts: move `let fullContent = ''` and `const toolCallsAccumulator = new Map()` to the top of EACH iteration of the `while (retries <= maxRetries)` loop (currently above it at :544/:545). The `continue` paths at :616/:623 must start with a clean accumulator. Do not change retry counts, backoff, or any other semantics.
2. mcp-manager.ts: introduce a per-server `restarting: boolean` flag on the ServerState. In both `client.onerror` (:411-424) and `client.onclose` (:426-437), guard the reconnect call: if `state.restarting === true`, return immediately. Set `restarting = true` before scheduling the reconnect; clear it in the connectServer success path and in the auto-restart-exhausted path. The intent: a single crash should produce exactly one reconnect attempt even when both events fire.
3. Add tests:
   - registry: simulate a mid-stream failure followed by a successful retry; assert the saved/concatenated content has no duplication.
   - mcp-manager: simulate `onerror` then `onclose` back-to-back; assert `connectServer` was called once. (Use the existing test-mocking pattern in the file; if there isn't one, lift from `mcp-defaults.test.ts` or `tool-registry.test.ts`.)

Run the universal gate + smoke:bundle + smoke:renderer (bundle changes). Add a DEVLOG entry. Flip the Prompt 4 row.
```

Files:
- `electron/services/providers/registry.ts` — move per-iteration accumulators (~:544-549)
- `electron/services/mcp-manager.ts` — `restarting` flag + onerror/onclose guards (~:411-437)
- `electron/services/providers/registry.test.ts` (new or extended)
- `electron/services/mcp-manager.test.ts` (new or extended)
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ Stub mid-stream failure → retry produces clean content with no duplication.
- ✅ Back-to-back `onerror` + `onclose` triggers exactly one `connectServer` call.
- ✅ Single-failure paths (one `onerror` only, one `onclose` only) still reconnect.
- ✅ No regression in vitest suite count or pass/fail outside the two new cases.

---

### Prompt 5 — Test foundation (jsdom + stores/services)

The test suite runs Node-only; renderer code (Zustand stores, hooks, components) has no environment. Result: zero coverage of `src/stores/`, almost zero of `src/hooks/`, and a brittle gate against renderer-only regressions. This prompt is a foundation move — Prompts 8 and 11 specifically depend on jsdom being available for their tests.

```
Prompt: Land the renderer-test foundation as one PR. No production code changes; only test infra + new tests.

Read first:
- REPO_AUDIT.md findings TEST-1, TEST-2
- vitest.config.ts (current root config)
- package.json (devDependencies — confirm jsdom / @testing-library/react / @testing-library/jest-dom aren't already there)
- src/stores/chat-store.ts (373 LOC — the heaviest; pick the highest-payoff test seams)
- src/stores/agent-store.ts and src/stores/settings-store.ts
- electron/services/providers/registry.ts (the stream/error paths are the highest-value service to cover after Prompt 4)
- electron/services/keychain.ts (the encryption-available branches)
- A representative IPC handler — electron/ipc/settings.ts and electron/ipc/conversation.ts — to model how to test the `ipcMain.handle` surface (use `vi.mock('electron', ...)` per the existing pattern, e.g. `mcp-defaults.test.ts`)

Then:
1. devDependencies: add `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.
2. vitest.config.ts: switch to `environmentMatchGlobs` so `src/**/*.test.tsx` and `src/**/*.test.ts` use `jsdom`; `electron/**` keeps `node`. Add a `setupFiles` entry that imports `@testing-library/jest-dom/vitest`.
3. Add a `coverage` block to vitest config (use `v8` provider by default). No threshold yet — this prompt establishes a baseline; Prompt 12 sets the threshold.
4. Write tests:
   - `src/stores/chat-store.test.ts` — the highest-traffic store: streaming state transitions, `selectConversation` ↔ `__reset` round-trip if the store exposes it, `deleteConversation` clearing plan/runPhase/toolCalls when active, message append + finalization.
   - `src/stores/agent-store.test.ts` — hydrate / recordStatus / mode transitions.
   - `src/stores/settings-store.test.ts` — load/update round-trip; defaults applied when keys missing.
   - `electron/services/providers/registry.test.ts` — extend (or add): stream onChunk/onDone happy path, onError surface, abort signal threading.
   - `electron/services/keychain.test.ts` — encrypted-path round-trip and `plain:` fallback path (mock `safeStorage.isEncryptionAvailable` both ways).
   - Two-to-three IPC handler tests (`electron/ipc/settings.test.ts` recommended) — covers the IPC wiring pattern for later prompts.
5. Mirror the existing `__reset*` test conventions; do not introduce a different mocking style.

Run tsc.node + tsc.web + lint + npm test. Skip bundle smokes (no production code change). The test count should grow substantially. Add a DEVLOG entry recording the new file/test counts and the coverage-baseline numbers. Flip the Prompt 5 row.
```

Files:
- `package.json` — devDeps + (no script change beyond what already invokes vitest)
- `vitest.config.ts` — `environmentMatchGlobs`, `setupFiles`, coverage block
- `src/stores/chat-store.test.ts` (new)
- `src/stores/agent-store.test.ts` (new)
- `src/stores/settings-store.test.ts` (new)
- `electron/services/providers/registry.test.ts` (new or extended)
- `electron/services/keychain.test.ts` (new)
- `electron/ipc/settings.test.ts` (new) and one more handler
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest. **Skip** bundle smokes.

Acceptance:
- ✅ `src/**/*.test.tsx` files run in `jsdom`; `electron/**` files run in `node`.
- ✅ `@testing-library/jest-dom` matchers usable in renderer tests.
- ✅ Coverage report produced by `npm test -- --coverage` (no threshold yet).
- ✅ Vitest file count and total test count both increase materially (record exact numbers in DEVLOG).
- ✅ No production code in `src/` or `electron/` is modified.

---

### Prompt 6 — Renderer privilege hardening

Two High-severity surfaces: the `files.*` IPC channels expose `readText` / `listDir` / `walkProject` without confining paths (a renderer compromise reads arbitrary disk), and the main renderer document has no CSP — only `lamprey-artifact` URLs get one, and the matcher uses substring `.includes` (overbroad). Depends on Prompt 5 (jsdom) only for the renderer-side reasoning; the confinement tests are Node-side.

```
Prompt: Fix SEC-1 + SEC-7 — confine files.* IPC + add main-renderer CSP — as one PR.

Read first:
- REPO_AUDIT.md findings SEC-1 and SEC-7
- electron/ipc/files.ts (~:78-125 readText/listDir/walkProject; ~:228-270 openInVSCode/openInExplorer — DO NOT touch openInVSCode here, that's Prompt 9)
- electron/services/workspace-state.ts (getActiveWorkspace), electron/ipc/files.ts (the getWorkdir handler — this is the file-browser root, distinct from active-workspace)
- electron/services/apply-patch-tool.ts (~:49 resolvePathWithinWorkspace — REUSE this, do not reinvent)
- src/components/files/FilesPanel.tsx and src/components/files/QuickOpenPalette.tsx (callers — confirm the confinement choice matches usage)
- electron/main.ts (~:295 the existing CSP onHeadersReceived handler for lamprey-artifact)

Then:
1. files.ts:78-125 — confine the three handlers using `resolvePathWithinWorkspace(getFileBrowserRoot(), requestedPath)`. The root is the FILE-BROWSER root (`files.getWorkdir()` value), NOT `getActiveWorkspace()`. The browser legitimately recurses descendants of the user-picked workdir; reject `..` traversals, absolute paths that escape the root, and tildes. Surface a clear error string on rejection so the renderer can show a friendly message.
2. main.ts:295 — extend the `onHeadersReceived` handler to cover the MAIN RENDERER document URL with `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. Keep the existing artifact CSP. **Match the artifact scheme PRECISELY** (e.g. `url.startsWith('lamprey-artifact://')`), not via `.includes('lamprey-artifact')` — the substring form would match `https://example.com/lamprey-artifact-tracker` and other false positives.
3. Tests:
   - `electron/ipc/files.test.ts` — confinement rejects `../etc/passwd`, an absolute path outside the root, and `~/.ssh/id_rsa`; allows files under the root and one level deep.
   - If feasible, a small main.test.ts unit around the CSP scheme matcher (factor it into a pure helper to make this easy).
4. Verify with `smoke:renderer` — an over-strict CSP white-screens the renderer; the smoke is the guard.

Run the universal gate + both smokes. Add a DEVLOG entry. Flip the Prompt 6 row.
```

Files:
- `electron/ipc/files.ts` — confine readText / listDir / walkProject (~:78-125)
- `electron/main.ts` — main-renderer CSP + precise scheme match (~:295)
- `electron/ipc/files.test.ts` (new)
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ `files.readText` / `listDir` / `walkProject` reject `../`, absolute-out-of-root, and `~`-rooted paths with a clear error.
- ✅ Paths under the file-browser root resolve normally; descendant recursion still works.
- ✅ The main renderer document loads under the new CSP without console errors (smoke:renderer green).
- ✅ Artifact scheme matcher uses startsWith / exact equality, not substring.
- ✅ Tests cover all rejection cases + the happy path.

---

### Prompt 7 — Main-process correctness

Four main-process correctness items grouped because they all live in `electron/`, none touches the renderer, and each is small. Two bugs (hook-runner buffer hang, corrupt-config silent regen) and two quality lifts (typed message arrays, surfaced unknown-model ids).

```
Prompt: Land BUG-3 + BUG-5 + QUAL-2 + QUAL-3 as one PR. Pure main-process.

Read first:
- REPO_AUDIT.md findings BUG-3, BUG-5, QUAL-2, QUAL-3
- electron/services/hooks-runner.ts (~:40 — the spawn call that doesn't set stdio:'ignore')
- electron/services/mcp-manager.ts (~:86 loadConfigs; ~:276 the content array type that's loose)
- electron/ipc/chat.ts (~:360, :412, :456 — the `as any` casts on message-array pushes)
- electron/services/providers/registry.ts (~:297 resolveModel — silently defaults to deepseek-64K on unknown ids)
- openai/resources/chat/completions types (the ChatCompletionMessageParam shape that should replace `as any`)

Then:
1. hooks-runner.ts:40 — set `stdio: 'ignore'` on the spawn (fire-and-forget by design). Without it, hook output >64KB fills the pipe buffer and the child hangs (BUG-3). Confirm no caller actually reads stdout/stderr; if any do, replace with a separate path.
2. mcp-manager.ts:86 loadConfigs — when `mcp-servers.json` fails to parse: (a) log the parse error with the file path, (b) rename the corrupt file to `mcp-servers.json.bak-<ms-epoch>` so it isn't lost, (c) regenerate from defaults. Also validate the loaded shape (config is an object with a `servers` array of the expected shape) before trusting it; on schema mismatch, treat as corrupt (BUG-5).
3. mcp-manager.ts:276 — type the MCP content shape as `Array<{ type: string; text?: string; ...}>` (or a discriminated union if the schema warrants), with a runtime guard before reading `.text`. Eliminate any `as any` along this path (QUAL-2 partial).
4. chat.ts:360 / :412 / :456 — type the `messages.push(...)` calls against `ChatCompletionMessageParam` (the openai type) instead of `as any`. The shapes already match; the casts hide that. (QUAL-2 main).
5. registry.ts:297 resolveModel — when given an unknown model id, throw a typed error (or return a discriminated `{ ok: false, reason }` if downstream prefers) instead of silently falling back to `deepseek-v4-pro` / 64K context. Callers that genuinely want a fallback should opt in explicitly (QUAL-3). Update any call sites that relied on the silent default.

Tests (Prompt 5 should have landed jsdom and the IPC pattern, but these are all Node-side):
- hooks-runner: spawn-call shape assertion that `stdio: 'ignore'` is passed.
- mcp-manager loadConfigs: corrupt JSON → backup file exists + defaults loaded + warn logged; valid JSON but wrong shape → same treatment.
- registry.resolveModel: known id round-trips; unknown id throws (or returns the error shape).

Run the universal gate + both smokes. Add a DEVLOG entry. Flip the Prompt 7 row.
```

Files:
- `electron/services/hooks-runner.ts` — `stdio: 'ignore'` (~:40)
- `electron/services/mcp-manager.ts` — `loadConfigs` resilience (~:86), content typing (~:276)
- `electron/ipc/chat.ts` — drop `as any` on message pushes (~:360, :412, :456)
- `electron/services/providers/registry.ts` — `resolveModel` unknown-id handling (~:297)
- Updated callers of `resolveModel` (audit-wide grep)
- Test files for each of the four areas
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ `hooks-runner` spawn passes `stdio: 'ignore'`; tested.
- ✅ A corrupt `mcp-servers.json` is renamed `.bak-<ts>` and defaults are regenerated; warn logged; valid JSON with wrong shape gets the same treatment.
- ✅ MCP content array reads use a typed shape with a runtime guard; no `as any` along that path.
- ✅ `chat.ts` message-array pushes use `ChatCompletionMessageParam`; no `as any` survives along those three sites.
- ✅ `resolveModel('definitely-not-a-model')` errors out instead of returning the 64K DeepSeek default; all callers updated.

---

### Prompt 8 — Renderer + IPC-contract correctness

BUG-4 (effect dep over-trigger in SideChatPanel) and BUG-6 (preload listeners contracted as fire-and-forget but called with `removeAllListeners` on shared channels). Isolated from Prompt 7 because BUG-6 changes a preload contract that ripples to every caller — landing it with main-only fixes would hide the blast radius.

```
Prompt: Fix BUG-4 + BUG-6 — SideChatPanel effect deps + preload listener contract — as one PR.

Read first:
- REPO_AUDIT.md findings BUG-4 and BUG-6
- src/components/sidechat/SideChatPanel.tsx (~:79 — the subscribe effect that lists `streamBuf` in its deps)
- electron/preload.ts (~:27 `chat.onError`, ~:35 `app.onError` / `app.onWarning` — currently void-returning; compare to ~`tools.onApprovalRequired` which returns an unsubscriber)
- src/App.tsx (~:139 — the place that registers app.onError listeners and would currently leak)
- All renderer callers of the channels touched: grep for `chat.onError`, `app.onError`, `app.onWarning` across `src/`

Then:
1. SideChatPanel.tsx:79 — read the streaming buffer via a ref (`streamBufRef.current`) inside `onDone`, and drop `streamBuf` from the subscribe effect's dependency array. Update the ref on every chunk write. The bug: listing `streamBuf` re-creates the subscription on every chunk, so old chunks fire stale callbacks.
2. preload.ts — make `chat.onError`, `app.onError`, `app.onWarning` return unsubscribers (the same shape as `tools.onApprovalRequired`). Each `on*` registers exactly one listener with `ipcRenderer.on(channel, handler)` and returns `() => ipcRenderer.off(channel, handler)`. Stop using `removeAllListeners` on shared channels — other features subscribe to the same channels.
3. Update every renderer caller to use the unsubscriber: store the return value, call it from the `useEffect` cleanup. The list of callers comes from the grep above.
4. Tests (Prompt 5's jsdom should be in place):
   - A render of SideChatPanel that fires a series of chunks: assert the subscription is created ONCE (count callbacks to the mock), and the final `onDone` reads the accumulated buffer.
   - A test that registering and unregistering two `chat.onError` listeners on the same channel doesn't leave residual listeners — the unsubscribe of one must not remove the other (the `removeAllListeners` bug).

Run the universal gate + both smokes. Add a DEVLOG entry. Flip the Prompt 8 row.
```

Files:
- `src/components/sidechat/SideChatPanel.tsx` — `streamBufRef` + drop dep (~:79)
- `electron/preload.ts` — `chat.onError`/`app.onError`/`app.onWarning` return unsubscribers
- All renderer callers updated to use unsubscribers
- `src/components/sidechat/SideChatPanel.test.tsx` (new, jsdom)
- `electron/preload.test.ts` or a small renderer test covering listener isolation
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ SideChatPanel's subscription is created once across a chunk run; final buffer is correct.
- ✅ Every renderer caller of the three preload channels uses the unsubscriber and cleans up on unmount.
- ✅ Two listeners on the same channel are independent — unsubscribing one preserves the other.
- ✅ No use of `removeAllListeners` on the affected shared channels remains.

---

### Prompt 9 — Model-input security

Four security findings about untrusted strings reaching dangerous sinks: web tools that fetch arbitrary URLs (SSRF, including cloud metadata 169.254.169.254), git branch names interpolated into argv, model-driven browser nav that accepts `file:`, and `openInVSCode` launching through `shell:true`. Title overlaps with the canonical "Prompt 9 = Model-input security" from the user's roster — same security family.

```
Prompt: Land SEC-2 + SEC-5 + SEC-6 + SEC-8 as one PR. Model-input security family.

Read first:
- REPO_AUDIT.md findings SEC-2, SEC-5, SEC-6, SEC-8
- electron/services/web-tools.ts (~:226 — the fetch in web_open / web_find; orient on redirect handling)
- electron/services/web-search-adapters.ts (callers that also fetch)
- electron/ipc/worktree.ts (~:53 — git worktree commands that interpolate branch name)
- electron/services/browser-manager.ts (~:115 — the loadURL path; check what schemes are allowed)
- electron/ipc/files.ts (~:228-270 — openInVSCode currently spawn with shell:true)

Then:
1. Add a shared helper, e.g. `electron/services/url-safety.ts`, exporting `assertPublicUrl(url: string): URL` that:
   - Parses the URL (throws on parse failure).
   - Rejects non-http/https schemes.
   - Resolves the hostname; rejects loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16` — explicitly including `169.254.169.254`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`), `fc00::/7`, and `0.0.0.0`.
   - Returns the parsed URL on success.
   Use it in `web-tools.ts:226` BEFORE the fetch. Use `redirect: 'manual'` (or a custom agent) and re-validate on every redirect hop — do not let a 302 to an internal IP bypass the gate (SEC-2).
2. worktree.ts:53 — validate branch input with `^[A-Za-z0-9._/-]+$`, reject names starting with `-`, and insert `--` before positional args in every git invocation that takes the branch (SEC-5).
3. browser-manager.ts:115 — drop `file:` from model-driven navigation. Only allow `http:` and `https:` from model-supplied URLs; user-driven file-open paths (if any) stay separate (SEC-8).
4. files.ts:228-270 openInVSCode — drop `shell: true` on the spawn. Use the argv form: `spawn(codePath, [target], { detached: true })`. Resolve `codePath` via `where` (Windows) / `command -v` (POSIX) before spawning; do not interpolate user-supplied strings into a shell (SEC-6).
5. Tests:
   - url-safety: every category rejected with a clear reason; public hostnames accepted; redirect to an internal IP rejected.
   - web_open + web_find: integration test with a stubbed adapter pointing at `127.0.0.1:80` returns error not data; with a redirect target on `169.254.169.254` also rejected.
   - worktree branch validation: reject `-`-leading, reject `;rm -rf` style, accept `feature/foo-bar_v2`.
   - browser-manager: rejects `file:///etc/passwd` from model context; accepts `https://example.com`.
   - openInVSCode: spawn assertion that `shell: true` is NOT passed; argv form used.

Run the universal gate + both smokes. Add a DEVLOG entry. Flip the Prompt 9 row.
```

Files:
- `electron/services/url-safety.ts` (new)
- `electron/services/web-tools.ts` — call `assertPublicUrl` + manual redirect (~:226)
- `electron/services/web-search-adapters.ts` — same protection on adapter fetches
- `electron/ipc/worktree.ts` — branch validation + `--` (~:53)
- `electron/services/browser-manager.ts` — drop `file:` (~:115)
- `electron/ipc/files.ts` — `openInVSCode` argv-form spawn (~:228-270)
- Test files for each
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ `assertPublicUrl` rejects loopback, link-local (incl. 169.254.169.254), RFC1918, `fc00::/7`, `0.0.0.0`, and non-http/https schemes.
- ✅ `web_open` / `web_find` re-validate after redirects; the redirect-to-internal case is rejected.
- ✅ Branch names with leading `-` or shell metacharacters are rejected before reaching `git`; `--` separator inserted.
- ✅ Model-driven `browser_open` to a `file:` URL is rejected.
- ✅ `openInVSCode` spawn passes argv array with no `shell: true`; missing `code` binary surfaces a clear error.

---

### Prompt 10 — Secrets & OAuth hardening

Three findings around credential handling: `keys.json` is written with default permissions (world-readable on POSIX), the OAuth flow has no `state` parameter (CSRF on callback), and the keychain silently falls back to a `plain:`-prefixed plaintext when `safeStorage.isEncryptionAvailable()` returns false (Linux without libsecret).

```
Prompt: Land SEC-3 + SEC-9 + SEC-10 as one PR. Secrets and OAuth hardening.

Read first:
- REPO_AUDIT.md findings SEC-3, SEC-9, SEC-10
- electron/services/keychain.ts (~:19 — the writeFile that doesn't set mode; isEncryptionAvailable() check + plain: fallback)
- electron/ipc/mcp.ts (~:40 — the OAuth start path that builds the auth URL without a state param; orient on the callback handler)
- src/components/settings/ApiKeySettings.tsx and ApiKeyModal.tsx (the UI that needs to learn about encryption-unavailable)

Then:
1. keychain.ts:19 — write `keys.json` with `{ mode: 0o600 }`. If the file already exists with looser permissions, chmod it to 0o600 on next write (or on read, opportunistically). On Windows the mode bit is best-effort; document the behavior in a comment.
2. keychain.ts — expose `isKeychainEncrypted(): boolean` (or similar) that the renderer can read via IPC. The current silent `plain:`-prefix fallback is the gap.
3. ApiKeySettings.tsx / ApiKeyModal.tsx — when `isKeychainEncrypted()` is false, show a clear warning above the key input: "Encryption is unavailable on this system; the key will be stored as plaintext on disk. Continue?". Require confirmation before persisting. Do NOT silently fall through (SEC-10).
4. mcp.ts:40 — generate a cryptographically random `state` token (`crypto.randomBytes(24).toString('base64url')`), include it in the OAuth URL, persist it (in-memory map keyed by the pending session id is enough), and verify in the callback handler. On mismatch or missing, reject the callback with a clear error. (SEC-9)
5. Tests (Prompt 5's foundation in place):
   - keychain round-trip: encrypted path (mock `safeStorage.isEncryptionAvailable() => true`), `plain:` fallback (mock `false`). Assert file mode is `0o600` on POSIX (skip on win32). Assert `isKeychainEncrypted()` reflects the mock.
   - OAuth state: starting a flow generates a unique state; callback with the matching state proceeds; callback with a mismatched state errors; callback with no state errors.

Run the universal gate + smoke:bundle (this changes main-bundle code). Add a DEVLOG entry. Flip the Prompt 10 row.
```

Files:
- `electron/services/keychain.ts` — `0o600` + `isKeychainEncrypted` (~:19)
- `electron/ipc/mcp.ts` — OAuth `state` (~:40)
- `electron/preload.ts` — expose `isKeychainEncrypted`
- `src/components/settings/ApiKeySettings.tsx` — warning gate
- `src/components/settings/ApiKeyModal.tsx` — warning gate
- `electron/services/keychain.test.ts` (extend)
- `electron/ipc/mcp.test.ts` (new or extend)
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ `keys.json` is `0o600` on POSIX after first write; existing looser-permission files are corrected.
- ✅ When encryption is unavailable, the user sees an explicit warning and must confirm before plaintext persistence.
- ✅ `isKeychainEncrypted()` surface returns the correct value; tested both ways.
- ✅ OAuth flow generates and verifies `state`; mismatch / missing state is rejected with a clear error.
- ✅ No silent `plain:` fallback path remains; tests cover both branches.

---

### Prompt 11 — `agentMode` rewire (Planner → Coder → Reviewer)

The renderer pipeline is already built and dormant: `AgentRunBanner.tsx` renders the planner/coder/reviewer phase list and explicitly comments "Unreachable until the agent store sets mode"; `preload.ts:25/35` carries `agent:status`; `useChat.ts:95` subscribes and calls `useAgentStore.recordStatus` (`agent-store.ts:43`). Nothing in main emits `agent:status` or runs a sequential pipeline. This prompt lights it up.

```
Prompt: Rewire agentMode end-to-end as one PR.

Read first:
- REPO_AUDIT.md finding QUAL-1 (and QUAL-4 if extracting resolveSingleToolCall)
- PLANNING/AUDIT_REMEDIATION_PLAN.md "Prompt 11" section (this file) — confirm the architecture and coexistence rules
- src/components/chat/AgentRunBanner.tsx (ROLE_ORDER = [planner, coder, reviewer]; the "Unreachable" comment)
- src/stores/agent-store.ts (~:43 recordStatus; mode + roster persistence)
- src/hooks/useChat.ts (~:95 the agent:status subscription)
- electron/preload.ts (~:25, :35 agent:status channels)
- electron/ipc/chat.ts (~:135 chat:send; ~:256 `void requestedAgentMode` — the replacement site)
- electron/services/multi-agent-run-tool.ts (~:192 executeMultiAgentRun — reuse for planner + reviewer; note that `coder` is excluded from SUPPORTED_ROLES on purpose — coder needs tools)
- electron/services/system-prompt-builder.ts (AGENT_ROLE_PROMPTS, buildAgentSystemPrompt, contractRole: 'coding')
- electron/services/final-response-composer.ts (summarizeRun — bound reviewer context ≤32KB)
- electron/services/chat-events.ts (emitChatEvent, emitPhase — model emitAgentStatus on this)
- electron/ipc/settings.ts (agentRoster persistence in settings.json)
- electron/services/providers/registry.ts (resolveModel — to validate per-stage roster ids; ties to QUAL-3 in Prompt 7)

Then:
1. New file `electron/services/agent-pipeline.ts` exporting `runAgentPipeline({ conversationId, model, roster, messages, ...rest })`. Keeps chat.ts from growing; takes injectable `runner` (chatOnce-shaped) and `runRound` (runChatRound-shaped) seams so the tests don't need a real provider.
2. Add `emitAgentStatus(conversationId, role, status)` to `chat-events.ts` (mirrors `emitPhase` / `emitChatEvent`). Status enum matches what `agent-store.recordStatus` expects.
3. In chat.ts:135 chat:send: read `agentMode` from the settings.json blob already being read (the loadAgenticCodingConfig call site). When `agentMode === 'multi'`:
   - Load `agentRoster` from settings.json. Validate every per-stage model id via `resolveModel` (P7 must have landed first — unknown ids throw cleanly). If validation fails, surface a clear error and fall back to single mode.
   - Invoke `runAgentPipeline`. The single-mode path (current `runChatRound` call) is UNCHANGED byte-for-byte — keep the diff isolated to the multi branch.
4. Inside `runAgentPipeline`:
   - PLANNER: `executeMultiAgentRun([{ role: 'planner', prompt: <user request>, context: <conversation summary> }])`. Emit `agent:status` running → done. Capture the plan text.
   - CODER: call the SAME `runChatRound` used in single mode, with the coder's roster model, `buildSystemPrompt(..., contractRole: 'coding')`, and the plan injected into the user-facing context (e.g. prepended as a `<plan>` block on the round's first user message, or as a system addendum — whichever the team prefers; document the choice). Full `tools` array passed through. The Coder's stream is the user-visible stream — this is what makes Coder the tool-enabled stage. Emit `agent:status` running → done at stage boundaries.
   - REVIEWER: `executeMultiAgentRun([{ role: 'reviewer', prompt: <review instructions>, context: <coder output bounded by summarizeRun ≤32KB> }])`. Emit `agent:status` running → done. Reviewer output appended as a final assistant message (or composer-styled — match existing single-mode composer behavior).
5. Coexistence: `multi_agent_run` (the tool) and the agentMode pipeline are orthogonal. Both work. Add a doc comment at the top of `agent-pipeline.ts` explaining: multi_agent_run is a mid-turn tool the Coder can invoke for parallel fan-out (tool-less sub-agents, `MultiAgentRunCard`); agentMode is a turn-level wrapper (sequential, Coder is tool-enabled, `AgentRunBanner`).
6. (Optional QUAL-4) extract `resolveSingleToolCall` from chat.ts into a small file so chat.ts shrinks toward 400 LOC. Skip if it bloats the diff.
7. Tests (need Prompt 5's jsdom for the agent-store half):
   - Single mode: chat:send calls runChatRound once and emits NO `agent:status` events.
   - Multi mode happy path: pipeline runs planner → coder → reviewer in order; each stage emits running then done; roster ids passed per stage.
   - Roster validation: an unknown model id throws; pipeline surfaces the error; falls back to single (or errors — pick and document).
   - Planner failure: `agent:status` emits error; subsequent stages skipped; chat:error fires.
   - Abort: AbortSignal cancels the in-flight stage; observable in the test runner via a stalled chatOnce mock.
   - `multi_agent_run` tool still works independently in single mode (regression guard).
   - agent-store.recordStatus tested in isolation against a sequence of mocked emits — verifies the renderer-side data flow.

Run the universal gate + both smokes. Add a DEVLOG entry naming the test counts and verifying the renderer banner activates with the IDE running. Flip the Prompt 11 row.
```

Files:
- `electron/services/agent-pipeline.ts` (new)
- `electron/services/chat-events.ts` — add `emitAgentStatus`
- `electron/ipc/chat.ts` — replace `void requestedAgentMode` at ~:256 with multi-branch dispatch
- `electron/services/agent-pipeline.test.ts` (new)
- `src/stores/agent-store.test.ts` (extend from P5)
- `src/components/chat/AgentRunBanner.test.tsx` (new, jsdom)
- (Optional, QUAL-4) `electron/services/resolve-tool-call.ts` extraction + tests
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row

Reuses unchanged: `system-prompt-builder.ts`, `multi-agent-run-tool.ts`, `final-response-composer.ts`, `agent-store.ts`, `AgentRunBanner.tsx`, `useChat.ts`, `preload.ts`.

Verification: tsc ×2, lint, vitest, `smoke:bundle`, `smoke:renderer`.

Acceptance:
- ✅ Single mode is byte-for-byte unchanged — no `agent:status` events emitted; existing tests still pass.
- ✅ Multi mode emits planner running/done, then coder running/done with a streamed tool-enabled turn in between, then reviewer running/done.
- ✅ Per-stage roster ids validate via `resolveModel`; unknown id surfaces a clear error.
- ✅ `multi_agent_run` (the tool) still functions inside Coder turns — both surfaces work.
- ✅ AbortSignal cancels the in-flight stage and surfaces `chat:error`.
- ✅ Hands-on: toggling agent mode in Settings + sending a coding request shows the `AgentRunBanner` ticking through planner → coder → reviewer.
- ✅ Coexistence is documented at the top of `agent-pipeline.ts`.

---

### Prompt 12 — CI: macOS build + coverage baseline

The build matrix runs Windows and Linux only — macOS regressions slip through; we have no coverage data in CI. Both gaps land in one workflow PR.

```
Prompt: Add unsigned macOS build job + coverage baseline as one PR.

Read first:
- REPO_AUDIT.md finding CI-2
- .github/workflows/build.yml (the existing Windows and Linux jobs — copy their shape)
- electron-builder.yml (orient on what build:mac would emit; we run unsigned so CSC_IDENTITY_AUTO_DISCOVERY=false)
- vitest.config.ts (the coverage block from Prompt 5)

Then:
1. build.yml: add a `build-macos` job on `runs-on: macos-latest`. Env `CSC_IDENTITY_AUTO_DISCOVERY=false` so electron-builder doesn't try to sign with a missing cert. Steps: setup node → npm ci → npm run build → npm run smoke:bundle → npm run smoke:renderer. Do NOT publish (no signing, no notarization). Match concurrency from Prompt 1.
2. Set a coverage threshold in vitest.config.ts using the baseline numbers from the Prompt 5 DEVLOG entry — a low floor (e.g. statements/branches/functions/lines at the rounded-down current percentage minus 2 points). This is a regression guard, not a quality target.
3. Add `--coverage` to the CI npm test step (or change `npm test` script if cleaner). Print the coverage table in the CI log so reviewers see it.

Verification: tsc ×2, lint, vitest (the new coverage threshold should pass since it's the baseline minus 2pt). Skip the local bundle smokes for this prompt — the macOS smoke is verified by CI on the macOS runner. Add a DEVLOG entry recording the baseline coverage numbers and the threshold. Flip the Prompt 12 row. Sprint complete — add a final "Sprint complete" entry to PROGRESS with the final test counts and any known carry-forward gaps.
```

Files:
- `.github/workflows/build.yml` — `build-macos` job
- `vitest.config.ts` — coverage thresholds
- `package.json` — (if needed) `test:coverage` script or `--coverage` in the existing one
- `PLANNING/AUDIT_REMEDIATION_PROGRESS.md` — flip row + add Sprint complete entry

Verification: tsc ×2, lint, vitest **with coverage**. **Skip** local bundle smokes — the macOS smoke is verified by the new CI runner.

Acceptance:
- ✅ CI runs a macOS job on every push to main and on PRs (per Prompt 3's PR wiring).
- ✅ Coverage runs in CI and prints; the baseline threshold blocks regression below the floor.
- ✅ DEVLOG entry records the baseline coverage numbers.
- ✅ PROGRESS doc has a "Sprint complete" entry summarising the final test count and any known gaps.
