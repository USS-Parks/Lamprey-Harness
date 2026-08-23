# Lamprey Live Audit Hardening Phase - Sequential Prompt Roster

> **Status: revised draft for user review.** Do not execute this roster until the user approves it. This supersedes the stale 2026-06-05 draft and is based on a fresh audit of `main` on 2026-06-06 after the v0.8.0 Reasoning Audit Phase.

**Goal:** close the current live-repo hardening findings without broad product redesign: harden workflow/hook JavaScript isolation, prevent plugin/skill-import paths from silently creating executable capabilities, keep filesystem writes inside intended roots, and centralize safe external URL opening.

**Why this revision exists:** the prior draft predated the shipped Reasoning Audit and Skill Import work. The re-audit found that the original three findings are still live, and the newer Skill Import ejection path adds one new path-boundary finding that should be fixed in the same hardening phase.

**Execution model:** single session, single worktree off `main`, sequential H1 -> H7. No track splits. H1 defines the isolation contract; H2 and H3 apply it to production workflow/hook runners; H4 gates executable plugin connectors; H5 hardens Skill Import filesystem boundaries; H6 centralizes external-open scheme checks; H7 closes verification, docs, and the approval packet.

**Companion to:** [`LAMPREY_REASONING_AUDIT_PLAN.md`](LAMPREY_REASONING_AUDIT_PLAN.md), [`LAMPREY_SKILL_IMPORT_PLAN.md`](LAMPREY_SKILL_IMPORT_PLAN.md), [`LAMPREY_CUSTOMIZE_PLAN.md`](LAMPREY_CUSTOMIZE_PLAN.md), and [`LAMPREY_SANDBOX_PARITY_PLAN.md`](LAMPREY_SANDBOX_PARITY_PLAN.md). These are reference-only for shipped architecture and current P-SPR format.

---

## 0. Session Bootstrap - Read This First

You are a fresh coding session handed this document. Before doing anything else:

### Step 1 - Confirm environment

Verify:

- Working directory is `C:\Users\17076\Documents\Claude\Lamprey Harness` or a worktree thereof.
- Current branch is not `main`. Create a branch such as `feat/live-audit-hardening` off `main` if needed.
- `git status --short --branch` is inspected before editing. Do not revert unrelated user changes.
- Baseline checks pass before H1 starts:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`

If any baseline check fails, halt and report the exact failure. Do not start on a broken baseline.

### Step 2 - Fresh-audit baseline already observed

The 2026-06-06 re-audit baseline was:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 124 files passed, 4 skipped; 1916 tests passed, 38 skipped.
- `npm run build` passed.
- In the sandbox, `npm test` and `npm run build` first failed with `spawn EPERM` while starting the build helper; rerunning with approved outside-sandbox execution passed.

Re-run the same checks in the implementation session anyway. This note is context, not a waiver.

### Step 3 - Execute H1 -> H7 without stopping

1. Do not ask further questions unless a prompt requires a decision only the user can make.
2. For each prompt, in order:
   - Read the "Files" list and nearby code before editing.
   - Implement only the prompt's scope.
   - Run the prompt's verify gate.
   - If verify fails: fix and retry up to 2 times. On the third failure, halt, write a blocked DEVLOG entry, and report.
   - If verify passes: mark the prompt `[x]` in this document, append a DEVLOG entry, then commit. Do not push.
3. One commit per prompt. No batching, no amending across prompts unless the user explicitly asks.
4. When all prompts complete: run the phase completion gate, write the phase-complete DEVLOG entry, and report final status.

### Step 4 - DEVLOG entry format

```markdown
## [Live Audit Hardening - Prompt HN] <Title> - <YYYY-MM-DD>

**Files changed:** <list>
**Verify gate:**
- typecheck OK
- lint OK
- vitest <subset or all> OK
- build OK, smoke OK, or "user-verification-needed: <what to check>"

**Notes:** <anything surprising, deferred, or worth knowing>

