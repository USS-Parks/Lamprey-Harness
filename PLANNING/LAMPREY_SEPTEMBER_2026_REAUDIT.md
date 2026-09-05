# Lamprey whole-repository re-audit — 5 September 2026

Status: full STS and Bucket authorized on 5 September 2026. Source remediation is complete through SR-31I; final source acceptance and publication remain open. Companion: [remediation PSPR](LAMPREY_SEPTEMBER_2026_REMEDIATION_PSPR.md).

## Original audit conclusion (before execution)

Lamprey has real correctness and verification defects beneath a passing lint/typecheck/unit-test baseline. The most consequential findings concern post-cancellation tool execution, descriptorless MCP dispatch, database replacement and compaction, filesystem confinement, and a native-database gate that returns success with almost everything skipped. The release process can verify one artifact version and subsequently publish another.

The original audit recorded 30 actionable findings, including maintenance and documentation findings, with severity and evidence distinguished below. It does not assert that every line is wrong, that every issue originated recently, or that an automated audit can establish the absence of all remaining bugs. At that audit-only checkpoint, no product fixes, dependency changes, builds, commits, pushes, releases, or deletions had been performed. Audit helpers and evidence were added under `PLANNING/evidence/`.

## Scope and immutable baselines

- Requested four-week review window: 8 August through 5 September 2026. Older code was inspected where it remains active or interacts with that window's changes.
- Canonical checkout: `C:\Users\17076\Documents\Claude\Lamprey Harness`; repository: [USS-Parks/Lamprey-Harness](https://github.com/USS-Parks/Lamprey-Harness).
- Local tested `main`: `39c2c5ef6a4bba116d21fc9c3da9a8427bb8ca5b`, package version 0.31.0.
- Fetched remote `main`: `673fd1b815ac38412d8769627eebae85646e487e`, 13 commits ahead. The checkout was not advanced. The entire local-to-remote diff was inspected and selected probes also executed against that immutable source.
- Window baseline: `dc1c714ec091147a57561270c3fb8c74cbb20e8a`. Baseline to local: 78 commits, 242 changed files, +16,593/-6,676 lines; ignoring whitespace, +12,131/-2,214. Remote adds 13 commits; its delta touches 13 files, with overlap possible.
- Whole-tree inventory: 1,317 tracked files; automated text scan covered 1,085 files, including 561 production TypeScript/TSX files. Import-graph and source-pattern scans are triage aids, not execution coverage.
- Deep inspection focused on chat/tool dispatch and interruption; MCP/plugin lifecycle; providers and schema conversion; persistence, compaction, restore and files IPC; settings/sidebar/attachment and PR UI; research synthesis; test scripts, hooks, workflows, release scripts and governance claims. Other modules received inventory/search and existing-suite coverage, not a claim of exhaustive line-by-line review.

Git history establishes code provenance, not which model authored every line. The [provenance receipt](evidence/september-audit-provenance.json) follows moved code for SA-01 through SA-19. Much of the dangerous logic predates August; the recent extraction or audit did not eliminate it. SA-16, SA-18 and SA-27 directly involve August verification/release work; SA-25 and SA-26 concern the new upstream changes. Language such as “AI artifacts” is evaluated as dead wiring, unsupported claims, fake assurance, unnecessary indirection and contradictory comments, not guessed model attribution.

## Original audit verification (before execution)

| Check | Result | Limit |
|---|---|---|
| Node project `tsc --noEmit -p tsconfig.node.json` | Pass | Local HEAD |
| Web project `tsc --noEmit -p tsconfig.web.json` | Pass | Local HEAD |
| ESLint | Pass | Local HEAD |
| Full Vitest | 2,948 passed, 157 skipped; 268 files passed, 14 skipped | Local HEAD; skipped is not coverage |
| Dedicated native DB command | Exit 0; 4 passed, 146 skipped; 3 files passed, 14 skipped | Demonstrates an ineffective gate, not native acceptance |
| Extra unused-code diagnostics | 46 node + 3 web diagnostics | Advisory flags, not the configured baseline |
| Root `tsc --noEmit --listFiles` | Exit 0, no files | Explains SA-20 |
| Isolated source probes | Seven local and nine upstream observations reproduced | In-memory transpilation with inert fixtures; no user DB or external MCP mutation |
| Hosted CI at remote HEAD | [CI success](https://github.com/USS-Parks/Lamprey-Harness/actions/runs/33882138669), [Build success](https://github.com/USS-Parks/Lamprey-Harness/actions/runs/33882138667) | Not the local test receipt; hosted counts not asserted |
| OpenWiki | [Failed run](https://github.com/USS-Parks/Lamprey-Harness/actions/runs/33963761725) | Missing noninteractive Anthropic credentials |
| v0.31.0 release/CDN inspection | Six GitHub assets; queried CDN requests returned 403 | No CDN byte/hash match established |

No local production build, interactive Electron acceptance, real provider credential matrix, production database restore, or live hosted MCP authorization exercise was performed. Those are explicit PSPR gates. Logs and reproduction commands are indexed in [evidence guide](evidence/SEPTEMBER_AUDIT_EVIDENCE.md).

## Findings

P1: prioritize before release because of authority, data integrity, or false acceptance. P2: observable functional/operational failure or a materially weak contract. P3: maintainability/storage debt. “Probe” means a deterministic fixture against actual source; “source” means a directly inspected path with runtime acceptance still required.

### SA-01 — P1 — Cancellation permits subsequent tool execution

`electron/services/chat-tool-dispatch.ts:329–368` continues through dispatch windows without checking cancellation before every subsequent call; the single-call path also lacks a consistent abort boundary. `mcp-manager.ts:811–840` does not accept a signal. Interruption settles runtime state before all outstanding dispatch necessarily ends (`turn-interrupt.ts:119–138`, `turn-runtime.ts:348–359`). Probe: the first serial MCP fixture aborts, yet the second call still executes.

Repair the existing dispatch loop and lifecycle: stop scheduling after abort, propagate cancellation where supported, and fence stale completion writes. Already-issued external operations may be irreversible; do not promise rollback. Acceptance must prove no later mutation starts and no old turn corrupts a replacement turn. Provenance: inherited dispatch, extracted in August.

### SA-02 — P1 — Unknown MCP descriptors bypass authority checks

`chat-tool-dispatch.ts:124–144,188–234,277–285` can forward a name to MCP after descriptor lookup fails. Missing descriptors do not count as mutating or approval-requiring. Probe: an unknown name is forwarded while plan mode is active. Exploitability requires a connected server accepting that name; the fixture proves the permissive boundary, not a live exploit.

Resolve an authoritative registered descriptor and validate arguments before dispatch. Reject unknown tools; do not substitute “read-only” for unknown. Test plan mode, approvals, malformed schemas and legitimate discovered MCP tools through the real registration seam.

### SA-03 — P1 — Plugin MCP tools and lifecycle use inconsistent registries

`mcp-manager.ts:470–484` temporarily moves plugin servers through the main map, but discovery/calls/shutdown at approximately 640,812,890 use the main map while `findServer` at 901 sees both. Hosted authorization and retries reconnect through another path. The plugin unsubscribe handle is assigned but never consumed; application quit calls shutdown without awaiting completion.

Use one authoritative lookup/iteration seam for user and plugin servers, retaining ownership metadata. Prove plugin discovery, call, reconnect, disable/uninstall and shutdown against a real local stdio fixture. Avoid adding another parallel registry. This is older Customize-phase wiring, not a newly introduced August feature.

### SA-04 — P1 — Invalid MCP configuration is overwritten

`mcp-manager.ts:298–315` falls back to defaults and writes them after a read/parse failure. A damaged user configuration can therefore be replaced without preserving the original bytes. Persistence also bypasses the existing atomic JSON helper.

Distinguish absent, invalid and unreadable files. Preserve invalid content, fail visibly, validate the loaded shape, and reuse atomic writes. Test malformed content and failed replacement without touching actual user configuration.

### SA-05 — P1 — Manual compaction can erase newer messages or leave partial state

`electron/ipc/conversation.ts:493–527` waits for a model summary, then clears messages and inserts replacement state without an atomic snapshot/version guard. Messages arriving during the await can be removed despite not being in the summarized snapshot; insertion failure follows deletion.

Summarize a stable snapshot, then perform a short transactional, version-checked replacement. Never hold a database transaction open while awaiting a model. Inject an intervening message and an insertion failure in native SQLite tests.

### SA-06 — P1 — Restore moves the live database before validating the backup

`electron/ipc/persistence.ts:125–137` closes the database before validation; `backup-runner.ts:223–275` checks a basename rather than full allowed-source identity, moves the live DB and sidecars, and only then opens the source. Sidecar move errors and recovery are insufficiently handled. Probe: all three live-file moves occur before an invalid source throws.

Validate the authorized source and its database integrity first, stage a usable replacement, and implement recoverable switching. Prove invalid backup, failed move/copy, sidecars, reopen failure and successful restore in an isolated real database directory. Do not test destructive recovery on the user's database.

### SA-07 — P1 — Compression can split a tool-call result block

`context-compressor.ts:172–186` extends a selected assistant/tool boundary by only the first tool result in a multi-result group. Probe: assistant plus first result are selected while a second result is orphaned. Existing estimator tests do not prove safe database selection.

Preserve the complete call/result group by identity and sequence. Test multiple results, partial pending groups, and budget boundaries using the actual selection/persistence seam.

### SA-08 — P1 — Lexical workspace confinement follows links outside the workspace

`electron/ipc/files.ts:150–156` uses resolved lexical paths and relative-path checks; subsequent reads follow symlinks/junctions. A workspace link can point outside the authorized root. This is a source-confirmed confinement gap, not evidence that private files were accessed during this audit.

Reuse upstream confinement, adding canonical target/reparse handling and fail-closed behavior for escapes. Cover Windows junctions and ordinary links in temporary directories. The formerly unconfined generic `files:process` and open-path calls were fixed upstream; do not redo or undo that fix.

### SA-09 — P2 — Schema normalization deletes legitimate property names

`providers/schema-normalizer.ts:124–143` recursively treats property-name maps as schema objects. Probe: fields named `if` and `not` disappear while `required: ['if']` remains, creating an inconsistent tool schema.

Traverse schema keyword positions separately from user property names. Preserve names and values while removing only genuinely unsupported schema keywords. Test nested objects and provider-specific output.

### SA-10 — P1 — Orphaned custom models silently route to DeepSeek

`providers/registry.ts:783–800` and `electron/ipc/model.ts:71,144` permit a model with a removed/missing custom provider to fall back to DeepSeek. This can send a conversation to an unintended provider instead of reporting that configuration is unavailable.

Use a common resolver for selection and dispatch and fail visibly on missing provider identity. Test deletion, stale defaults, imported/custom IDs and built-in collisions. Do not silently select another host as a recovery strategy.

### SA-11 — P2 — Settings navigation exceeds its fixed viewport

`src/components/settings/SettingsDialog.tsx:32–69` contains 24 tabs in a fixed-height dialog without a scrolling navigation rail. Dialog semantics, close labeling and focus containment also need repair. Source-derived usability finding; no visual acceptance run was performed.

Make every tab reachable at supported window sizes, then verify keyboard traversal, focus return, Escape and light/dark layouts in the running app.

### SA-12 — P2 — Broad store subscriptions couple unrelated UI to streaming

`Sidebar.tsx:474`, `GitHubSettings.tsx:21` and `RepositoryPickerDialog.tsx:22` subscribe to entire stores instead of needed state. Sidebar is on a hot streaming path. The subscription is confirmed; actual render-cost magnitude was not benchmarked.

Use focused stable selectors and measure a streaming interaction. Do not create a new state abstraction. A scan hit in ChatView was a comment, not another offending subscription.

### SA-13 — P2 — Escape interrupts streaming before dismissing an open modal

`src/hooks/useKeyboardShortcuts.ts:103–118` prioritizes active streaming over modal state. The same shortcut module implements Ctrl+K behavior that stale Sidebar labels describe differently.

Give the active modal first handling, maintain deliberate chat cancellation when no overlay owns Escape, and correct labels to actual shortcuts. Test both states together.

### SA-14 — P2 — API-key modal assumes the Electron bridge exists and succeeds

`src/components/settings/ApiKeyModal.tsx:26–44` calls the bridge during mount without a presence/error guard. Browser development mode or a rejected bridge call can produce an unhandled promise and missing useful feedback. This is not a claim of a packaged-app crash on every launch.

Use the existing bridge-availability pattern and show failures. Verify missing bridge, denied/rejected call and normal packaged loading.

### SA-15 — P2 — Early tool-search parsing bypasses structural validation

`chat-tool-dispatch.ts` parses the early `tool_search` branch before normal schema validation. Probe: JSON `null` throws when `.query` is read. Parsing valid JSON is not validating an argument object.

Validate shape and schema at the common ingress, including meta-tools; return a structured tool error for null, arrays, primitives and malformed objects.

### SA-16 — P1 — Native verification can be almost entirely skipped and still green

`scripts/test-native-db.cjs:46–60` trusts Vitest's exit code without proving native availability and actual required test execution. Observed: 4 passes, 146 skips, exit zero. Some RAG tests are explicitly skipped placeholders as well. PR #13 improves getDb suite execution but does not itself enforce this runner contract.

Fail the dedicated gate if required native suites do not execute. Separate documented optional skips from required proof, and replace empty placeholders with meaningful coverage or remove unsupported coverage claims. Deliberately breaking the native binding must fail the command.

### SA-17 — P2 — Pull-request UI exists but has no application entry point

The production import graph and reference review show no importer for `PullRequestsPanel`; its diff/status/comment children hang from that unreachable surface. `electron/services/pr-chat-ui-wiring.test.ts:7–27` reads source strings and can pass while the feature remains unreachable.

Restore the advertised existing panel through the app's navigation seam, then test user entry and interaction. Do not delete the panel simply to improve dead-code statistics or treat a source-string assertion as behavioral wiring proof.

### SA-18 — P1 — Bucket can race the tag workflow after byte verification

`scripts/bucket.ps1:221–281` verifies uploaded Windows bytes before the later workflow wait at 320–369. The tag build can subsequently overwrite the release asset; asset-presence shortcuts can bypass waiting. There is no final coherent hash proof across the finished GitHub asset set and the CDN. The queried CDN returned 403, so completed mirroring is unproven.

Choose one artifact authority, wait for all competing producers to settle, and verify final bytes after the last possible write. Hash manifests must bind version, source SHA and exact assets across GitHub and CDN; file existence or size is insufficient.

### SA-19 — P2 — Release and governance statements disagree

Local plans/docs describe a source wrap; remote docs partially correct the GitHub installer story. The live v0.31.0 release body still carries older source-wrap/v0.30.0 wording. TL-W4 remains unproven. Provider-count and M9 documentation corrections already exist in PRs #12 and #14. Historical pending entries need explicit corrections, not rewritten history.

Reconcile against receipts after source and publication gates. A GitHub release does NOT justify checking TL-W4. Preserve the user's modified planning index and earlier audit drafts; their existence is not execution authorization.

### SA-20 — P2 — The advertised root typecheck checks no source files

The package's root `tsc --noEmit` command targets a config with `files: []` and project references, without build mode. `--listFiles` returns no files and exit zero. The two explicitly targeted project checks do work and passed.

Make the public command run both real projects. Prove a temporary type error in each project makes it fail, then remove the fixture.

### SA-21 — P2 — Sidebar resizing misses cancellation and teardown cleanup

`Sidebar.tsx:537–545` removes drag listeners on mouseup only. Blur, cancellation and unmount are not handled consistently with the existing app resize pattern.

Reuse the established cleanup pattern and test unmount/lost focus mid-drag. Confirm no stuck cursor or continued width updates.

### SA-22 — P3 — Dead wrappers, imports and disconnected components survive refactors

Optional unused checks found 49 diagnostics, many left in chat.ts after dispatch extraction. `providers/openrouter-routing.ts:62–73` keeps a deprecated wrapper used by old tests. The literal import graph flags 24 renderer files totaling 2,782 lines; four PR-surface files totaling 695 lines should be reconnected under SA-17, leaving 20 candidates/2,087 lines for reachability adjudication.

Delete only proven unreachable code and obsolete wrappers. Audit near-duplicate environment handlers for a small shared seam only if behavior is equivalent. Intentional provider/type parity locks are not automatically duplication defects.

### SA-23 — P3 — Retained build output and old worktrees lack a retirement record

Canonical `dist` occupies 25.28 GiB. Four audit-closure worktrees remain registered. They share canonical node_modules by junction, so they do NOT contain four duplicate dependency installations. See storage ledger below.

Record retained artifact purpose and a bounded retention policy. Obtain explicit deletion authorization for concrete paths only after preservation checks. Nothing was deleted during this audit.

### SA-24 — P2 — Strict-citation research accepts an uncited report

`research/synthesizer.ts:104–128` rejects fabricated references but permits a report containing no references. Probe: a report with available source input is accepted with zero cited sources.

Enforce the documented output contract when evidence is supplied, with a clear failure/insufficient-evidence result. Citation presence alone does not establish factual entailment; retain corroboration and substantive review gates.

### SA-25 — P2 — New upstream external-link envelope reports success too early

At remote `673fd1b`, `electron/services/shell-ipc.ts:10–16` accepts a synchronous void opener, while main discards `shell.openExternal`'s promise. Probe: IPC success is returned before a simulated OS open failure rejects.

Await the promise and map rejection to the existing error envelope. This is a September upstream regression, absent from the tested local checkout.

### SA-26 — P2 — New upstream confinement breaks ordinary external file drops

`FileDropZone.tsx:51–67` forwards dropped paths to `files:process`; upstream `files.ts:216–234` now confines those paths to the workspace. A normally dropped file from Downloads is rejected, while the trusted native picker can still process user-selected files. The upstream-source probe confirms rejection before processing.

Keep generic path confinement. Provide a trusted selection mechanism or clear picker fallback for outside-workspace attachments. Test both external attachments and untrusted arbitrary-path IPC rejection.

### SA-27 — P2 — New-branch pre-push checks can silently skip product changes

`scripts/hooks/pre-push:26–35` handles an all-zero remote SHA using the local commit alone as the diff range. On a clean new branch this compares that commit to the working tree and can see no changes. Diff errors are swallowed; whitespace-sensitive argument handling and non-executable hook modes also weaken portability.

Compute a valid pushed-commit comparison for new and existing branches, handle errors visibly, preserve spaced paths and executable modes. Test new branch, deletion, docs-only, mixed changes and unavailable base.

### SA-28 — P2 — Scheduled OpenWiki workflow fails without configured credentials

`.github/workflows/openwiki-update.yml` schedules an authenticated noninteractive job. The current failure explicitly reports `ANTHROPIC_API_KEY is required for non-interactive runs`. A scheduled red job is not documentation maintenance.

Make the default honest and usable without credentials, such as manual-only until configured, with clear setup state. Do not provision a secret or enable paid model runs without user authorization. Do not hand-edit generated wiki output to simulate a successful workflow.

### SA-29 — P3 — Unused transaction helper contradicts its own safety claim

`electron/services/database.ts:444–456` says getDb must initialize or throw, but catches every failure and runs the callback without a transaction. There is no test-only guard. Current source search finds no production callers, so this is a dangerous dormant helper, not evidence of a current transactional write failure through it.

Prefer removing the unused helper and misleading comment. If a real caller needs it, require rollback semantics and propagate DB unavailability; do not preserve a production fallback solely to satisfy mocks.

### SA-30 — P2 — Settings optimistically display changes that failed to persist

`src/stores/settings-store.ts:91–100` updates local state/theme and awaits `settings.set` but ignores a `success: false` envelope and has no rollback. The UI can show a changed setting while the main process retained the old value.

Handle failure envelopes and rejected promises, restore the last acknowledged state/theme, and expose useful failure feedback. Test overlapping updates so an older failed request cannot roll back a newer successful change.

## Rechecks that prevent duplicate or incorrect work

- Remote PR #8 already confined generic process/open paths; retain it and address only SA-08/SA-26 gaps.
- Remote PR #10 added ping/openExternal envelopes; retain the ping improvement and fix promise handling under SA-25.
- An old abort-listener leak allegation is not established by the inspected `{ once: true }` registration. Do not carry it as a confirmed finding.
- Suspicious-looking recent model names are not automatically hallucinations. Spot checks found official documentation for [Claude Fable 5](https://platform.claude.com/docs/en/models/fable-5/introducing-claude-fable-5-and-claude-mythos-5), [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash), [DeepSeek's August vision update](https://api-docs.deepseek.com/news/news260821/) and [Qwen 3.8 Max](https://www.alibabacloud.com/help/en/model-studio/web-search). This is not a full catalog certification.
- OpenRouter's fallback list need not repeat the primary model; [official fallback documentation](https://openrouter.ai/docs/guides/routing/model-fallbacks) does not substantiate that proposed bug.
- A release existing on GitHub does not prove Bucket completed. CDN 403 and missing matching hashes keep that claim open.
- Source-string tests are useful structural guards, but cannot alone prove live UI reachability, native persistence or authorization behavior.
- The earlier August audit/plan remains historical input. This September PSPR supersedes its remediation roster only if approved; no prior unapproved roster is silently marked complete.

Remaining triage candidates, not confirmed findings: fork atomicity, provider retry/abort timing, browser event subscription cleanup, full quit/subagent draining and broader dependency advisory coverage. The PSPR includes a bounded adjudication gate; newly confirmed defects require an explicit roster amendment. Existing parked live R1–R4/provider capability playbooks remain honestly parked unless approved; they cannot stand in for live proof required by these new fixes.

## Reuse and complexity review

Open PRs at audit time:

| PR | Immutable head | Reuse |
|---|---|---|
| [#12](https://github.com/USS-Parks/Lamprey-Harness/pull/12) | `729a30cb02b92dea0927a3afe4097b741935bee3` | AGENTS provider-count correction |
| [#13](https://github.com/USS-Parks/Lamprey-Harness/pull/13) | `1ad3618548af500a01d0358651d69a1cabf32b34` | Native getDb suite execution; still needs SA-16 gate enforcement |
| [#14](https://github.com/USS-Parks/Lamprey-Harness/pull/14) | `2f0856d181cf371186660cd9238c85343e63bd9b` | CLAUDE M9 status correction |

Review against refreshed main before incorporating; none was merged by this audit.

Ranked Ponytail opportunities, conditional on reachability checks:

1. delete: unreachable renderer candidates outside the PR feature — up to 2,087 lines identified by the literal graph, not a preapproved deletion set.
2. delete: unused chat extraction imports and dormant transaction helper — remove misleading surface before inventing abstractions.
3. shrink: route MCP ownership through existing lookup/lifecycle seams instead of maintaining divergent iteration paths.
4. delete: deprecated OpenRouter wrapper and tests whose sole purpose is preserving it, after confirming no supported callers.
5. shrink: environment UI behavior only where equivalence is demonstrated; keep intentional parity-locked types.

Conservative candidate budget excludes unmeasured wrappers/imports and excludes the PR files to reconnect. No dependency removal was established.

net: -2087 lines, -0 deps possible.

## Storage and worktree closeout inventory

All four retained AC worktrees were clean, with no unpublished commits found by the recorded remote comparison. After fetching, each listed HEAD was independently verified as an ancestor of remote main `673fd1b815ac38412d8769627eebae85646e487e` (`git merge-base --is-ancestor`, exit 0). This proves commit preservation on that main SHA, not authorization to remove directories.

| Checkout | Purpose / branch | HEAD | Separate generated data | Retirement blocker |
|---|---|---|---|---|
| Canonical Lamprey Harness | Active audit; main | `39c2c5e` | dist 25.28 GiB; node_modules 1.35 GiB; out 58.57 MiB; coverage 34.56 MiB | Active owner; user planning changes and new audit artifacts; retention decisions pending |
| Lamprey-Harness-AC-Add | Prior audit additions; feat/audit-closure-add | `613dac0` | out 0.47 MiB | Reconfirm no active owner; explicit removal authorization |
| Lamprey-Harness-AC-Delete | Prior audit deletion; feat/audit-closure-delete | `c5a04e4` | out 0.49 MiB | Same |
| Lamprey-Harness-AC-Improve | Prior audit improvements; feat/audit-closure-improve | `4f25618` | out 0.48 MiB | Same |
| Lamprey-Harness-AC-Wrap | Prior audit wrap; feat/audit-closure-wrap | `2ff7aaf` | out 58.56 MiB | Same |

The four node_modules entries are junctions into canonical dependencies and are counted once. Full paths, exact SHAs, byte counts and observed dirty states are in [worktree receipt](evidence/september-audit-worktrees.json). Recheck all states immediately before any later removal. Do not force-delete, prune dirty work, or delete artifacts whose release preservation is uncertain.

## Review decision

Recommended sequence: reconcile upstream and reuse existing work, make verification trustworthy, repair authority/data paths, restore user-visible behavior, remove proven debris, then validate and publish. The companion PSPR defines independently approvable milestones and explicit release/cleanup boundaries. The audit is complete as a bounded review; remediation, live acceptance and Bucket are not complete.

The user subsequently approved the full STS roster and Bucket, including per-prompt commits and pushes to main. The original audit evidence above remains a historical baseline.

## Post-baseline findings from execution

**SA-31 — Packaged plugin skill and slash-command contributions fail to load.** The SR-18 real Electron production-bundle smoke reported `Cannot find module './plugin-loader'` from both loaders. Their relative CommonJS requires survived bundling without a corresponding runtime file. This defeats plugin contribution scans and enable/disable subscriptions even though module-level unit tests pass. SR-18A replaces those requires with bundle-resolved imports and verifies a bundled plugin through actual renderer IPC. This is an addition to the original 30-finding baseline.

**SR-14 verification correction:** manager-level shutdown tests passed, but the real application smoke exposed a `will-quit` stall when asynchronous teardown began directly inside the event. SR-18 schedules that drain with `setImmediate`; the production fixture then emitted both quit passes and exited normally. Source-level and manager-only evidence did not prove application shutdown.

**SA-32 — Both environment Commit controls call unsupported `window.prompt`.** SR-29's real production Electron probe returns `prompt() is not supported.` Both handlers therefore fail before collecting a commit message. They also leave busy state stuck on rejected IPC. The bounded SR-29 repair shares their equivalent commit/push behavior, uses an in-app commit-message dialog, preserves drafts on failure, and binds the operation to the displayed repository path. Real Electron commits and pushes to a temporary local bare remote passed from both floating and docked surfaces, including cancellation and failed-hook retry. No hosted repository was used by this acceptance test.

## SR-32 execution reconciliation

The full ledger now contains 40 numbered findings. SA-31/32 were discovered during live acceptance; SA-33 through SA-40 are documented with original source evidence in [SR-31 adjudication](evidence/SR31_ADJUDICATION.md). Each row below links its completed source-repair receipt. Final source certification (SR-34), release serialization (SR-35), Bucket (SR-37) and published closeout (SR-38) remain open at this checkpoint.

| Added finding | Repair | Evidence |
|---|---|---|
| SA-33: fork creation lacks atomicity and reliable cleanup | SR-31A | Native rollback and cleanup-failure tests; [receipt](evidence/sr31a.json) |
| SA-34: provider retry delays cancellation | SR-31B | Actual HTTP failure/backoff cancellation; [receipt](evidence/sr31b.json) |
| SA-35: browser lifecycle and listener ownership | SR-31C | Chrome race fixture and real Electron view visibility; [receipt](evidence/sr31c.json) |
| SA-36: quit does not drain normal turns/subagents | SR-31D | SQLite inspected after real shutdown, before restart recovery; [receipt](evidence/sr31d.json) |
| SA-37: startup/model persistence can use the wrong model | SR-31E | Delayed/rejected startup, keyless local setup and actual local provider; [receipt](evidence/sr31e.json) |
| SA-38: recursive supported tool-schema subset is not enforced | SR-31F | Invalid calls never reach real stdio receiver; [receipt](evidence/sr31f.json) |
| SA-39: workflow status and provider runner are unwired | SR-31G | Palette launch, status navigation and local provider completion; [receipt](evidence/sr31g.json) |
| SA-40: vulnerable dependency graph | SR-31H | Zero npm advisories after repairs, real image/archive and native DB checks; [receipt](evidence/sr31h.json) |

SR-31I additionally removes a confirmed redundant Git invocation and handles environment refresh failures with stale-state disclosure, retry, request ordering and lifecycle cleanup. Both production environment surfaces passed real temporary Git commit/push acceptance; [receipt](evidence/sr31i.json).

Current local baseline: 3,007 default tests passed, 174 skipped; all 169 dedicated native database tests in 21 files executed with zero skips. The default suite is not a substitute for that native gate. Production builds and focused real Electron acceptance have run during remediation. A Windows hosted PowerShell AST test intermittently returns uninspectable; CI run 33984062387 failed on that assertion. Final hosted acceptance remains pending, not green by inference from local tests.

PR #12's provider-count correction is reused after checking the 33-provider parity test and registry. PR #14's CJP-WRAP correction is reused against CJ26_AFTER's COMPLETE ledger. PR #13's native-DB work was reused in SR-01 and hardened in SR-02. These are content reuse records, not claims that the original PRs were merged. Historical provider counts and original audit receipts remain intact.

Package metadata now points to the canonical Lamprey-Harness repository. README credential storage copy now distinguishes local safeStorage encryption from consented plaintext fallback. The installed/downloaded release remains v0.31.0 at this checkpoint; source repairs are not yet an installer release. TL-W4 stays open without final GitHub/local/CDN byte proof. Existing parked provider/playbook gates and unsigned-build non-goal remain explicit. User-owned planning files are preserved.

Authored and reviewed by Basho Parks, copyright 2026
