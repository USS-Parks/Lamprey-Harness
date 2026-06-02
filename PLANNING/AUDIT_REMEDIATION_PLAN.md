# Audit Remediation — Plan & Prompt Sequence

Remediation roadmap for the findings in [`REPO_AUDIT.md`](../REPO_AUDIT.md) (audit dated
2026-06-02). Modeled on the repo's existing prompt-sequence planning docs
(`CODEX_TOOLSET_PARITY_PLAN.md`). Each prompt is **one focused PR** (per
`CONTRIBUTING.md`'s one-feature-per-PR rule). Status is tracked in
`AUDIT_REMEDIATION_PROGRESS.md`.

**Decisions baked in:** cover *all* actionable findings; **rewire** (not remove) the
dead `agentMode` plumbing (QUAL-1).

## Universal verification gate

Every prompt must end green on these before its PR merges:

```bash
npx tsc --noEmit -p tsconfig.node.json    # main + preload
npx tsc --noEmit -p tsconfig.web.json     # renderer
npm run lint                              # 0 errors
npm test                                  # vitest
# Bundle-touching prompts only:
npm run smoke:bundle
npm run smoke:renderer
```

Each prompt also adds a `DEVLOG.md` entry and flips its row in
`AUDIT_REMEDIATION_PROGRESS.md`.

## Roster

| # | Title | Findings | Smokes | Status |
|---|-------|----------|--------|--------|
| 1 | Hygiene & quick wins | DOC-4, STRUCT-1/2, DEP-1/2/3, CI-3 | yes | Pending |
| 2 | Documentation refresh | DOC-1/2/3/5/6, SEC-4(doc) | no | Pending |
| 3 | CI: run smokes on PRs | CI-1 | n/a | Pending |
| 4 | Streaming & connection bugs | BUG-1, BUG-2 | yes | Pending |
| 5 | Test foundation (jsdom + stores/services) | TEST-1, TEST-2 | no | Pending |
| 6 | Renderer privilege hardening | SEC-1, SEC-7 | yes | Pending |
| 7 | Main-process correctness | BUG-3, BUG-5, QUAL-2, QUAL-3 | yes | Pending |
| 8 | Renderer + IPC-contract correctness | BUG-4, BUG-6 | yes | Pending |
| 9 | Model-input security | SEC-2, SEC-5, SEC-6, SEC-8 | yes | Pending |
| 10 | Secrets & OAuth hardening | SEC-3, SEC-9, SEC-10 | yes | Pending |
| 11 | `agentMode` rewire (Planner→Coder→Reviewer) | QUAL-1, (opt) QUAL-4 | yes | Pending |
| 12 | CI: macOS build + coverage baseline | CI-2 | n/a | Pending |

**Ordering rationale:** cheap hygiene + the PR-smoke guard land first (and protect
every later PR); the two High streaming bugs next; the test foundation early so the
renderer-touching prompts (8, 11) ship *with* tests; High renderer-privilege
hardening before the new feature; the `agentMode` rewire late (it benefits from the
test foundation); macOS/coverage CI last.

## Finding → prompt coverage

Every `REPO_AUDIT.md` finding maps to exactly one prompt:

| Finding | Prompt | Finding | Prompt | Finding | Prompt |
|---------|--------|---------|--------|---------|--------|
| BUG-1 | 4 | SEC-1 | 6 | TEST-1 | 5 |
| BUG-2 | 4 | SEC-2 | 9 | TEST-2 | 5 |
| BUG-3 | 7 | SEC-3 | 10 | CI-1 | 3 |
| BUG-4 | 8 | SEC-4 | 2 (doc) | CI-2 | 12 |
| BUG-5 | 7 | SEC-5 | 9 | CI-3 | 1 |
| BUG-6 | 8 | SEC-6 | 9 | DEP-1/2/3 | 1 |
| QUAL-1 | 11 | SEC-7 | 6 | DOC-1/2/3/5/6 | 2 |
| QUAL-2 | 7 | SEC-8 | 9 | DOC-4 | 1 |
| QUAL-3 | 7 | SEC-9 | 10 | STRUCT-1/2 | 1 |
| QUAL-4 | 11 (opt) | SEC-10 | 10 | | |

---

## Prompts

### Prompt 1 — Hygiene & quick wins

Low-risk cleanups that remove a false-green gate, dead code, and dependency drift.

Prompt:

```text
You are in the Lamprey Harness repo. Implement REPO_AUDIT findings DOC-4, STRUCT-1, STRUCT-2, DEP-1, DEP-2, DEP-3, CI-3. Read REPO_AUDIT.md and PLANNING/AUDIT_REMEDIATION_PLAN.md first.

1. package.json: change "typecheck" to "tsc -b" (root tsconfig has files:[] so bare `tsc --noEmit` checks nothing — verify `tsc -b` now compiles both subprojects). Change postinstall electron-rebuild -> @electron/rebuild (add the dep, drop electron-rebuild). Remove the unused @playwright/test devDependency. Pin the eslint toolchain by dropping the ^ on eslint, @eslint/js, @typescript-eslint/*, eslint-plugin-import-x, eslint-plugin-react-hooks.
2. Delete the orphaned components src/components/mcp/MCPStatusBar.tsx and src/components/model/ModelSwitcher.tsx (confirm no importers first) and their now-empty folders.
3. STRUCT-2: in electron/ipc/settings.ts replace the three electron/services/deepseek.ts calls (deepseekClient.resetClient x2, validateKey) with the providers/registry equivalents for provider 'deepseek', remove the import, then delete electron/services/deepseek.ts (confirm `grep -rn "services/deepseek"` shows only settings.ts).
4. .github/workflows/build.yml: add a `concurrency` group mirroring ci.yml.

Run the full gate (tsc x2, lint, vitest, smoke:bundle, smoke:renderer). Add a DEVLOG entry and flip the Prompt 1 row in AUDIT_REMEDIATION_PROGRESS.md.
```

Files:
- `package.json` — typecheck script, postinstall, deps/devDeps pins
- `src/components/mcp/MCPStatusBar.tsx`, `src/components/model/ModelSwitcher.tsx` — deleted
- `electron/ipc/settings.ts` — swap deepseek shim for registry calls
- `electron/services/deepseek.ts` — deleted
- `.github/workflows/build.yml` — concurrency

Verification: full gate. `npm run typecheck` (`tsc -b`) now reports real errors if any exist.

Acceptance:
- ✅ `npm run typecheck` compiles both subprojects (no longer a no-op).
- ✅ No importer of `deepseek.ts` remains; provider key flows still work.
- ✅ Orphaned components gone; bundle smokes pass.

### Prompt 2 — Documentation refresh

Kill the documentation drift around the 0.1.24→0.1.26 release and the provider count.

Prompt:

```text
Implement REPO_AUDIT DOC-1, DOC-2, DOC-3, DOC-5, DOC-6, and the SEC-4 documentation note. Docs only — no code, no smokes.

1. README.md: update every 0.1.24 string/link (download header ~18-29, installer/ZIP table, the three GitHub release URLs, quick-start link, "Built and shipped (v0.1.24)" roadmap header ~199, line 125) to the current release version (0.1.26 unless a newer tag exists).
2. CLAUDE.md: rewrite the "Current State" block to reflect that the multi-provider revision + Codex parity sprint are merged (point at PLANNING/CODEX_TOOLSET_PARITY_PROGRESS.md). Change "three providers" to four — deepseek / google / dashscope / openrouter (lines 4 and 16).
3. CONTRIBUTING.md: drop the "v0.1 is DeepSeek-only on purpose" line (~120) and generalize the electron/services/ description (~66).
4. SKILLS.md:62: replace the stale "64K context window" figure with a per-model note (Gemma 131072, Qwen/OpenRouter 262144, DeepSeek V4 1,000,000).
5. electron/ipc/settings.ts:82 comment: add openrouter to the provider list.
6. Add one line (CLAUDE.md or the artifact-sandbox doc) noting artifact content is treated as untrusted-but-contained (SEC-4).

Run tsc x2 + lint + vitest. Add a DEVLOG entry and flip the Prompt 2 row.
```

Files: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SKILLS.md`, `electron/ipc/settings.ts` (comment).

Verification: tsc ×2, lint, vitest (no behavior change).

Acceptance:
- ✅ No `0.1.24` strings remain except historical DEVLOG entries.
- ✅ Docs consistently say four providers; no "DeepSeek-only" claim.

### Prompt 3 — CI: run smokes on PRs

Close the gap where bundle smokes only run on main/tags, never on PRs.

Prompt:

```text
Implement REPO_AUDIT CI-1. In .github/workflows/ci.yml add a PR- and push-triggered job that runs `npm ci`, `npx electron-vite build`, then `npm run smoke:bundle` and `npm run smoke:renderer`. Reuse the existing Node 22 + cache setup. Keep it separate from the heavy build.yml jobs (which stay main/tags-only). Verify the workflow YAML is valid. Add a DEVLOG entry and flip the Prompt 3 row.
```

Files: `.github/workflows/ci.yml`.

Verification: workflow YAML valid; verified by the PR's own CI run.

Acceptance:
- ✅ A PR now runs both smokes; a deliberately broken bundle fails the PR.

### Prompt 4 — Streaming & connection bugs (High)

Fix the `chatStream` retry corruption (BUG-1) and the MCP stdio double-reconnect race (BUG-2).

Prompt:

```text
Implement REPO_AUDIT BUG-1 and BUG-2.

BUG-1 (electron/services/providers/registry.ts, chatStream ~542-628): move `let fullContent = ''` and the `toolCallsAccumulator` Map declaration to the TOP OF EACH iteration of the `while (retries <= maxRetries)` loop, so a mid-stream failure that does `retries++; continue` starts from clean accumulators instead of appending to partial content/tool-call args. Keep `retries`/`maxRetries` outside the loop and preserve the cancelled-early-return semantics.

BUG-2 (electron/services/mcp-manager.ts ~405-440): add a per-server `restarting` boolean to the server state. Make both transport.onerror and transport.onclose route their reconnect through it — the first to fire sets restarting=true and schedules cleanup+connectServer; the second short-circuits while restarting; clear the flag on reconnect success or terminal MAX_RESTARTS.

Add regression tests: a stubbed first stream that throws after partial deltas then a second stream that succeeds → assert onDone content equals only the second stream (no duplication) and no leaked partial tool-call args; back-to-back onerror+onclose → assert connectServer is invoked once.

Run the full gate incl. smokes. DEVLOG entry + flip the Prompt 4 row.
```

Files: `electron/services/providers/registry.ts`, `electron/services/mcp-manager.ts`, + `*.test.ts`.

Verification: full gate incl. smokes; new tests cover both bugs.

Acceptance:
- ✅ Retried stream yields un-duplicated content/tool-calls.
- ✅ A crash that fires error+close reconnects exactly once.

### Prompt 5 — Test foundation (jsdom + stores/services)

Stand up the renderer test environment and cover the highest-risk untested code (TEST-1, TEST-2). Unblocks tests for Prompts 8 and 11.

Prompt:

```text
Implement REPO_AUDIT TEST-1 and TEST-2.

1. Add devDeps: jsdom, @testing-library/react, @testing-library/jest-dom. In vitest.config.ts use environmentMatchGlobs so src/**/*.test.tsx run under jsdom while electron/** stay node; add setupFiles for jest-dom matchers. Add a `coverage` block (baseline collection only, no failing threshold yet).
2. Cover the high-traffic Zustand stores with jsdom tests: src/stores/chat-store.ts (373 LOC), agent-store.ts, settings-store.ts.
3. Add service round-trip/error tests for electron/services/providers/registry.ts (stream parse + error/retry — may overlap Prompt 4, fine) and electron/services/keychain.ts (encrypted vs plaintext round-trip). Mirror the existing vi.mock('electron', ...) + __reset* conventions.
4. Add 2-3 representative IPC handler tests (e.g. settings provider-key save/test/delete envelopes; chat:send happy path with a mocked registry).

Run tsc x2 + lint + vitest (suite grows). DEVLOG entry + flip the Prompt 5 row.
```

Files: `vitest.config.ts`, `package.json` (devDeps), new `src/stores/*.test.tsx`, new `electron/**/*.test.ts`.

Verification: tsc ×2, lint, vitest (file/test count rises; record the new totals).

Acceptance:
- ✅ `src/**/*.test.tsx` run under jsdom; `electron/**` stay node.
- ✅ chat-store / agent-store / settings-store and keychain round-trip are covered.

### Prompt 6 — Renderer privilege hardening (High)

Confine the filesystem IPC and give the main renderer a CSP (SEC-1, SEC-7).

Prompt:

```text
Implement REPO_AUDIT SEC-1 and SEC-7.

SEC-1 (electron/ipc/files.ts:78-125): confine the readText / listDir / walkProject handlers so they can only reach the file-browser root and its descendants. The browser root is files.getWorkdir() (NOT getActiveWorkspace — the picked workdir can differ and the browser legitimately recurses it; callers are FilesPanel.tsx and QuickOpenPalette.tsx). Reuse the resolvePathWithinWorkspace helper (electron/services/apply-patch-tool.ts) against the workdir root; reject absolute paths outside it and any `..` escape. Confirm the file browser and Ctrl+P palette still work for in-workdir files.

SEC-7 (electron/main.ts:295-306): the onHeadersReceived CSP currently only covers lamprey-artifact URLs (and via substring .includes). Add a restrictive default-src 'self' CSP for the MAIN renderer document too (e.g. default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'), and match the artifact scheme precisely (URL parse / startsWith, not substring). Verify the production renderer doesn't need 'unsafe-inline' for scripts.

Add tests: confinement rejects ../, absolute-out-of-root, and ~/.ssh paths; allows in-root descendants. Run the full gate incl. smokes (an over-strict CSP white-screens the renderer — smoke:renderer + a manual app launch are the guards). DEVLOG + flip Prompt 6.
```

Files: `electron/ipc/files.ts`, `electron/main.ts`, + `files.test.ts`.

Verification: full gate incl. smokes; manual launch to confirm no console CSP violations.

Acceptance:
- ✅ `files.*` IPC cannot read outside the workdir root; browser/palette still work.
- ✅ Main renderer ships a CSP; artifact scheme matched precisely.

### Prompt 7 — Main-process correctness

Hooks stdio hang, silent MCP-config overwrite, risky `any` seams, and the silent unknown-model default (BUG-3, BUG-5, QUAL-2, QUAL-3).

Prompt:

```text
Implement REPO_AUDIT BUG-3, BUG-5, QUAL-2, QUAL-3.

BUG-3 (electron/services/hooks-runner.ts:40): hooks are fire-and-forget (only exit code is logged) but stdout/stderr are piped and never drained, so a hook writing >~64KB hangs forever. Set stdio: 'ignore' (or .resume() both streams).
BUG-5 (electron/services/mcp-manager.ts:86 loadConfigs): on JSON.parse failure, console.error and back up the corrupt mcp-servers.json (e.g. .bak-<ts>) before regenerating defaults; validate the parsed value is an array of {id,...} before returning it.
QUAL-2: type the unvalidated shapes instead of `any` — mcp-manager.ts:276 content as {type:string; text?:string}[] with a narrowing guard; chat.ts:360/412/456 message pushes against ChatCompletionMessageParam (these are the exact shapes behind the documented orphan-tool-reply 400s).
QUAL-3 (registry.ts:297 resolveModel): stop silently routing unknown model ids to the DeepSeek provider with a 64K window — surface/flag the unknown id (log + mark so chat.ts can warn, or throw a typed error).

Add tests (hooks-runner doesn't hang on >64KB output; loadConfigs backs up + defaults on corrupt file; resolveModel surfaces unknown ids). Full gate incl. smokes. DEVLOG + flip Prompt 7.
```

Files: `electron/services/hooks-runner.ts`, `electron/services/mcp-manager.ts`, `electron/services/providers/registry.ts`, `electron/ipc/chat.ts`, + tests.

Verification: full gate incl. smokes.

Acceptance:
- ✅ A noisy hook no longer hangs; corrupt MCP config is backed up not silently lost.
- ✅ The two `any` seams are typed; unknown model ids no longer misroute silently.

### Prompt 8 — Renderer + IPC-contract correctness

SideChatPanel resubscribe-on-chunk and the App.tsx listener-cleanup / shared-channel contract (BUG-4, BUG-6). Isolated because BUG-6 changes a preload IPC contract.

Prompt:

```text
Implement REPO_AUDIT BUG-4 and BUG-6.

BUG-4 (src/components/tools/panels/SideChatPanel.tsx:59-79): the chat.subscribe effect lists streamBuf in its deps, so the IPC subscription is torn down/recreated on every streamed chunk and onDone reads a stale buffer. Depend only on convId; keep the latest buffer in a streamBufRef updated alongside setStreamBuf and read streamBufRef.current in onDone.
BUG-6: make the chat/app error listeners cleanable. App.tsx:139-150 registers chat.onError / app.onError / app.onWarning with no cleanup; separately useChat's chat.offAll() calls removeAllListeners('chat:error') which strips App's listener on any useChat remount. Change these preload helpers (preload.ts:27/35 area) to return an unsubscribe function (mirror tools.onApprovalRequired), have App.tsx use it for cleanup, and stop using removeAllListeners on shared channels — scope cleanup to the listeners each caller added.

Add jsdom tests (needs Prompt 5): SideChatPanel creates its subscription once across multiple chunk events; App listeners are removed on unmount without clobbering siblings. Full gate incl. smokes. DEVLOG + flip Prompt 8.
```

Files: `src/components/tools/panels/SideChatPanel.tsx`, `src/App.tsx`, `electron/preload.ts`, + jsdom tests.

Verification: full gate incl. smokes.

Acceptance:
- ✅ SideChat subscribes once per conversation, not per chunk.
- ✅ `on*` error helpers return unsubscribers; no `removeAllListeners` on shared channels.

### Prompt 9 — Model-input security

SSRF blocklist, git option-injection, `file:` navigation, and the `openInVSCode` shell (SEC-2, SEC-5, SEC-6, SEC-8).

Prompt:

```text
Implement REPO_AUDIT SEC-2, SEC-5, SEC-6, SEC-8.

SEC-2 (electron/services/web-tools.ts:226 web_open + web_find): add a shared assertPublicUrl(url) that rejects loopback (127.0.0.0/8, ::1, localhost), link-local (169.254.0.0/16 incl. the 169.254.169.254 metadata IP, fe80::/10), RFC1918 (10/8, 172.16/12, 192.168/16), and unique-local fc00::/7. Re-validate after redirects (set redirect:'manual' and check each hop, or use a custom agent). Reuse it in both tools.
SEC-5 (electron/ipc/worktree.ts:53,72): validate the renderer-supplied branch and baseRef against ^[A-Za-z0-9._/-]+$, reject a leading '-', and insert '--' before positional path args in the git argv.
SEC-8 (electron/services/browser-manager.ts:115 coerceUrl/isHttpish): drop file: from model-driven navigation (keep about:blank internal default).
SEC-6 (electron/ipc/files.ts:228-270 openInVSCode): drop shell:true on the launch — resolve the `code` binary and spawn argv-form with the path as an arg.

Add tests for each (blocked IP ranges rejected / public allowed / redirect-to-localhost rejected; branch with --upload-pack= or leading - rejected; coerceUrl('file:///etc/passwd') no longer returns a file: URL). Full gate incl. smokes. DEVLOG + flip Prompt 9.
```

Files: `electron/services/web-tools.ts`, `electron/ipc/worktree.ts`, `electron/services/browser-manager.ts`, `electron/ipc/files.ts`, + tests.

Verification: full gate incl. smokes.

Acceptance:
- ✅ `web_open`/`web_find` cannot reach private/loopback/metadata addresses (incl. via redirect).
- ✅ Git branch names can't inject options; model nav is http/https only; VS Code launch is argv-form.

### Prompt 10 — Secrets & OAuth hardening

Surface the plaintext-key fallback, lock down `keys.json`, and add OAuth CSRF `state` (SEC-3, SEC-9, SEC-10).

Prompt:

```text
Implement REPO_AUDIT SEC-3, SEC-9, SEC-10.

SEC-3/SEC-10 (electron/services/keychain.ts): write keys.json with { mode: 0o600 } and chmod an existing file once. When safeStorage is unavailable the keys are stored as plain:<key> with only a console.warn — surface isEncryptionAvailable() (already exists) to the Settings UI so the user is clearly warned before any secret is persisted in cleartext (default: strong warning rather than refusing, so Linux-without-keyring users aren't blocked).
SEC-9 (electron/ipc/mcp.ts:40 OAuth flow): generate a random state (randomBytes(16).hex), add it to the auth URL, and verify it on the callback before accepting the code; reject on mismatch. Keep the fixed callback port.

Add tests: keychain round-trip (encrypted -> base64 ciphertext; unavailable -> plain: path, assert the file mode is 0o600); OAuth callback rejects a mismatched state (extract the validation into a testable helper). Full gate (include smokes — keychain/mcp are in the main bundle). DEVLOG + flip Prompt 10.
```

Files: `electron/services/keychain.ts`, `electron/ipc/mcp.ts`, a settings status IPC + UI warning, + tests.

Verification: full gate incl. smokes.

Acceptance:
- ✅ `keys.json` is `0o600`; the plaintext-fallback condition is visible to the user.
- ✅ OAuth callback validates `state`; a mismatched code is rejected.

### Prompt 11 — `agentMode` rewire (Planner→Coder→Reviewer)

Make the dead `agentMode` toggle drive a real sequential pipeline (QUAL-1). The renderer
pipeline UI, the `agent:status` IPC channel, and `useAgentStore.recordStatus` already
exist and are **dormant** — nothing in main emits `agent:status`. This prompt adds the
main-process orchestration + the one missing emit; the UI/store need ~zero changes.

Prompt:

```text
Implement REPO_AUDIT QUAL-1 — rewire agentMode. Read electron/ipc/chat.ts, electron/services/multi-agent-run-tool.ts (executeMultiAgentRun), electron/services/system-prompt-builder.ts (AGENT_ROLE_PROMPTS, buildAgentSystemPrompt), src/stores/agent-store.ts, src/components/chat/AgentRunBanner.tsx, src/hooks/useChat.ts, electron/preload.ts first.

Architecture: create electron/services/agent-pipeline.ts (keeps chat.ts from growing; unit-testable via injected runner/runRound seams). In chat.ts chat:send (~:135), replace `void requestedAgentMode` (~:256) with: if agentMode === 'multi', run a sequential Planner -> Coder -> Reviewer pipeline; else the existing single path UNCHANGED.

- Planner (tool-less): reuse executeMultiAgentRun with role 'planner' -> capture plan. Emit agent:status running->done.
- Coder (tool-ENABLED — cannot be a multi_agent_run sub-agent since 'coder' is excluded from SUPPORTED_ROLES): reuse the existing runChatRound with the roster's coder model, buildSystemPrompt(..., contractRole:'coding'), the plan injected as context, and the full tools set. Its output streams to the chat surface like a normal turn.
- Reviewer (tool-less): executeMultiAgentRun role 'reviewer', context = Coder output bounded by summarizeRun (final-response-composer.ts, <=32KB).

Add emitAgentStatus() next to emitChatEvent/emitPhase in chat-events.ts (channel agent:status already exists in preload + is subscribed by useChat). Read the roster from settings.json (agentRoster is already persisted) and validate each model id with resolveModel — do not trust renderer-sent ids. On any stage error emit {role,state:'error'} and fall through to chat:error.

Do NOT change AgentRunBanner / agent-store / useChat / preload (they're already wired). Document that multi_agent_run (mid-turn parallel tool-less fan-out) and the agentMode pipeline (turn-level sequential, tool-enabled coder) are orthogonal and both stay.

Tests: pipeline runs planner->coder->reviewer in order with per-stage running/done emits; roster ids passed per stage; unknown roster id rejected; planner failure emits error + aborts; abort signal cancels in-flight stage; agentMode 'single' calls runChatRound once with no agent:status; multi_agent_run tool still dispatches independently. (Renderer-side store/banner test uses Prompt 5's jsdom.) Full gate incl. smokes. DEVLOG + flip Prompt 11.

Optional (QUAL-4): if time permits, extract resolveSingleToolCall from chat.ts — but the new agent-pipeline.ts service already relieves chat.ts growth, so this is deferrable.
```

Files: `electron/ipc/chat.ts`, `electron/services/agent-pipeline.ts` (new), `electron/services/chat-events.ts`, `src/lib/types.ts` (if `ChatRequest.agentRoster` is added), + tests. Reuses unchanged: `multi-agent-run-tool.ts`, `system-prompt-builder.ts`, `final-response-composer.ts`, `agent-store.ts`, `AgentRunBanner.tsx`, `useChat.ts`, `preload.ts`.

Verification: full gate incl. smokes; manually toggle the pill and confirm the banner pipeline lights up and the Coder stage streams real edits.

Acceptance:
- ✅ Toggling agent mode to "multi" runs a real Planner→Coder→Reviewer turn; the `AgentRunBanner` pipeline reflects live per-role state.
- ✅ The Coder stage performs real tool-driven edits (reuses `runChatRound`).
- ✅ `single` mode is byte-for-byte unchanged; `multi_agent_run` still works independently.

### Prompt 12 — CI: macOS build + coverage baseline

Catch macOS packaging breakage and stop coverage erosion (CI-2).

Prompt:

```text
Implement REPO_AUDIT CI-2. In .github/workflows/build.yml add an unsigned build-macos job (runs-on: macos-latest, CSC_IDENTITY_AUTO_DISCOVERY=false, npm ci, electron-vite build + smoke:bundle + smoke:renderer, no publish) so non-signing mac breakage is caught. Add a `coverage` invocation (vitest run --coverage) with a low baseline threshold to CI (ci.yml test job and/or vitest.config.ts) so the untested surface can't grow unchecked. Validate the workflow YAML. DEVLOG + flip Prompt 12, then add a "Sprint complete" entry to AUDIT_REMEDIATION_PROGRESS.md with the final test/coverage numbers.
```

Files: `.github/workflows/build.yml`, `.github/workflows/ci.yml`, `vitest.config.ts`/`package.json`.

Verification: workflow YAML valid; verified by CI.

Acceptance:
- ✅ macOS build + smokes run in CI (unsigned).
- ✅ Coverage is collected with a baseline threshold.

---

## Notes

- **Reorder freedom:** prompts 1–3 are independent and can land in any order; 5 should precede 8 and 11 (its jsdom env is their test home); 4 (High bugs) should not wait.
- **Product surface:** Prompt 11 is the only behavioral feature; everything else is fix/hardening/test/doc/CI. Its default path (`single`) is unchanged, so the blast radius is contained behind `agentMode === 'multi'`.
- **Out of scope (documented, not silent):** cross-device sync for plan/goal state; the Electron 35 pin (tracked in CLAUDE.md, revisit on better-sqlite3 V8 13).