**Commit:** <SHA>
```

### Step 5 - Commit discipline

- One commit per prompt.
- Never use `--no-verify`. If a hook fails, fix the underlying issue.
- Never add a `Co-Authored-By` trailer.
- Use the project's commit-message style, for example:
  - `fix(hardening): H1 add isolated script probes`
  - `fix(plugins): H4 require trust before plugin connectors`
  - `fix(skill-import): H5 constrain ejected skill paths`

---

## 1. Audit Summary - Current Findings

| # | Finding | Current evidence | Owner prompt |
|---|---|---|---|
| 1 | Workflow JS is described as sandboxed but receives raw host functions and constructors. Exposed timer/log/stdlib bindings can become escape gadgets unless proven otherwise. | `electron/services/workflow-runner.ts` builds a `vm` sandbox with raw `JSON`, `Math`, `Promise`, `Array`, `Object`, timers, and helpers at lines 675-707. | H1, H2 |
| 2 | Hook JS has the same isolation class problem. It exposes raw `log`, `console`, `Date`, `JSON`, and `Math` into a `vm` context. | `electron/services/hooks-runner.ts` returns raw helper functions and stdlib constructors at lines 110-127, then runs hook code in `vm.Script` at lines 130-150. | H1, H3 |
| 3 | Plugin-owned MCP connectors auto-connect when a plugin is enabled. A plugin `connectors.json` entry with `transport: "stdio"` can start a local process without a separate connector trust action. | `electron/services/mcp-manager.ts` reads enabled plugin `connectors.json`, sets `enabled: true`, adds states, then calls `connectPluginServer()` at lines 200-280. `connectStdio()` constructs `StdioClientTransport` at lines 626-636. | H4 |
| 4 | Skill Import ejection trusts renderer-supplied `skillSlug` for source and destination paths. A malicious or compromised renderer IPC caller can attempt path traversal and, with overwrite, destructive removal outside the intended user-skill root. | `electron/ipc/cc-skill-import.ts` forwards `payload.skillSlug` directly at lines 75-86. `electron/services/cc-skill-importer.ts` joins it into both `sourceSkillDir` and `destDir` without a containment check at lines 353-391. | H5 |
| 5 | Main-window popup handling still opens arbitrary URL schemes through the OS external opener. The IPC helper has a string-prefix HTTP(S) check, but the popup path does not share that guard. | `electron/main.ts` calls `shell.openExternal(details.url)` inside `setWindowOpenHandler` at lines 294-296. `shell:openExternal` uses a separate prefix check at lines 383-386. | H6 |

### Observed but not assigned a prompt

- The Reasoning Audit Phase is now shipped and tested. `includePastReasoningInContext` defaults on by design, and `buildApiMessagesFromStoredMessages()` rehydrates saved reasoning as `<think>...</think>` when enabled. This is intentional product behavior from the shipped R8/R9 prompts, so this hardening phase should preserve it rather than reverse it.
- `debug-trace` is opt-in through settings unless explicitly forced in a debug build. The audit did not find it writing full prompts or reasoning bodies by default; no hardening prompt is assigned.
- GitHub external opening already gates to `https://github.com`. H6 may reuse the central helper there only if it keeps that stricter host check intact.

---

## 2. Architectural Invariants - Locked

1. **No raw host callables cross into untrusted JavaScript.** Workflow and hook bindings must either be context-owned, data-only, or wrapped so `binding.constructor("return process")()` does not reach host `process`.
2. **Do not call Node `vm` a security boundary without regression probes.** Every exposed binding gets escape tests before the prompt is considered done.
3. **Workflow and hook APIs stay useful.** `agent`, `parallel`, `pipeline`, `phase`, `log`, `workflow`, `memory`, `askUser`, `args`, `budget`, hook context values, and logging remain available unless a prompt explicitly replaces them with safer equivalents.
4. **Plugin connectors are executable capability.** Install, import, or enable can make connector definitions visible, but must not spawn `stdio` or connect SSE without explicit trust.
5. **Renderer IPC payloads are untrusted.** Any filesystem path or slug that crosses IPC must be validated, normalized, and proven to remain under the intended root before copy, write, remove, or open operations.
6. **External-open allowlist is central.** Main-process popup handling and IPC external-open use the same URL parser/allowlist helper. HTTP(S) only unless a prompt explicitly documents a narrower allowlist such as GitHub-only.
7. **Reasoning audit behavior is preserved.** This phase does not remove saved reasoning, stage chips, or the `includePastReasoningInContext` toggle. Tests should guard that hardening changes do not break the v0.8.0 reasoning trail.
8. **Verification is evidence-based.** If an Electron UI behavior cannot be exercised in the coding session, record `user-verification-needed` instead of claiming it.

---

## 3. The Seven Prompts

### Prompt sequence

