# Lamprey September remediation — canonical PSPR draft

Status: APPROVED FOR FULL STS AND BUCKET on 5 September 2026. Execution started in this session. Original draft retained in Git history; checked rows below reflect verified execution.

Authorization addendum, 5 September 2026: the user explicitly directed commit and push to the main repository after each completed prompt. Push each gated commit to `origin/main`; this supersedes any earlier hold-until-wrap publication default. Full STS and Bucket remain approved in this session.

Source report: [September re-audit](LAMPREY_SEPTEMBER_2026_REAUDIT.md). Evidence: [receipt index](evidence/SEPTEMBER_AUDIT_EVIDENCE.md).

## Governance

**Initiative:** repair the confirmed defects and misleading assurances identified by the September whole-repository audit, remove demonstrably unused code, and produce an honestly verified release.

**Authoritative repository:** `C:\Users\17076\Documents\Claude\Lamprey Harness`, [USS-Parks/Lamprey-Harness](https://github.com/USS-Parks/Lamprey-Harness). Local tested HEAD `39c2c5ef6a4bba116d21fc9c3da9a8427bb8ca5b`; fetched main `673fd1b815ac38412d8769627eebae85646e487e`. Refresh before implementation; do not implement against stale local main and later overwrite upstream fixes.

**Settled stack:** existing Electron, React 19, TypeScript, electron-vite, SQLite, provider registry and MCP infrastructure. Single-agent product remains the default. No framework migration, new control plane or replacement architecture.

**Authorization:** drafting this PSPR is not authorization to run it. Begin only after `run it STS` or approval of specific prompts/milestones. Source execution authorization covers only its stated scope. External publication/Bucket and destructive cleanup require explicit authorization; an authorization already given for those actions remains valid and should not be requested again. Stop at an unapproved boundary. Do not treat the request for this draft as permission to fix product code immediately.

**Execution defaults:** one sequential lane in the canonical checkout, proposed branch `codex/september-2026-remediation`; no new worktree. One focused prompt per commit. Preserve the user's modified `PLANNING/README.md`, three existing untracked planning documents and all unrelated files. Do not stash, overwrite, clean or commit them indiscriminately. Reconcile the index with its existing text only within approved documentation scope.

**Source-of-truth history:** the prior August audit and OA draft remain historical records. Approval of this PSPR supersedes their overlapping unexecuted recommendations, not their historical facts. Existing shipped rosters stay shipped; unverifiable release claims receive append-only corrections. The September report remains an immutable baseline plus dated corrections if new evidence changes it.

**Prerequisites/blockers:** usable native SQLite test environment; ability to run isolated stdio MCP fixture; interactive Electron acceptance for UI/confinement; remote CI access. GitHub release/CDN credentials and matching final artifact hashes are needed only for publication. Current CDN requests returned 403; no Bucket completion claim is permitted until resolved. Missing live proof blocks the relevant prompt unless the user explicitly re-scopes it.

**Exclusions:** new product features beyond restoring already advertised behavior; broad model-catalog refresh; new provider credentials; automatic paid research/wiki runs; destructive production DB experiments; global dependency upgrades without a confirmed reason; signing/notarization work outside current release policy; reactivating parked R1–R4/provider capability playbooks without approval. No guessed model-authorship blame.

## Verification gates — apply before marking any prompt complete

1. **Baseline integrity:** record branch, exact HEAD, remote main, dirty paths and incoming upstream/PR deltas. Preserve user-owned work. If refreshed source already fixes a finding, demonstrate its gate and record a justified no-op instead of duplicating code.
2. **Focused correctness:** reproduce the reported failure, make the smallest repair at the existing seam, and prove the corrected behavior. Prefer behavioral tests over source-string assertions. Do not create tests that merely repeat the implementation or add unnecessary tests for cosmetic deletion.
3. **Source checks:** both actual TypeScript projects and lint pass for product prompts. Once SR-03 repairs `typecheck`, use that command. Run affected existing suites; full suites at milestone boundaries where cross-component interactions justify them. Do not rerun identical broad checks without a reason.
4. **Native proof:** after SR-02, required native suites must execute and pass. Missing binding, required skipped suites, or a runner that reports zero meaningful coverage is a failure. Record explicit optional skips separately.
5. **Authority and data proof:** cancellation/MCP require a real isolated server/process exercise; restore/compaction require real temporary SQLite files and injected failures; confinement requires real filesystem links/junctions. Mocks supplement this evidence. No production user files or credentials are needed for those fixtures.
6. **UI proof:** affected surfaces must be exercised through the actual application entry point, including keyboard/error flows. Source imports or screenshots alone do not establish behavior. Schedule foreground interaction with the user when necessary; do not seize input unexpectedly.
7. **Evidence closeout:** DEVLOG entry names prompt ID, objective, changed files, exact check outcomes, limitations and resulting commit SHA. A commit cannot be called complete before its gate passes. Where the commit SHA cannot be recorded inside itself, append it in the next ledger update/final closeout; never leave an unresolved “pending” entry and call the milestone closed.
8. **Final source acceptance:** full Vitest, honest native suite, both TypeScript projects, lint, build and existing `verify:proof` all pass on the final release candidate. Review all skips. Run relevant end-to-end smokes and confirm hosted CI/build on the exact pushed candidate. Local success is not hosted evidence.
9. **Publication acceptance:** tag/commit/version agree; all artifact producers finish; final hashes agree across the authoritative build, GitHub release and CDN; update manifests/installers agree; install/launch and update metadata are smoke-tested. Release existence, asset size, or an early hash before later uploads is insufficient.

An observed failure stays open. Do not weaken the test or mark a live gate complete with a mock. An explicit user deferral is recorded as a deferral and changes the release scope honestly.

## Reuse ledger

| Item | Classification | Required handling |
|---|---|---|
| Upstream confinement PR #8 and IPC envelope PR #10 | Reuse | Reconcile before repair; preserve useful fixes and address only residual regressions |
| PR #13 at `1ad3618548af500a01d0358651d69a1cabf32b34` | Reuse + extension | Review native-suite enablement; add missing fail-on-required-skip contract |
| PR #12 at `729a30cb02b92dea0927a3afe4097b741935bee3` | Reuse | Provider-count documentation correction; verify current count |
| PR #14 at `2f0856d181cf371186660cd9238c85343e63bd9b` | Reuse | M9 status correction; verify current history |
| `atomic-json.ts`, SQLite transactions, existing path guard | Extension | Repair persistence/authority using existing primitives |
| `findServer`, tool registry/schema validator, dispatch loop | Implementation at existing seam | Consolidate lookups and enforce validation/cancellation |
| Existing app resize cleanup and bridge availability checks | Reuse | Apply to Sidebar and API-key modal |
| Existing PR panel and children | Reconnection | Restore reachable product behavior, not a second PR UI |
| Environment handlers | Possible extraction | Only if duplication and matching semantics are proven |
| Native fixture assertions and final release hash manifest | Small new work | Add only missing proof needed for acceptance |

Open PRs are inputs, not blanket merge authorization. Review their immutable diff; incorporate within approved source scope without creating duplicate fixes. If separately merging a PR would publish changes outside that scope, stop at that boundary.

## Ordered prompt roster

Every box begins unchecked. Dependencies are sequential unless explicitly stated. Each row is one objective with a concrete acceptance gate. IDs remain stable if scope is amended.

### Milestone A — Trustworthy baseline and verification

Independently approvable result: current source reconciled and advertised checks prove actual coverage.

| Status / ID | Focused objective | Acceptance gate |
|---|---|---|
| [x] SR-00 | Reconcile canonical checkout with refreshed remote main and preserve user planning work | Record exact source/remote SHAs and dirty manifest; inspect incoming deltas; preserve all owned files; refresh findings affected by upstream; no duplicate worktree |
| [x] SR-01 | Reuse/review PR #13 to make required getDb suites execute | Required affected suites execute against a real isolated SQLite DB; tests verify behavior, not an unconditional fallback; document adopted PR SHA |
| [x] SR-02 | Make native verification fail when required proof is skipped (SA-16) | Healthy native run executes required suites; intentionally unavailable binding/required skips cause nonzero exit; classify or replace RAG placeholders; no false-green coverage claim |
| [x] SR-03 | Repair the public typecheck command (SA-20) | Both actual projects pass; a temporary type error in either project makes the command fail; fixtures removed |
| [x] SR-04 | Repair pre-push range and hook execution behavior (SA-27) | Temporary Git repositories cover clean new branch, existing branch, deletion, docs-only, mixed/spaced paths, unavailable base; errors do not silently skip checks; executable modes correct |

### Milestone B — Tool authority and data integrity

Usable cut: core dispatch and local persistence respect their contracts. Depends on A. No claim of complete release readiness yet.

| Status / ID | Focused objective | Acceptance gate |
|---|---|---|
| [x] SR-05 | Stop post-cancellation tool scheduling and stale settlement (SA-01) | Isolated real MCP/tool process: abort during first operation prevents second from starting; replacement turn retains ownership; pending non-cancellable call handled honestly; no false rollback claim |
| [x] SR-06 | Fail closed on missing tool descriptors (SA-02) | Unknown names rejected before MCP; real registered fixture works; plan-mode mutation and approval bypass attempts denied; valid read tools remain usable |
| [x] SR-07 | Validate meta-tool argument structure at ingress (SA-15) | null/array/primitive/malformed args return structured errors without dispatch; legitimate search/unlock round trip works |
| [x] SR-08 | Preserve MCP configuration on read/write failures (SA-04) | Temporary malformed/unreadable config retained byte-for-byte; absent config initializes; atomic replacement fault does not destroy prior usable config |
| [x] SR-09 | Make manual compaction atomic and snapshot-safe (SA-05) | Real DB: message arriving during summary retained or replacement safely refused; insertion failure rolls back; successful result preserves intended history |
| [x] SR-10 | Make backup restore validated and recoverable (SA-06) | Real temporary DB: invalid/unauthorized source causes no live moves; copy/move/reopen failures preserve recoverable original; sidecars coherent; successful reopen/integrity check |
| [x] SR-11 | Preserve complete tool groups during compression (SA-07) | Actual selection plus native persistence tests cover multi-result blocks, pending blocks and budget boundaries; no orphan result/call after compaction |
| [x] SR-12 | Close link/junction escapes in workspace confinement (SA-08) | Real Windows junction/symlink fixtures reject external targets, permit legitimate workspace reads, handle nonexistent/error paths; generic untrusted IPC cannot escape |
| [x] SR-13 | Remove the dormant misleading transaction fallback (SA-29) | Reconfirm no supported callers; delete helper/comment, or if a caller is established require real rollback/fail-closed proof; no mock-driven production bypass |

### Milestone C — MCP, providers and research behavior

Depends on B. Result: existing integration features use consistent registration and output contracts.

| Status / ID | Focused objective | Acceptance gate |
|---|---|---|
| [x] SR-14 | Unify plugin MCP lifecycle lookup and teardown (SA-03) | Real stdio plugin: discover/call/reconnect/disable/re-enable/uninstall/quit; authorization completion resolves correct owner; processes and subscriptions drain once |
| [x] SR-15 | Preserve property names during schema normalization (SA-09) | Keyword-like field names survive; true unsupported keywords transformed only in schema positions; nested/required/provider tests pass |
| [x] SR-16 | Make missing provider identity an explicit error (SA-10) | Removing custom endpoint cannot dispatch to DeepSeek/another host; picker and dispatch agree; stale IDs and collisions handled visibly; local HTTP capture fixture proves selected destination |
| [x] SR-17 | Enforce evidence-backed research output contract (SA-24) | Provided sources plus zero references rejected or produce explicit insufficient-evidence outcome; valid references accepted; fabricated references still rejected; no claim that syntax proves truth |
| [x] SR-18 | Await external-link completion in IPC (SA-25) | Promise rejection returns failure envelope with no unhandled rejection; success waits for completion; packaged valid link smoke performed |
| [x] SR-18A | Repair packaged plugin skill and slash-command subscriptions (post-baseline SA-31) | Production Electron bundle loads plugin contributions and responds to enable/disable without unresolved relative requires; existing loader suites pass |

5 September execution addendum: SR-18's production Electron smoke exposed unresolved `require('./plugin-loader')` calls in the skill and slash-command loaders. SR-18A is a focused repair within the approved whole-repository audit scope, before the UI milestone. The same smoke exposed a quit stall in SR-14's new asynchronous teardown; its small `setImmediate` scheduling correction is bundled with SR-18 because both changes are verified by that live acceptance run.

### Milestone D — User-visible reliability

Depends on C. Result: repaired existing surfaces are reachable and usable.

| Status / ID | Focused objective | Acceptance gate |
|---|---|---|
| [x] SR-19 | Restore safe outside-workspace attachment flow (SA-26) | Actual drop of external file gets trusted supported import or clear picker fallback; picker attaches it successfully; forged generic path IPC remains denied |
| [x] SR-20 | Make settings navigation scrollable and keyboard accessible (SA-11) | All tabs reached at supported minimum/default sizes; dialog focus contained/returned; close labeled; light/dark and keyboard smoke |
| [x] SR-21 | Correct modal-first Escape behavior and shortcut labels (SA-13) | With modal+stream active Escape dismisses modal without aborting turn; next intended cancellation works; labels match implemented shortcuts |
| [x] SR-22 | Handle API-key modal bridge failures (SA-14) | Browser without bridge, rejected IPC, failure envelope and packaged success show usable states without unhandled promises |
| [x] SR-23 | Make settings reflect acknowledged persistence (SA-30) | Failure envelope/rejection restores acknowledged values/theme and displays error; overlapping requests cannot roll newer success backward |
| [x] SR-24 | Reconnect the existing pull-request panel (SA-17) | User navigates from app entry to panel; fixture repository supports list/diff/checks; approval-sensitive comment submission tested without sending unsolicited messages; structural test alone insufficient |
| [x] SR-25 | Narrow hot store subscriptions (SA-12) | Streaming profiler/counters show unrelated Sidebar/settings/picker renders reduced; selected state changes still update correctly; no new state layer |
| [x] SR-26 | Clean up Sidebar resize lifecycle (SA-21) | Mouse release, lost focus and unmount during drag remove listeners/reset cursor; resizing still works |

### Milestone E — Honest maintenance and final audit closure

Depends on D. Result: dead-code candidates adjudicated and source claims match evidence.

| Status / ID | Focused objective | Acceptance gate |
|---|---|---|
| [x] SR-27 | Remove proven renderer dead code excluding restored PR surface (SA-22) | Resolve all 20 candidate files against entry points/dynamic imports; delete only proven unused code; app build/navigation smoke; record actual LOC removed, not promised 2,087 |
| [x] SR-28 | Remove extraction leftovers and obsolete service wrapper (SA-22) | Recheck 49 advisory diagnostics, remove unused imports/obsolete wrapper as justified; intended exports and parity contracts retained; affected suites/typechecks pass |
| [x] SR-29 | Adjudicate near-duplicate environment handlers (SA-22) | Record actual overlap/error semantics; extract only a small proven common seam or document no-op; both surfaces retain behavior |
| [x] SR-30 | Make OpenWiki workflow configuration honest (SA-28) | Missing credentials no longer trigger scheduled doomed runs; manual/setup state clear; authenticated path remains available only when configured; no secret creation or paid run without authorization |
| [x] SR-31 | Adjudicate remaining audit candidates before scope freeze | Inspect fork atomicity, retry/abort, browser subscriptions, quit/subagent drain and dependency advisories; each receives source-backed disposition; confirmed new defects become reviewed roster addenda, not silent extra implementation |
| [x] SR-31A | Make historical fork persistence atomic (SA-33) | Native DB failure injection and worktree failure accounting; no partial child |
| [x] SR-31B | Cancel provider retry waits promptly (SA-34) | Local HTTP retry/backoff cancellation settles promptly with no additional request |
| [x] SR-31C | Repair browser subscription and async lifecycle (SA-35) | Unmount/tab-switch/rejection fixtures and real Electron visibility proof |
| [x] SR-31D | Drain regular turns and subagents before database close (SA-36) | Real Electron active-stream/subagent shutdown proof with bounded timeout accounting |
| [x] SR-31E | Gate startup and model selection on acknowledged state (SA-37) | Delayed/rejected startup and selection recovery; keyless local setup remains usable |
| [x] SR-31F | Enforce the documented recursive tool-schema subset (SA-38) | Recursive negative cases and live dispatch non-invocation proof |
| [x] SR-31G | Restore workflow status navigation and existing runner wiring (SA-39) | Rendered status click opens the existing palette; production workflow IPC runs against a local fixture provider |
| [x] SR-31H | Remediate dependency advisories with reachability evidence (SA-40) | Compatible updates, lock/native/build checks and current advisory dispositions |
| [x] SR-31I | Remove redundant review work and handle environment refresh errors | Existing boundary checks, rejected refresh recovery and lifecycle cleanup |
| [x] SR-32 | Reconcile documentation and verification claims (SA-19) | Review/reuse PR #12/#14; current count/status/source/installer claims cite receipts; historical corrections explicit; prior user planning text preserved; TL-W4 stays open without publication proof |
| [x] SR-33 | Produce bounded storage/retirement manifest (SA-23) | Recheck dirty/unpublished state, exact remote ancestry and bytes; enumerate removable artifacts/worktrees and retention purposes; no deletion without explicit authorization; keep shared junction semantics clear |
| [x] SR-34A | Stabilize Windows process-test scheduling before acceptance | Same full suite and coverage floors pass with one Windows worker; parser assertion exposes failure reason; no product timeout or fail-closed weakening; hosted outcome assessed in SR-34 |
| [ ] SR-34 | Run final source acceptance and close the finding ledger | Gate 8 passes on exact candidate; all SA IDs linked to repair or explicit approved disposition; rerun source probes at final source; no P1 silently deferred; DEVLOG/commits/skip ledger reconciled |

Milestone E approval does not by itself authorize deletion of the four worktrees or old dist artifacts. After SR-33, any cleanup request must identify exact paths and preservation evidence. If authorized, recheck immediately, remove only the listed retired worktrees/artifacts, prune metadata and record reclaimed bytes. If not authorized, retain and disclose cleanup debt.

### Milestone F — Publication preparation and Bucket

SR-35 is a source repair. SR-36 is a reviewable release candidate. SR-37 requires explicit publication authorization and SR-38 records actual published evidence. If the user approves STS plus Bucket together, that authorization persists; do not ask again merely because the roster reaches F.

| Status / ID | Focused objective | Acceptance gate |
|---|---|---|
| [ ] SR-35 | Serialize release producers and verify final artifacts (SA-18) | Isolated/dry-run fixture reproduces late overwrite and proves final verification catches it; no early asset-presence shortcut; manifest binds source/version/assets; no external upload needed for source test |
| [ ] SR-36 | Prepare final release candidate for review | Proposed version 0.32.0 checked for availability/conflicts; changelog accurate; source gates rerun for release-script/version changes as needed; exact candidate SHA and reviewed artifact manifest; no publication yet |
| [ ] SR-37 | Publish authorized source/tag and run Bucket | Exact remote SHA verified; current hosted CI/build pass; all producers completed; final GitHub/CDN bytes hash-match manifest; install/launch/update-metadata smoke; inaccessible CDN or mismatched bytes blocks completion |
| [ ] SR-38 | Close published release and storage ledger | DEVLOG/plan/release body reflect actual receipts; TL-W4 historical status corrected only with relevant evidence; current release recorded separately; worktrees' owner/dirty/unpublished/size/blocker inventory current; clean scoped source state and all preserved user files accounted for |

If SR-35 changes shared build/verification behavior, rerun affected SR-34 gates before SR-36; SR-34 is not a permanent certificate for later changes. Failed Bucket must produce an honest partial-publication recovery record, not a fabricated completion.

## Finding-to-prompt map

| Finding | Prompt(s) | Finding | Prompt(s) |
|---|---|---|---|
| SA-01 | SR-05 | SA-16 | SR-01, SR-02 |
| SA-02 | SR-06 | SA-17 | SR-24 |
| SA-03 | SR-14 | SA-18 | SR-35, SR-37 |
| SA-04 | SR-08 | SA-19 | SR-32, SR-38 |
| SA-05 | SR-09 | SA-20 | SR-03 |
| SA-06 | SR-10 | SA-21 | SR-26 |
| SA-07 | SR-11 | SA-22 | SR-27, SR-28, SR-29 |
| SA-08 | SR-12 | SA-23 | SR-33, SR-38 |
| SA-09 | SR-15 | SA-24 | SR-17 |
| SA-10 | SR-16 | SA-25 | SR-18 |
| SA-11 | SR-20 | SA-26 | SR-19 |
| SA-12 | SR-25 | SA-27 | SR-04 |
| SA-13 | SR-21 | SA-28 | SR-30 |
| SA-14 | SR-22 | SA-29 | SR-13 |
| SA-15 | SR-07 | SA-30 | SR-23 |
| SA-31 | SR-18A | SA-32 | SR-29 |
| SA-33 | SR-31A | SA-34 | SR-31B |
| SA-35 | SR-31C | SA-36 | SR-31D |
| SA-37 | SR-31E | SA-38 | SR-31F |
| SA-39 | SR-31G | SA-40 | SR-31H |

## Defaults, overrides and completion

- Proposed release 0.32.0 is a planning default, not a reserved tag. Confirm at SR-36.
- Fail closed for unknown tool/provider identities; preserve invalid user configuration and the current database on failure.
- Reuse existing panels and APIs; remove dead code only after proving reachability status. No arbitrary line-removal quota.
- Tests may use local fixtures without paid credentials. Hosted-provider capability claims still require their own live evidence.
- The user may approve A alone, A–B, A–E, or the whole roster including F. Later milestones depend on earlier gates; a usable cut is not final release completion.
- Additional defects discovered during STS are recorded with evidence and a focused proposed prompt. Do not expand into an unreviewed broad rewrite.
- Cleanup requires its own explicit concrete authorization. If retained, disclose purpose and size at closeout; never hide storage debt.

Final completion means all approved prompts have passing gates and commit-linked ledger entries; all 40 numbered findings and SR-31I maintenance candidates have evidence-backed dispositions; final source and live acceptance limitations are explicit; publication, if approved, has matching final hashes and exact remote SHA; user files are preserved; retained worktree/build-output debt is disclosed. “Tests pass,” “release exists,” or “plan written” alone cannot satisfy those criteria.

Full STS and Bucket authorized by the user on 5 September 2026. Per-prompt receipts under `PLANNING/evidence/sr*.json` record checks and commit SHAs. Destructive cleanup remains subject to the explicit path-specific approval rule.

SR-29 scope adjudication: the two environment Git handlers are equivalent apart from missing-bridge error copy. Live Electron confirms both invoke unsupported `window.prompt` (SA-32). The focused repair at this existing seam is one shared action hook and commit-message dialog, with try/finally cleanup and repository binding. Acceptance covers cancel, failed commit with retained draft, retry, real commit and push to a temporary local bare remote from both surfaces. This is part of the approved audit/remediation scope, not a new Git feature or a redesign of either environment surface.

Authored and reviewed by Basho Parks, copyright 2026