| # | Prompt | One-liner | Files (net new / modified) | Verify | Status |
|---|---|---|---|---|---|
| H1 | **Shared isolation contract + escape probes** | Create a reusable isolation test/probe harness for workflow and hook JavaScript. Probes must cover `Function`, host function constructors, timers, `Date`, `log`, `console`, `Object.constructor`, `this.constructor`, `process`, `require`, dynamic import, and `child_process`. | New `electron/services/isolated-script-runner.ts` if useful; new `electron/services/isolated-script-runner.test.ts`; `electron/services/workflow-runner.test.ts`; `electron/services/hooks-runner.test.ts` | Unit escape probes fail; allowed binding fixture works; sync timeout still interrupts; typecheck; lint | [ ] |
| H2 | **Workflow sandbox remediation** | Rewire `workflow-runner.ts` to the H1 isolation model. Replace raw timers and stdlib/host helpers with safe equivalents while preserving workflow features and deterministic guards. | `electron/services/workflow-runner.ts`, `electron/services/workflow-runner.test.ts`, H1 helper if created | Existing workflow tests pass; timer/host escape tests fail to reach `process`; agent/parallel/pipeline/memory/askUser/budget behavior intact; typecheck; lint; workflow test subset | [ ] |
| H3 | **Hook sandbox remediation + copy alignment** | Rewire JS hooks to the same boundary. Replace raw `log`, `console`, `Date`, `JSON`, and `Math` exposure. Keep legacy shell hooks explicit and align Settings copy with the real isolation guarantee. | `electron/services/hooks-runner.ts`, `electron/services/hooks-runner.test.ts`, `src/components/settings/HooksSettings.tsx` | Existing hook tests pass; `log.constructor(...)`, `Date.constructor(...)`, and `console.log.constructor(...)` cannot reach `process`; `preToolUse` block semantics intact; typecheck; lint | [ ] |
| H4 | **Plugin connector trust gate** | Treat plugin `connectors.json` entries as blocked/untrusted until the user explicitly trusts each connector. Enabling/importing a plugin must not auto-connect or spawn `stdio`. Add trust/revoke IPC and UI state. | `electron/services/mcp-manager.ts`, `electron/services/plugin-loader.ts`, `electron/ipc/mcp.ts` or `electron/ipc/plugins.ts`, `electron/preload.ts`, `src/components/customize/ConnectorsColumn.tsx`, `src/components/customize/PluginsColumn.tsx`, tests | Unit: plugin `stdio` connector does not instantiate `StdioClientTransport` before trust; trusted connector connects; revoke disconnects and blocks reconnect; passive skills still load; typecheck; lint | [ ] |
| H5 | **Skill Import filesystem containment** | Validate and normalize every Skill Import source/destination slug and path. Ejected skills must stay under `<pluginRoot>/skills/<slug>` for source and `<userData>/skills/<slug>` for destination. Reject traversal, absolute paths, separators, symlink escapes, and destructive overwrite outside root. | `electron/services/cc-skill-importer.ts`, `electron/ipc/cc-skill-import.ts`, `src/stores/cc-import-store.ts` if return shape changes, `src/components/customize/SkillsColumn.tsx` if UX copy changes, tests | Unit: traversal `../`, absolute path, backslash/forward-slash, symlink escape, and overwrite-outside-root attempts are rejected; normal eject still works; import still copies supported skill trees; typecheck; lint | [ ] |
| H6 | **External-open scheme hardening** | Add one main-process helper for OS external opens that accepts only parsed HTTP(S) URLs. Use it in `setWindowOpenHandler`, `shell:openExternal`, artifact/doc-link bridge paths, and GitHub/open-browser paths where appropriate without loosening GitHub-only checks. | `electron/main.ts`, optional new `electron/services/external-open.ts`, `electron/ipc/github.ts` if central helper is reused, tests | Helper accepts `http://` and `https://`; rejects `file:`, `javascript:`, `data:`, `view-source:`, custom schemes, malformed/empty URLs; popup handler denies without opening rejected schemes; typecheck; lint | [ ] |
| H7 | **Phase verify + docs + approval packet** | Run the full gate, update DEVLOG and this plan, and prepare the user-facing approval packet with shipped changes, tests, and residual risks. Preserve Reasoning Audit behavior while proving hardening changes did not regress it. | `DEVLOG.md`, `PLANNING/LAMPREY_LIVE_AUDIT_HARDENING_PLAN.md`, README/CLAUDE only if behavior needs documentation | `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`; user-verification-needed UI smoke for plugin trust/eject/external-open if not fully automatable | [ ] |

---

## 4. Prompt Details

### H1 - Shared isolation contract + escape probes

**Goal.** Establish a reusable proof harness before touching production callers.

**Work.**

- Add shared escape probes that can run against both workflow and hook contexts.
- Include the exact current high-risk probes:
  - `setTimeout.constructor("return typeof process")()`
  - `log.constructor("return typeof process")()`
  - `Date.constructor("return typeof process")()`
  - `console.log.constructor("return typeof process")()`
- Include broader probes:
  - `Function("return process")`
  - `this.constructor.constructor("return process")()`
  - `Object.constructor("return process")()`
  - `globalThis.process`
  - `require`
  - `import("node:child_process")`
  - `constructor.constructor("return require")()`
- If a shared runner is introduced, keep it pure service code with no Electron imports.
- Make failures crisp: an escape probe may throw or return `undefined`; it must never return host `process`.

**Acceptance.**

- Shared fixture proves allowed data/functions can be called.
- Escape probes fail against the shared runner.
- Timeout test still interrupts a sync infinite loop.
- H2/H3 can reuse the helper without reauthoring the probe list.

### H2 - Workflow sandbox remediation

**Goal.** Make workflow execution match its documented isolation boundary.

**Work.**

- Replace raw `setTimeout`, `clearTimeout`, `setImmediate`, and `clearImmediate` exposure.
- Replace raw stdlib constructors where needed. If the code keeps a subset such as `JSON` or `Math`, prove their constructors cannot escape.
- Preserve workflow-visible delay behavior. If direct timers cannot be safely exposed, add a safe `sleep(ms)` helper and migrate references/tests accordingly.
- Preserve:
  - top-level async IIFE behavior
  - `agent`, `parallel`, `pipeline`, `phase`
  - `workflow`, `memory`, `askUser`
  - `args`, frozen `budget`
  - deterministic blocks for `Date.now`, `new Date`, and `Math.random`
- Deep-clone or freeze input objects that should not leak mutations.

**Acceptance.**

- Existing workflow tests remain green.
- The timer escape class is closed.
- Allowed workflow API calls still work.
- Abort/timeout behavior is unchanged.

### H3 - Hook sandbox remediation + copy alignment

**Goal.** Close the same host escape class in JS hooks and keep user-facing copy honest.

**Work.**

- Replace raw `log` and `console.*` with safe wrappers.
- Avoid exposing raw `Date`, `JSON`, and `Math` if constructor probes can escape.
- Keep `args` mutation isolation.
- Keep `preToolUse` throws as the blocking mechanism.
- Preserve legacy shell-hook execution only as explicit legacy executable behavior.
- Keep UI-created hooks JS-only unless a separate shell-hook trust flow exists.
- Update `HooksSettings.tsx` wording so it does not overpromise isolation.

**Acceptance.**

- Hook escape probes fail.
- Logging still works.
- `preToolUse` blocks; `postToolUse` does not block.
- Settings copy matches behavior.

### H4 - Plugin connector trust gate

**Goal.** Prevent plugin install, import, or enable from implicitly starting local connector processes.

**Work.**

- Add persisted trust state keyed by plugin id + connector id.
- Change plugin connector refresh so untrusted connectors are listed but not connected.
- Add trust and revoke operations through IPC/preload.
- Add UI affordances:
  - blocked/untrusted badge
  - "Trust and connect" action
  - warning that `stdio` starts a local process
  - "Revoke trust" action
- Treat SSE plugin connectors as trust-required too unless a narrower policy is deliberately documented.
- Keep passive plugin assets working: skills, slash commands, README, and imported CC skill bundles.

**Acceptance.**

- Installing or enabling a plugin with `connectors.json` does not spawn a process.
- Trusting connects.
- Revoking disconnects and prevents reconnect.
- Passive skills still load.

### H5 - Skill Import filesystem containment

**Goal.** Make Skill Import ejection and copy paths robust against renderer-supplied traversal.

**Work.**

- Add a slug validator for skill ids accepted over IPC:
  - reject `..`
  - reject absolute paths
  - reject path separators
  - reject empty/whitespace
  - allow only the established skill-id character set
- Resolve source and destination paths, then prove containment with path-boundary checks that distinguish sibling-prefix paths.
- Before `rmSync`, prove the resolved target is inside the intended user-skill root.
- Consider symlink behavior in `copyTree()`:
  - reject symlinks, or
  - resolve and prove both source and destination remain inside their intended roots before copying.
- Return clear errors for rejected payloads.
- Add tests for direct service calls and IPC-facing validation shape.

**Acceptance.**

- Normal eject from a plugin skill still works.
- Traversal and overwrite-outside-root attempts are rejected before copy/remove.
- Importer still handles CC skill trees with supporting files.

### H6 - External-open scheme hardening

**Goal.** Make every OS external-open path reject unsafe schemes through one helper.

**Work.**

- Add a small helper, for example:
  - `parseExternalHttpUrl(raw: string): URL | null`
  - `openExternalHttp(raw: string): Promise<boolean>`
- Use it in:
  - `mainWindow.webContents.setWindowOpenHandler`
  - `shell:openExternal`
  - artifact/doc-link external open paths if they bypass the IPC helper
  - GitHub open-in-browser path only if the helper composes with GitHub-only host validation
- Deny unsafe schemes without crashing the renderer.
- Log denied schemes at a low-noise level if useful.

**Acceptance.**

- `https://example.com` and `http://example.com` are allowed.
- `file:///C:/Windows/win.ini`, `javascript:alert(1)`, `data:text/html,...`, `view-source:https://example.com`, `mailto:...`, custom schemes, and malformed URLs are denied.
- Window popup handler no longer calls `shell.openExternal` for rejected schemes.

### H7 - Phase verify + docs + approval packet

**Goal.** Close the phase with evidence and a concise review packet.

**Work.**

- Run the full gate:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`
- Run targeted tests introduced by H1-H6.
- Add DEVLOG entries for all prompts.
- Update this plan status only after prompts ship.
- Update README/CLAUDE only if behavior changed enough to document.
- Prepare the approval packet:
  - changed behavior
  - tests run
  - residual risks
  - user-verification-needed smoke items, if any

**Acceptance.**

- All seven prompts are marked `[x]`.
- Full gate is green.
- DEVLOG has H1-H7 entries plus a phase-complete summary.
- Residual risks are explicit.

---

## 5. Phase Completion Criteria

- All seven prompts marked `[x]`.
- Seven commits on the phase branch, one per prompt.
- `npm run typecheck` exits 0.
- `npm run lint` exits 0.
- `npm test` exits 0.
- `npm run build` exits 0.
- Workflow and hook escape probes cannot reach host `process`.
- Plugin connector auto-spawn is impossible without explicit trust.
- Skill Import ejection cannot copy, write, or remove outside intended roots.
- External-open helper denies non-HTTP(S) schemes in popup and IPC paths.
- v0.8.0 Reasoning Audit behavior remains intact.
- DEVLOG includes H1-H7 entries and a phase-complete summary.
- User receives an approval packet summarizing changed behavior, tests run, and residual risks.

---

## 6. Quick Reference - Primary Files

### Workflow and hooks

```text
electron/services/workflow-runner.ts
electron/services/workflow-runner.test.ts
electron/services/hooks-runner.ts
electron/services/hooks-runner.test.ts
src/components/settings/HooksSettings.tsx
```

### Plugin connector trust

```text
electron/services/plugin-loader.ts
electron/services/mcp-manager.ts
electron/ipc/plugins.ts
electron/ipc/mcp.ts
electron/preload.ts
src/components/customize/ConnectorsColumn.tsx
src/components/customize/PluginsColumn.tsx
src/stores/plugins-store.ts
```

### Skill Import containment

```text
electron/ipc/cc-skill-import.ts
electron/services/cc-skill-importer.ts
electron/services/cc-skill-discovery.ts
src/stores/cc-import-store.ts
src/components/customize/SkillsColumn.tsx
```

### External URL opening

```text
electron/main.ts
electron/ipc/github.ts
electron/preload.ts
src/components/artifacts/MarkdownRenderer.tsx
src/components/settings/*Settings.tsx
```

### Reasoning Audit regression guard

```text
electron/services/chat-history.ts
electron/services/chat-history.test.ts
electron/services/conversation-store.ts
src/components/chat/MessageBubble.tsx
src/components/settings/ReasoningAuditSettings.tsx
```

### Verification commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

**End of revised draft plan.**
