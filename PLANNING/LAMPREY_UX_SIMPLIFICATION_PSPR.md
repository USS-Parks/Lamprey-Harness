# Lamprey UX simplification and Codex interaction parity — PSPR

**Status: APPROVED FOR FULL STS AND BUCKET AS v0.33.0 on 2026-09-05.**

Drafted 2026-09-05. Revision 1, with authorization addendum. Roster: **UX-00–UX-39**, 40 sequential prompts across eight independently approvable milestones. Checked boxes require completed verification; approval alone does not check a box.

## Controlling authorization addendum — 2026-09-05

The user explicitly rejected the added review stop and directed: "I already authorized STS of all 40 ... prompts" and "Run the ... prompt roster stem to ... stern. Now."

Execute UX-00 through UX-39 sequentially through verified v0.33.0 Bucket and humanized GitHub release notes. The additional owner design/visual-review stop points are waived; do not request STS or release authorization again. Use the prepared design and perform the required technical, behavioral and visual checks directly. Do not claim the owner personally performed those checks. Existing text describing a future owner approval stop is historical and superseded by this addendum. All source, live-system, regression, release-integrity and exact-SHA hosted verification gates remain mandatory. Preserve unrelated user work.

## 0. Governance

### Goal

Make Lamprey simpler to navigate, easier to steer, and faster to inspect by centering the interface on tasks, conversation, and the work being produced, while preserving its existing capabilities and authority boundaries.

### Authority, source and release baseline

- Canonical checkout: `C:\Users\17076\Documents\Claude\Lamprey Harness`.
- Repository: [USS-Parks/Lamprey-Harness](https://github.com/USS-Parks/Lamprey-Harness).
- Observed local HEAD and remote main: `bc78ec984205695480568b5e2a7097b676265a52`; local branch `codex/september-2026-remediation`. These were checked when drafting; refresh at UX-00.
- Published baseline: **v0.32.0**, producer `33990174600`. The [published manifest](evidence/ux-simplification/UX00_RELEASE_BASELINE.json) records all six matching local/GitHub/CDN artifacts. [Package acceptance](evidence/ux-simplification/UX00_PACKAGE_BASELINE.json) records actual Windows portable execution, renderer IPC, embedding worker and vector retrieval. It does not prove NSIS wizard installation or macOS/Linux GUI use.
- Local user-facing installer: `dist/Lamprey-0.32.0-x64.exe`, verified against that manifest. Future release placement must retain this directly discoverable, versioned convention.
- Project authority: current user instructions, repository governance, this plan after approval, source, behavioral evidence and DEVLOG. A historical plan's status line cannot override fresher evidence.
- The September remediation PSPR still has unrecorded publication closeout and paused website work. Its publication succeeded, but this draft does not mark its remaining rows complete, resume website changes, or silently supersede its ledger. Reconcile the handoff explicitly at UX-00.
- The July parity PSPR remains historical implementation evidence; M4/Code Mode remains parked. Existing Steering/Queue implementations are reused, not reopened as greenfield work.

### Authorization and stop points

The original request authorized drafting only. On 2026-09-05 the user explicitly approved full STS and Bucket as **v0.33.0**, including humanized GitHub release notes. Source execution, prompt commits/pushes and that release publication are now authorized. Website work remains outside this plan. The design checkpoint below has not been waived.

After approval, execute only the approved prompts/milestones in dependency order. Full STS approval enables the source roster subject to the following visible boundaries:

1. **Design checkpoint after UX-02:** present the idle, running and reviewing mockups and their interaction notes. Wait for design approval before UX-03 unless the user explicitly approves proceeding without a second design review. This is a proposed governance checkpoint, not approval inferred from this document.
2. **Publication checkpoint before UX-38:** authorization for v0.33.0 Bucket and humanized GitHub release notes was supplied on 2026-09-05. Verify release readiness and proceed without requesting that permission again. The completed v0.32.0 authorization is not the basis for this new release.
3. Destructive cleanup and unapproved scope additions require their own authorization. Routine choices inside approved prompts do not require repeated permission.

Once source execution is approved, retain the user's existing instruction to commit and push each completed prompt to the main repository, unless that approval changes the destination. Respect branch protection; use a focused PR when required. Do not bypass checks or force-push. Draft review is not an execution prompt and does not itself trigger that commit/push rule.

### Stack and execution lane

Reuse Electron, React 19, TypeScript, electron-vite, Zustand, the typed preload/IPC bridge, SQLite, existing provider dispatch and current panel implementations. No framework migration, replacement agent runtime or new always-on pipeline.

Use the canonical checkout sequentially. Proposed source branch after approved handoff: `codex/ux-simplification`; creating it is not part of drafting. Inventory existing branches and dirty work before switching. No new worktree or duplicate dependency tree is needed. No parallel agent lanes are planned.

At draft time four older audit worktrees are registered: `Lamprey-Harness-AC-Add`, `-AC-Delete`, `-AC-Improve`, and `-AC-Wrap`. Their current ownership, dirty state, unpublished commits and generated sizes must be refreshed at UX-00 and closeout. Do not remove them or caches without authorization.

Preserve all existing dirty/untracked files, especially the three user planning documents, the pending September-plan addendum, Bucket receipts/helpers, and existing `dist` artifacts. Do not blanket-stage, stash, reset, clean or absorb these into UX commits.

### Scope

- Shell and workspace navigation: `src/App.tsx`, `src/stores/ui-store.ts`, layout components, right-panel state, tools/panels, artifact/environment surfaces.
- Composer, model/mode controls, follow-ups, attachments, status, tool history and approval presentation.
- Task sidebar, sessions, attention filtering, search, command palette and keyboard dispatch.
- Settings navigation/search, current provider connections and existing extension management entry points.
- Shared visual tokens, responsive behavior, accessibility and measured renderer performance.
- Existing acceptance fixtures extended for the new flows; source checks, documentation and an independently authorized release.

### Exclusions

New speech recognition, cloud execution, browser-account import, WebMCP, multi-repository projects, account synchronization, model-catalog expansion, plugin marketplaces, or a new automation engine. Hide the nonfunctional microphone rather than implement voice in this phase. No Monaco/Code Mode revival or new arbitrary inline source editor. Review continuity uses current diff/review/comment capabilities. No backend authority simplification disguised as UX work. No signing/notarization project. No islandmountain.io edits or resumption of its paused download-page proposal.

### Prerequisites and blockers

Usable existing dependency/runtime environment, isolated Electron profiles, native SQLite fixtures, a controlled local streaming/tool fixture, temporary Git repositories, and GitHub access for published checkpoints. Owner visual review is required at the design checkpoint. Missing real evidence blocks the affected gate; only an explicit user deferral can change acceptance. Paid provider access is unnecessary for the core UX contract; do not spend credentials merely to render a fixture.

## 1. Design baseline and settled defaults

The source currently exposes eleven `RightPanelHome` cards and twenty-four settings sections. `ChatInput` has separate permission/coding controls, two running follow-up buttons, a context-chip row and a nonfunctional microphone. The shell also contains status, floating environment, plan, agent and queue surfaces. This is an inventory, not proof that every element is simultaneously visible or that rendering is slow.

The target shell has one task sidebar, one conversation column and an optional workspace panel. The terminal docks below the conversation/workspace area. Routine work should not require a launcher dashboard. Project/branch/environment context has one compact primary location. The model and permission state remain discoverable without opening diagnostics.

| Decision | Default | Explicit override or constraint |
|---|---|---|
| Main workspace | Conversation first; side and bottom panels closed for a new task | Restore the user's last valid layout for an existing task |
| Workspace content | Contextual tabs for files, artifacts, review and browser | Explicit opens focus content; incidental agent output never steals focus |
| Terminal | Bottom dock; existing shell choices retained | Hiding is not terminating; explicit session termination retains current semantics |
| Composer | Text, attachment action, compact model selector and compact mode/access controls | Permission state cannot be hidden behind an ambiguous generic mode label |
| Running input | One labeled preferred action with an accessible alternate-action menu, plus Stop | Preserve saved Steer/Queue preference; no silent change to Enter semantics |
| Working mode | Plan/coding choices may share a compact popover | Permission, plan and coding states remain orthogonal; switching one cannot change another |
| Activity | One current-task status row and one task-attention destination | Errors, pending approvals and data-integrity warnings remain visible until resolved |
| Navigation | Projects, pinned tasks, recent tasks and attention filter | One underlying task identity; retain all existing archive/search/fork paths |
| Settings | Six searchable top-level groups | Existing leaf IDs remain accepted for deep links and internal callers |
| Visuals | Existing Lamprey identity, quieter surfaces and consistent icons | Preserve supported themes, text scaling, reduced motion and accessible focus |
| Release version | Approved **v0.33.0** | Recheck tag/version availability at UX-37; do not overwrite a published version |

### Capability relocation map

Every existing launcher needs a tested destination before its old route is removed.

| Existing destination | Proposed primary access |
|---|---|
| Files | Workspace file-tree control and command menu; file links open file tabs |
| Side chat | Task/message action and command menu; preserve original lineage semantics |
| Browser | Workspace add-tab menu, URL links and browser shortcut |
| Artifacts | Inline artifact links opening workspace tabs; artifact list remains searchable |
| Terminal | Bottom dock toggle and terminal shortcut |
| Review | Task header change count and Review command; existing local/PR review routes |
| Plan | Compact task plan/progress disclosure; opens the existing plan detail/gate |
| Background tasks | Activity detail with existing live-process controls |
| After action | Task diagnostics from status/error details and command menu |
| Loops | Activity/Automations destination with existing pause/stop/backlog controls |
| Agents | Activity detail and command menu with existing grants/spend/revoke/kill controls |
| Environment | Compact project/branch context popover; existing full details remain reachable |
| Sources | Attachment/source action in conversation and command menu |
| Memory, Library, extensions | Composer/context commands or Settings/Customize, preserving current capabilities |

### Complete settings relocation map

This is navigation regrouping. Existing values, defaults, storage keys, validation and policy are unchanged.

| Existing settings leaf ID | New top-level group / destination |
|---|---|
| `general` | General / startup and ordinary preferences |
| `automations` | General / Automations, also reachable from the sidebar |
| `appearance` | Appearance |
| `models` | Models & Connections / Models |
| `api` | Models & Connections / API Keys |
| `github` | Models & Connections / GitHub |
| `webTools` | Tools & Extensions / Web Tools |
| `currentInfo` | Tools & Extensions / Current Info |
| `imageGen` | Tools & Extensions / Image Generation |
| `tools` | Tools & Extensions / Tools |
| `library` | Tools & Extensions / Library |
| `rag` | Tools & Extensions / Knowledge Search (RAG) |
| `permissions` | Permissions |
| `agenticCoding` | Advanced / Coding Behavior; current-task control remains in composer |
| `planGoal` | Advanced / Plans & Goals; current plan remains reachable in-task |
| `hooks` | Advanced / Hooks |
| `loops` | Advanced / Loops; operational controls also reachable from Activity |
| `orchestration` | Advanced / Orchestration; operational controls also reachable from Activity |
| `snip` | Advanced / Output Filtering (Snip) |
| `timeouts` | Advanced / Timeouts |
| `seedBudget` | Advanced / Context Budgets |
| `reasoning` | Advanced / Reasoning Audit |
| `persistence` | Advanced / Storage & Recovery |
| `activity` | Advanced / Activity History, distinct from the task-attention filter |

Search aliases retain the old names. Customize remains the existing management implementation; Tools & Extensions links to it instead of duplicating its forms. A logical settings group does not grant permission or enable a tool.

## 2. Verification gates, defined before execution

### G0 — Source and ownership

Record exact HEAD/main/branch, dirty and untracked paths, ownership, registered worktrees and generated sizes. Compare against the v0.32.0 baseline. Preserve unresolved work. Verify incoming changes before reuse. Planning or historical evidence is not current test evidence.

### G1 — Focused source correctness

For product prompts: `npm run typecheck`, `npm run lint`, and the affected behavioral suites. Use `npx vitest run <actual affected test paths>` after resolving paths in UX-00/03; record exact expanded commands in receipts. Documentation/cosmetic changes need proportionate checks, not new tests that mirror markup. Hooks remain enabled. If a shared type or runtime seam changes, include its consumers and existing regression suites.

### G2 — Actual UI behavior

Exercise the changed flow through the real production renderer, preload and main process in an isolated Electron profile, reusing `scripts/acceptance/electron-fixture.cjs` and current fixtures. Use actual filesystem/Git/process behavior where relevant. DOM-only mocks and screenshots cannot prove IPC routing, persistence, lifecycle or policy. Keep external fixtures deterministic and local. Suppress foreground/focus and global-shortcut capture for automated fixtures; owner review can use a separate isolated visible instance at the agreed checkpoint.

Required UI states: idle, running, queued, awaiting approval, failed, cancelled and completed; empty/loading/error content; task switch while running; reload; panel close/reopen; keyboard-only interaction; narrow window; text scaling. Test the subset affected by each prompt and the whole contract at milestones.

### G3 — Preserved authority and data

Real controlled streaming/tool runs verify Steer modifies the intended active turn, Queue remains durable, Stop does not become queue deletion, duplicate submissions are prevented, and stale turn IDs are rejected. Retain ordered mixed attachments and recoverable drafts. Use temporary SQLite/project fixtures for persistence. Real blocked/mutating tool fixtures verify plan/permission/approval rules and stale approval rejection. Simplifying chrome must never broaden access, hide the required decision, or synthesize completion.

### G4 — Usability and accessibility

Manual/automated acceptance at 1440×900, 1024×768 and 800×600, plus a supported larger window, light/dark themes, 100%/150%/200% text or UI scale, and reduced motion. Below the supported minimum, define graceful reflow rather than clipping essential controls. No page-wide horizontal overflow; code/diff content may scroll within its own region. Provide visible focus, accessible names, predictable tab order, Escape behavior, restored focus, screen-reader state announcements without token-by-token chatter, and no color-only status. Target WCAG AA text contrast and at least 24×24 CSS-pixel interactive targets with adequate spacing; ordinary primary controls target 32 pixels or larger.

### G5 — Measured responsiveness

Measure perceived clutter separately from renderer latency. Use one recorded machine/runtime/build and reusable fixtures: 1,000 messages, 200 completed tool entries, one streaming turn, 50 sidebar tasks, and ten open workspace resources. Capture five repeat runs after warm-up; retain per-run p50/p95 and fixture provenance. Initial acceptance targets: typing-to-paint p95 ≤100 ms; warm task switch p95 ≤250 ms; cached panel opening p95 ≤300 ms; expensive loads show feedback within 100 ms. Fixture streaming must not repeatedly produce main-thread tasks exceeding 100 ms or pull a scrolled-up reader to the bottom.

Compare on the same hardware against UX-00. No measured interaction may regress by more than 10% without explicit review; both the relative and absolute limits apply. If the baseline or environment makes a target inappropriate, propose a documented adjustment before accepting the result, not after failing it. Ten open/close/task-switch cycles must leave no accumulating duplicate subscriptions, browser instances or abandoned terminal processes; user-requested live terminals are not leaks. Optimization must follow a measured bottleneck. Do not add virtualization or caching speculatively.

### G6 — Milestone and final source checks

At integrated milestone boundaries run the relevant end-to-end scenarios and broader suites justified by shared changes. At the final candidate run `npm test`, `npm run test:native-db`, `npm run verify:all`, and G2–G5. `verify:all` already builds and requires proof/smokes; do not duplicate those checks gratuitously. Audit all skipped tests and zero-test results. The old 3,007/default and 170/native counts are baseline evidence, not required future totals or automatic current proof. Any changes to chat authority also run `npm run verify:proof -- --no-tests` during the focused prompt.

### G7 — Commit, hosted CI and evidence

One focused prompt per commit; a justified no-op still gets an explicit evidence disposition. Every receipt records ID, objective, changed paths, commands, results, screenshots/traces where relevant, limitations, source SHA and commit lookup. DEVLOG records each prompt and links its receipt. Use the next ledger entry or deterministic commit lookup for its own commit SHA; do not create a self-referential dirty loop. Suggested receipt directory: `PLANNING/evidence/ux-simplification/`, created only during approved execution.

After authorized push, verify remote SHA and exact hosted checks before calling the prompt remotely complete. Fix failures within the current prompt; do not batch later prompts over a red result. Where branch protection applies, close the focused PR and record its merge SHA. Use the established attribution footer: `Authored and reviewed by Basho Parks, copyright 2026`. No AI co-author trailer.

### G8 — Release and storage

Only the authorized Bucket producer may supply release artifacts. Require matching package/lock/tag/source, completed exact-tag builds, all six final local/GitHub/CDN hashes, updater metadata, real package acceptance and accurate platform limitations. Put the versioned Windows installer directly in `dist` and verify its hash there; a nested Bucket folder alone fails this gate. If conventional unversioned files are updated, preserve or account for older local artifacts and keep installer, blockmap and updater metadata consistent. No unnecessary reinstall of the user's working app.

At each milestone and final closeout list retained worktrees with purpose, dirty state, unpublished commits, approximate generated size and retirement blocker. Account for newly generated benchmark/profile/package folders. Prefer bounded temporary fixtures; clean only disposable artifacts owned by those fixtures. Existing worktree/cache/artifact deletion remains separately authorized.

## 3. Reuse ledger

| Seam | Classification | Intended use |
|---|---|---|
| `App.tsx`, `ui-store.ts`, `right-panel-state` | Extend | Single shell layout and task-scoped workspace state |
| `ToolsPanel`, existing `tools/panels/*` | Extract then reuse | Host present implementations in contextual tabs/dock |
| `ArtifactPanel`, workspace artifacts/sources, file-open requests | Extend at existing seam | Consistent direct open/focus behavior |
| `BrowserPanel`, existing browser lifecycle fixtures | Reuse + extend | Retain real browser sessions with correct task ownership |
| `TerminalPanel`, existing shell IPC | Reuse + extend | Bottom placement without a replacement terminal backend |
| `ReviewPanel`, current GitHub/PR review path | Reuse + extend | Preserve local and PR review/comment workflow |
| `ChatInput`, `FollowUpQueue`, turn-store/IPC | Extract presentation only | Compact controls over the existing durable operations |
| `FloatingEnvironmentCard`, `EnvironmentPanel`, context chips | Extract + consolidate | One compact context view retaining actual Git actions |
| `StreamStatusLine`, banners, activity stores/components | Extend existing selectors | One status summary and one attention presentation |
| `Sidebar`, `SessionsSidebar`, search and project stores | Reuse + consolidate | One task navigation model, not a second task database |
| `QuickOpenPalette`, `WorkflowPalette`, slash palette | Extend | Reuse search/selection and actions in one app command entry |
| `useKeyboardShortcuts` and menu/keyboard handlers | Consolidate | Context-aware dispatch and consistent visible hints |
| `SettingsDialog` and its 24 existing leaf components | Regroup | Searchable navigation with compatible existing IDs |
| Shared styles, theme tokens and icons | Extend + prune duplicates | Consistent density without rebranding |
| Current Electron, browser, PR, environment, package fixtures | Extend | Actual integration gates and repeatable usability/performance evidence |
| Small resource-tab descriptors and command metadata | New only where absent | Presentation state/action metadata; no new control plane |

## 4. Milestones and sequence

All prompts depend on the prior prompt unless explicitly approved otherwise. A milestone may be approved independently only after its prerequisites pass. Each milestone ends with its acceptance and storage note in the last prompt's receipt.

| Milestone | Prompts | Usable result / gate |
|---|---|---|
| A — Baseline and design | UX-00–03 | Measured baseline, complete relocation contracts, approved three-state design and runnable acceptance fixture |
| B — Workspace | UX-04–10 | Direct tabs/dock open actual work; all old tool destinations remain reachable |
| C — Composer | UX-11–16 | Compact input with intact modes, model selection, attachments, Steering, Queue and Stop |
| D — Activity | UX-17–20 | One current status and attention route with visible failures/approvals |
| E — Navigation and commands | UX-21–26 | Unified task navigation, search and predictable keyboard commands |
| F — Settings | UX-27–29 | All 24 sections accessible through six searchable groups and compatible links |
| G — Visual and performance finish | UX-30–34 | Consistent visual system, responsive/a11y pass and measured performance targets |
| H — Acceptance and release | UX-35–39 | Whole-workflow proof, authorized release, directly discoverable installer and complete ledgers |

## 5. Granular sequential prompt roster

### Milestone A — Baseline and design

#### UX-00 — Record the source, ownership and UX baseline
- [x] **Objective:** establish the exact starting point before any product edit.
- **Work:** refresh HEAD/main and dirty inventory; reconcile the paused September handoff without resuming its website scope; record worktree/storage facts. Capture the existing three UI states and G5 timings with the same fixture inputs intended for later comparisons.
- **Seams/output:** current shell and acceptance tools; planned `UX_BASELINE.md`, source/ownership manifest and baseline timings under the evidence directory.
- **Gate:** G0; screenshots identify build/theme/viewport; latency is measured rather than inferred; v0.32.0 publication and remaining documentation debt are distinguished. No unrelated file changes.

#### UX-01 — Freeze capability destinations and interaction contracts
- [x] **Objective:** make simplification lossless at the behavior level.
- **Work:** validate every row in both relocation maps against current source; inventory all callers/shortcuts/deep links. Specify task identity, tab close versus resource stop, queue/steer/stop, permission and plan/coding distinctions, review commenting, draft recovery and focus ownership. Record exact before/after action paths.
- **Seams/output:** `ui-store`, `ToolsPanel`, `ChatInput`, Sidebar, settings/shortcut handlers; `UX_CONTRACTS.md` with a source-to-destination matrix and named behavioral scenarios.
- **Gate:** every existing ToolId and all 24 settings leaves map to a reachable destination; every preserved operation has an acceptance scenario; no authority/default changes hidden in presentation wording.

#### UX-02 — Produce and review the three-state design
- [x] **Objective:** settle the actual interface before implementation.
- **Work:** create linked mockups for idle task, running task and reviewing changes using current Lamprey identity. Include the compact composer, tab panel, bottom terminal, task sidebar, attention/filter entry and six-group settings view. Annotate queue menu, permissions, empty/error states, focus order and narrow-window reflow.
- **Seams/output:** project-local `PLANNING/UX_SIMPLIFICATION_DESIGN/` only; prototype is visibly a mockup and cannot execute tools or read user data.
- **Gate:** user can compare all three states at desktop and narrow widths; every UX-01 destination is accounted for; record explicit design approval or revision. **Stop here at the design checkpoint unless waived by the user.**

#### UX-03 — Establish the reusable interaction acceptance fixture
- [x] **Objective:** run the agreed behavior scenarios against real Lamprey.
- **Work:** extend existing isolated Electron fixtures with deterministic task/history data, controlled local streaming/tool calls and temporary Git/file resources. Add reusable keyboard, focus, layout and timing capture only where current helpers lack it.
- **Seams/output:** `scripts/acceptance/electron-fixture.cjs` and existing acceptance helpers; one reusable UX runner and scenario manifest.
- **Gate:** G1/G2; baseline app runs representative idle/running/review cases; fixture failure causes nonzero exit; profile isolation proven; temporary resources are bounded and disposed. No production credential use or framework replacement.

### Milestone B — Workspace

#### UX-04 — Introduce task-scoped workspace tab state
- [x] **Objective:** represent open workspace resources without duplicating their underlying data.
- **Work:** extend current UI state with resource identity, kind, owning task/project, active tab and layout preferences. Dedupe repeated opens; preserve user tab order; validate reload data and migrate legacy selection without resetting valid settings.
- **Seams/output:** `src/stores/ui-store.ts`, existing right-panel state, a small typed resource descriptor only if required.
- **Gate:** G1 plus state tests for repeated opens, identical filenames in different projects, task switching, close/reopen, corrupt persisted state and safe legacy migration. No credentials or entire file contents persisted in tab metadata.

#### UX-05 — Host contextual tabs in the shell
- [x] **Objective:** make the optional side panel display the selected work directly.
- **Work:** integrate the tab strip, add-tab menu, panel toggle, resizing and empty state into App. Keep user collapse/focus preferences; explicit open actions focus content, incidental events do not. Route old open requests through the same host.
- **Seams/output:** `App.tsx`, `Titlebar.tsx`, `ToolsPanel.tsx`, UI state.
- **Gate:** G1/G2; task switching preserves the correct tabs; tab close restores sensible focus; collapse/expand and resize work; empty/invalid resource recovery is visible. Existing functional panel routes remain available until replaced.

#### UX-06 — Route file and artifact links directly into tabs
- [x] **Objective:** remove the extra navigation step between conversation output and its content.
- **Work:** reuse file previews, artifact viewers and existing open-file requests; route file:line references, artifacts and source links to the correct tab. Preserve browser-versus-file distinctions and sandbox boundaries.
- **Seams/output:** FilesPanel, ArtifactPanel, workspace artifacts/sources and current message-link handlers.
- **Gate:** G1/G2 with real temporary files; existing file, missing/deleted file, duplicate basename, line jump, generated artifact and denied external path all behave correctly. Artifact links do not bypass existing sandbox/IPC rules.

#### UX-07 — Preserve browser lifecycle in contextual tabs
- [x] **Objective:** move browser access without losing page state or leaking browser instances.
- **Work:** host the existing BrowserPanel/session model through resource tabs; preserve history/address state and normal permissions. Define closing the outer tab versus closing an actual browser session using the existing lifecycle contract.
- **Seams/output:** BrowserPanel, browser store/IPC integration and `scripts/acceptance/browser-lifecycle.cjs`.
- **Gate:** G1/G2 using a real local HTTP fixture; navigation, back/forward, reload, task switch, hide/show and close work; ten lifecycle cycles do not accumulate windows/subscriptions. No cross-task page exposure or permission bypass.

#### UX-08 — Dock the existing terminal below the workspace
- [x] **Objective:** provide a predictable bottom terminal without changing execution semantics.
- **Work:** move TerminalPanel into a resizable bottom dock; retain shell selection, working directory, terminal state, copy/paste and existing process controls. Keep the process alive when merely hidden; never duplicate it during rerender.
- **Seams/output:** App shell, TerminalPanel, existing shell IPC and layout state.
- **Gate:** G1/G2 with a real disposable shell; output continues while hidden, reopening shows prior output, explicit termination works, task/path selection is correct, keyboard input reaches the terminal, and closing the app leaves no fixture process orphan.

#### UX-09 — Keep review and follow-up in the current task
- [x] **Objective:** make change inspection and actionable feedback one continuous flow.
- **Work:** task header change count opens the existing local/PR ReviewPanel directly. Preserve changed-file selection, diffs, staging controls and existing line/comment-to-composer behavior. Review follow-ups return to the owning task with clear file/line context.
- **Seams/output:** ReviewPanel and existing PR integration, message/composer context handlers; current PR acceptance fixture.
- **Gate:** G1/G2 with a real temporary Git repo and controlled PR fixture; clean/dirty/no-repo/loading/error states work; feedback targets the selected file/task; staging uses existing authority; no unauthorized remote write or parked Code Mode implementation.

#### UX-10 — Retire the redundant launcher menu
- [x] **Objective:** complete the workspace migration with every old capability reachable.
- **Work:** replace RightPanelHome's eleven cards with the approved compact entry points. Provide intermediate menu/task-detail routes for Plan, Background, After action, Loops, Agents and Side chat until the unified activity milestone lands. Remove only obsolete launcher presentation and redundant toolbar controls.
- **Seams/output:** RightPanelHome, SecondaryToolbar, ToolsPanel and current tool routing.
- **Gate:** G1/G2; walk the full UX-01 ToolId map, including Environment/Sources; no dead routes, orphan buttons or unreachable capabilities. Milestone B passes direct-open, lifecycle and focus scenarios; include storage/ownership closeout.

### Milestone C — Composer

#### UX-11 — Reduce the composer's default visual hierarchy
- [x] **Objective:** make writing the prompt the dominant action.
- **Work:** implement approved input spacing and compact attachment/model/mode/access placement. Reuse draft, attachment and paste behavior. Group plan/coding controls in the approved popover while displaying permission state clearly and independently.
- **Seams/output:** ChatInput and existing mode/permission controls; presentation extraction only where needed.
- **Gate:** G1/G2; text, multiline paste, IME composition, attachments, plan state, coding state and all permission modes remain correct. Changing presentation or mode never escalates permissions or clears a draft.

#### UX-12 — Compact Steering and Queue without changing semantics
- [x] **Objective:** use one preferred follow-up action and an alternate menu while retaining both operations.
- **Work:** replace equal-weight follow-up buttons with a labeled primary action/menu and separate Stop. Retain current saved preference, keyboard semantics, expectedTurnId, client message identity and ordered mixed input. Show rejection/recovery clearly.
- **Seams/output:** ChatInput, FollowUpQueue, existing typed turn IPC/store.
- **Gate:** G1/G2/G3; real active-turn steer, durable queue, edit/reorder/delete/send-now, double-submit, stale turn, cancellation, failed IPC, unreadable attachment and reload recovery all pass. No fallback to a fresh chat send; menu navigation never submits accidentally.

#### UX-13 — Consolidate project and environment context
- [x] **Objective:** show the active project, location and branch once with a reliable details popover.
- **Work:** reuse the floating Environment card's real handlers and context-chip state in the compact location. Preserve project selection, worktree/branch actions, reveal/copy path and plan detail access. Remove the floating duplicate only after mapping every action.
- **Seams/output:** FloatingEnvironmentCard, EnvironmentPanel, ContextChipRow, environment stores/fixtures.
- **Gate:** G1/G2 using real temporary Git operations; external branch changes refresh, failed actions are visible, task switch updates context, and no dirty work is discarded. The conversation no longer shifts to accommodate a floating context card.

#### UX-14 — Make model choice compact and searchable
- [x] **Objective:** select the actual provider/model with minimal navigation.
- **Work:** reuse current model/provider resolution and connection state in the compact picker. Add search if absent, reveal the selected row, and make ready-to-use models easy to identify while keeping the full catalog accessible. Preserve direct-provider defaults and the existing key-setup path.
- **Seams/output:** ModelDropdown and model/provider stores; existing API-key modal.
- **Gate:** G1/G2; local/keyless and configured-provider selection, missing-key setup, search/empty results, long labels, keyboard selection and externally refreshed key state work. A display label never changes provider routing or advertises unproven capabilities.

#### UX-15 — Remove inactive controls and redundant composer hints
- [x] **Objective:** ensure every visible composer affordance does something useful now.
- **Work:** hide the nonfunctional voice button; consolidate duplicate mode/help text and remove obsolete visual assets/imports only when unused. Keep documented keyboard/help discovery in an accessible menu. Do not implement voice or delete future-facing source artifacts merely to reduce file count.
- **Seams/output:** ChatInput, composer styles/help labels and demonstrably unused imports.
- **Gate:** G1 and UI inspection; no visible click target ends in a coming-soon toast; all retained controls have names and real outcomes; layout remains coherent with/without attachments and while running.

#### UX-16 — Accept the integrated composer workflow
- [x] **Objective:** prove the whole composer remains usable across task transitions.
- **Work:** execute the shared acceptance scenarios on the compact composer, including draft ownership, attachment errors, active task switching, follow-up preference, Stop and approval interruptions.
- **Seams/output:** existing acceptance runner; composer milestone receipt and before/after screenshots.
- **Gate:** G2/G3/G4 for the affected controls; stable focus and readable input at narrow widths and 200% scale; no lost/duplicated messages or hidden Stop. Record measured navigation reduction against UX-00 and storage closeout; fix regressions before accepting C.

### Milestone D — Activity

#### UX-17 — Derive one honest current-task status
- [x] **Objective:** communicate running, waiting, failed, cancelled and completed state in one primary row.
- **Work:** consolidate current status selectors/presentation from existing turn and activity stores. Give waiting-for-approval and failures appropriate precedence; provide concise live operation text and elapsed activity when available. Keep plan/progress details expandable.
- **Seams/output:** StreamStatusLine, AgentRunBanner, TokenTicker, StatusLine and existing state selectors.
- **Gate:** G1/G2; controlled transitions and stale events cannot produce false success, false idle or another task's status. Loading/unknown state stays explicit. Token/context/spend diagnostics remain accessible without duplicating routine chrome.

#### UX-18 — Consolidate expandable tool history and diagnostics
- [x] **Objective:** retain inspectability without flooding the conversation with completed machinery.
- **Work:** group completed tool activity behind compact summaries; preserve order, full result access, running entries, failure details, After action and reasoning records. Preserve deliberate user expansion and scroll position during streaming.
- **Seams/output:** MessageList, existing tool cards/activity chips, AfterActionPanel and diagnostic components.
- **Gate:** G1/G2; real mixed tool success/failure/approval sequence remains ordered and inspectable; all content is recoverable; expanding one group does not jump the reader or collapse their selection; summaries do not hide an outstanding decision.

#### UX-19 — Create one task-attention destination
- [x] **Objective:** bring work needing the user's response into one list.
- **Work:** adapt existing ActivityDashboard/Tray and task stores to show actionable approvals, failed work and unread completions with clear filters. Link Background/Loops/Agents operations to existing details rather than a second scheduler or task system.
- **Seams/output:** activity components and current task/loop/agent stores; sidebar attention entry.
- **Gate:** G1/G2; simultaneous task events dedupe by real identity, counts agree with details, selecting an item opens its owner, resolved approvals disappear correctly, and reading a failure does not mark it resolved. Existing loop/agent controls remain reachable.

#### UX-20 — Consolidate notifications while preserving required decisions
- [x] **Objective:** eliminate duplicate notices without weakening approvals or recovery warnings.
- **Work:** give each event one primary presentation and a retained history/detail route. Reuse approval routing and queues; render task-local approvals inline where appropriate, retaining modal handling where context/authority requires it. Do not hide security/integrity failures as routine status.
- **Seams/output:** App approval queue, inline approvals, AsyncEventToast, notices and security/integrity banners.
- **Gate:** G1/G2/G3; multiple concurrent real fixture approvals remain visible, keyboard handling targets only the focused request, stale/expired requests cannot grant access, and one event does not create repeated toasts. Milestone D passes failure/attention/approval scenarios and storage closeout.

### Milestone E — Navigation and commands

#### UX-21 — Reconcile task and session navigation data
- [x] **Objective:** give the sidebar one consistent task identity and grouping model.
- **Work:** map current conversation/session/project records into existing shared selectors. Preserve lineage, project membership, ordering, unread state, archive state and running ownership; do not introduce another database of tasks.
- **Seams/output:** Sidebar, SessionsSidebar, chat/project/session stores and existing persistence.
- **Gate:** G1 plus actual temporary-profile persistence where changed; the same task never appears as unrelated duplicate records, legacy sessions remain discoverable, and reload retains project/task relationships.

#### UX-22 — Render the simplified task sidebar
- [x] **Objective:** make projects, pins, recents and attention the primary navigation.
- **Work:** implement the approved hierarchy over UX-21 selectors; fold Sessions into the normal task list, retain New task/Search, and move Customize/Automations/Settings to compact stable access. Put worktree management under project actions.
- **Seams/output:** Sidebar, project rows and current task actions.
- **Gate:** G1/G2; new/select/rename/pin/unpin/archive/unarchive/fork/project selection remain reachable; focused tasks are revealed; keyboard and pointer paths work; empty and long project names are legible. No conversation deletion substituted for archive.

#### UX-23 — Preserve task search, ordering and navigation history
- [x] **Objective:** make finding and returning to work reliable after sidebar consolidation.
- **Work:** adapt existing search/filters and back/forward navigation to the unified list. Retain historical search coverage, persisted pins/order and appropriate archived-task search. Prevent overlapping searches or task switches from showing stale results.
- **Seams/output:** SessionsSidebar, SessionSearchBar, current search IPC/store and navigation history.
- **Gate:** G1/G2 with real seeded task history; recent/archived/project/filter searches, reload, back/forward, deleted-target recovery and fast query changes behave consistently without losing drafts or changing running task ownership.

#### UX-24 — Consolidate app command metadata
- [x] **Objective:** define existing app actions once for menus, search and shortcuts.
- **Work:** inventory action IDs, labels, availability, handlers and shortcut ownership. Reuse workflow/file commands and existing handlers; create only the thin metadata needed for unified discovery. Include all relocated rare tools/settings and current workflow commands.
- **Seams/output:** QuickOpenPalette, WorkflowPalette, shortcut hooks and menu action definitions.
- **Gate:** G1; duplicate IDs/conflicting bindings are detected; unavailable actions are disabled/explained; commands invoke existing permission-aware paths; metadata cannot execute arbitrary shell text or bypass a required confirmation.

#### UX-25 — Implement the unified command menu
- [ ] **Objective:** make infrequent actions discoverable without persistent buttons.
- **Work:** extend the current palette with searchable commands, tasks, files and settings, clearly labeled by kind and scoped to the current project. Keep file quick-open's direct shortcut; integrate workflow entries rather than losing the old Ctrl+K capability.
- **Seams/output:** existing palettes, UX-24 command metadata and current file/task search.
- **Gate:** G1/G2; keyboard search/select/Escape, no-results/loading/error and project switching work; selection opens the intended task/file/action; dangerous actions retain existing decisions; all UX-01 destinations can be found by familiar names.

#### UX-26 — Align keyboard behavior and visible shortcut hints
- [ ] **Objective:** provide predictable Codex-like Windows navigation without input conflicts.
- **Work:** align supported defaults: Ctrl+K/Ctrl+Shift+P command menu, Ctrl+P files, Ctrl+B sidebar, Ctrl+J bottom panel, Ctrl+backtick terminal, Ctrl+Shift+G review, Ctrl+, settings, Ctrl+N new task. Resolve current conflicts explicitly, including Ctrl+Shift+M Memory versus proposed model selection; retain Memory through a documented alternate. Update hints/help from the same metadata. Keep user overrides if already supported; no new general keybinding editor is required.
- **Seams/output:** useKeyboardShortcuts, relevant renderer/menu/preload handlers and shortcut help.
- **Gate:** G1/G2/G4; editor/terminal/browser inputs and IME keep their local shortcuts; highest-priority dialog handles Escape; no double execution, accidental send or approval; help matches actual behavior. Milestone E passes keyboard-only start/find/steer/review flow and storage closeout.

### Milestone F — Settings

#### UX-27 — Regroup all settings into six sections
- [ ] **Objective:** replace the flat 24-section navigation while retaining every leaf.
- **Work:** implement the complete settings map in section 1 with searchable-friendly labels and logical subheadings. Reuse existing leaf components and values; place Customize entry points under Tools & Extensions without duplicating forms.
- **Seams/output:** SettingsDialog and leaf navigation metadata; existing Customize route.
- **Gate:** G1/G2; all 24 old IDs open the correct new location; old settingsInitialTab callers still work; existing values/validation/save behavior remain intact; no reset or policy change occurs on opening or switching groups.

#### UX-28 — Add settings search with old-name aliases
- [ ] **Objective:** find a setting by the terminology users already know.
- **Work:** search labels, descriptions and explicit aliases such as RAG, Snip, Seed Budget and Reasoning Audit. Results lead to the relevant control/section with focus and context; distinguish operational Activity from diagnostic history.
- **Seams/output:** settings navigation metadata and existing settings content; lightweight search UI.
- **Gate:** G1/G2/G4; every old section is discoverable, no-results/reset/back behavior works, results open and focus correct content, and search never indexes API keys or private values.

#### UX-29 — Reconcile contextual settings links and onboarding
- [ ] **Objective:** make setup and in-task configuration use the same settings destinations.
- **Work:** route missing-key/model setup, permissions, context budgets, tools, automations and recovery links through the grouped navigation. Preserve local/keyless startup and existing unsaved-change behavior; expose Advanced on demand without presenting its entire contents at startup.
- **Seams/output:** settings callers, ApiKeyModal, Customize, model/composer/status links and first-run entry.
- **Gate:** G1/G2; fresh cloud-key and local-provider setup, existing configured profile, unavailable credential storage and invalid settings recovery remain usable. Milestone F verifies all leaf routes and records storage closeout.

### Milestone G — Visual and performance finish

#### UX-30 — Unify shell typography, colors and surfaces
- [ ] **Objective:** apply one restrained visual vocabulary to the redesigned shell.
- **Work:** reuse theme tokens for text hierarchy, borders, panel background, focus and spacing. Reduce repeated card borders/shadows and uppercase microtext; retain Lamprey branding and supported theme presets.
- **Seams/output:** `src/styles` and touched shell/chat/navigation components.
- **Gate:** G1 and G4 visual/contrast inspection; light/dark presets remain legible, task content is visually primary, no hardcoded theme-breaking colors or hidden focus indicators. No screenshot-only tests for incidental pixel positions.

#### UX-31 — Normalize control density and motion
- [ ] **Objective:** make buttons, icons, tabs and menus consistent without sacrificing targets.
- **Work:** standardize control heights, icon sizing, radii and menu spacing through existing styles; remove redundant hover scaling/glow and unnecessary layout animation. Keep brand artwork where meaningful and functional glyphs consistent. Remove only proven-unused presentation code.
- **Seams/output:** shared controls plus redesigned toolbar/composer/sidebar/settings.
- **Gate:** G1/G4; readable labels, adequate hit targets, stable alignment and reduced-motion behavior; no layout jump when status changes, attachments appear or a panel opens; no inactive/placeholder control reintroduced.

#### UX-32 — Complete responsive and accessibility behavior
- [ ] **Objective:** make the new shell fully operable at constrained sizes and with assistive input.
- **Work:** fix issues across the G4 matrix: panel reflow/drawer behavior, bottom dock bounds, menu placement, text scaling, tab order, focus restoration and screen-reader announcements. Side/bottom panels must not make the composer or Stop unreachable.
- **Seams/output:** affected shell/palette/settings/dialog components and existing accessibility helpers.
- **Gate:** full G4 on actual app; keyboard-only three-state workflow passes; 200% scale and minimum supported window retain essential controls; status announced once per meaningful transition. Record manual assistive-technology checks separately from automated accessibility scans.

#### UX-33 — Measure the integrated UX against baseline
- [ ] **Objective:** identify whether perceived simplification also improved interaction latency.
- **Work:** rerun the exact G5 fixture and five-run measurements, compare UX-00 timings and record traces for missed targets. Measure task switch, composer typing, tab opening, streaming/scrolling and resource lifecycle independently.
- **Seams/output:** existing acceptance/performance helper and `UX_PERFORMANCE_BEFORE_AFTER.md`.
- **Gate:** measurement provenance is reproducible, no confounding provider/network latency is called renderer time, and every failed threshold identifies an actionable trace. This prompt completes the measurement only; failed performance remains open for UX-34.

#### UX-34 — Resolve measured responsiveness regressions
- [ ] **Objective:** meet G5 by fixing the observed bottlenecks with the smallest changes.
- **Work:** use traces to narrow subscriptions, batch stream presentation, defer hidden work or bound expensive rendering only where justified. If no performance target fails, record a justified no-op. Reuse current performance patterns; avoid new caches or virtualization without evidence.
- **Seams/output:** only components/stores identified in UX-33 and the existing runner.
- **Gate:** G1/G2 and all G5 absolute/relative targets pass; correctness, scroll anchoring, focus, searching and accessible history remain intact. If a fix needs a backend/architecture change outside scope, record a blocker and request a scoped addendum. Milestone G includes storage closeout.

### Milestone H — Acceptance and release

#### UX-35 — Accept the complete daily-work workflow
- [ ] **Objective:** prove the redesigned surfaces work together in real use.
- **Work:** run a complete task: choose project/model, attach file, start controlled coding work, inspect live status, steer, queue/edit/reorder, approve an action, open file/browser/terminal, review a real diff, add contextual feedback, handle failure/cancel, find another task and return after reload. Exercise a second active task to check ownership.
- **Seams/output:** existing extended acceptance fixtures and a concise owner walkthrough recording.
- **Gate:** G2/G3/G4/G5; owner evaluates the approved three-state design in the working application. Every capability/settings relocation row is checked. No lost drafts, duplicated turns, inaccessible decisions or altered permission defaults. Source/runtime limitations are explicit.

#### UX-36 — Certify the final source candidate
- [ ] **Objective:** establish a single source candidate with complete regression evidence.
- **Work:** run G6 on the integrated tree, reconcile skips and original authority/data regression coverage, remove only owned disposable fixture remnants, and resolve all blocking acceptance defects before versioning.
- **Seams/output:** existing test/build/proof scripts, final source receipt and defect/disposition ledger.
- **Gate:** full default/native suites, type checks, lint, build/proof/smokes and required UI/performance scenarios pass; exact pushed SHA has green required hosted checks under G7. No unexplained skips or unverified package claims.

#### UX-37 — Prepare release metadata and accurate documentation
- [ ] **Objective:** produce a reviewable release candidate that accurately describes the new UX.
- **Work:** confirm the proposed next version is unused, update package/lock together, author notes in the established Lamprey release style, and update README, relevant OpenWiki pages, AGENTS/CLAUDE current-state references and shortcut/help documentation. Draft the GitHub blurb if needed; keep website work parked.
- **Seams/output:** versioned release notes, current docs, candidate receipt; tag remains uncreated until authorized publication.
- **Gate:** versions agree, links/commands/shortcuts are valid, no claims of complete current-Codex feature parity, and retired UI wording is reconciled. Build final versioned candidate; exact candidate CI/build checks pass. Documentation records capabilities retained and known platform limitations.

#### UX-38 — Publish the authorized release and place it in dist
- [ ] **Objective:** deliver verified binaries from the exact accepted source.
- **Work:** after explicit release authorization, use the existing Bucket workflow, completed tag producer and hash manifest. Run actual final package acceptance plus the new shell smoke against the packaged renderer. Place `Lamprey-<version>-x64.exe` directly in the repository's `dist` root and verify its ProductVersion and SHA-256 there.
- **Seams/output:** `scripts/bucket.ps1`/`bucket.cjs`, package acceptance helpers, source-bound manifest and directly visible installer.
- **Gate:** G8; all six artifacts and updater metadata match final source/tag/version and final GitHub/CDN bytes; package smoke passes; root-dist installer matches manifest. No producer race, partial publication passed as success, stale generic download pointed to as the new version, or implied NSIS/macOS/Linux GUI proof.

#### UX-39 — Close the UX roster and publish the final evidence
- [ ] **Objective:** leave an auditable release and an honest workspace handoff.
- **Work:** reconcile all prompt receipts/commit SHAs, DEVLOG, plan statuses, final acceptance and retained limitations. Record worktree/storage inventories and the status of earlier paused September/site work without silently resuming it. Commit only scoped closeout files and push through normal checks.
- **Seams/output:** final UX report, receipt index, this PSPR's execution history and documentation closeout.
- **Gate:** all approved prompts have verified dispositions; exact final main SHA and required GitHub checks are green; tag remains bound to its tested release source with any later docs-only delta disclosed. Report directly visible installer path, manifest, source/release URLs, preserved dirty files and each retained worktree's purpose/state/unpublished work/size/blocker. Completion does not imply deletion authorization or an absence of all possible defects.

## 6. Suggestion coverage and acceptance ledger

| Proposed improvement | Roster coverage | Required proof |
|---|---|---|
| Contextual workspace tabs and bottom terminal | UX-04–10 | Direct-open paths, actual process/browser/Git lifecycle and complete tool relocation |
| Compact composer with preserved Steering/Queue | UX-11–16 | Actual turn targeting, durable queue, mixed input, permission invariants and recovery |
| Consolidated status, history, attention and notifications | UX-17–20 | Honest transitions, discoverable diagnostics and required decisions never hidden |
| Unified projects/pins/recents/tasks | UX-21–23 | Real task identity, search, reload and navigation ownership |
| Command menu and familiar keyboard operation | UX-24–26 | Existing workflows retained, no binding conflicts, every rare action discoverable |
| Six searchable settings groups | UX-27–29 | All 24 leaf IDs and legacy callers preserved; secrets excluded from search |
| Quieter visuals and inactive-control removal | UX-15, UX-30–32 | Three-state visual review, accessible targets, scaling and reduced motion |
| Measure clutter separately from actual lag | UX-00, UX-33–34 | Reproducible before/after timings and bounded resource lifecycles |
| Review changes and continue in the same task | UX-09, UX-12, UX-35 | Diff/context feedback and follow-up retain the owning task |
| Three concrete mockups before implementation | UX-02 | Explicit design checkpoint |
| Verified source, release and easy-to-find local download | UX-35–39 | Hosted/source/package evidence, final hashes and root-dist versioned installer |

### Completion criteria

The phase is complete only when the approved roster, design decisions, relocation matrices, G0–G8 gates and source/publish receipts agree. If release authorization is withheld, report **source complete, publication pending** rather than marking UX-38/39 or the entire initiative complete. An explicitly deferred platform gate must be named in release notes and closeout. No checkbox is satisfied solely by an earlier version's tests, static markup assertions, a screenshot, a passing build, or a successful upload.

### Change control and parked scope

Keep IDs stable. Append dated amendments with the reason, affected prompts, new gates and the user's authorization. Do not silently expand this into a feature-parity chase when Codex changes. New implementation discoveries can produce focused sub-prompts only after review of their necessity and scope; the main source/service architecture stays settled. A design checkpoint can change the layout without waiving behavior or evidence gates.

## 7. Current Codex reference boundary

Official pages consulted for the preceding recommendations on 2026-09-05:

- [Current product updates](https://learn.chatgpt.com/docs/whats-new): contextual review, inline diff editing and task-attention patterns are comparison references. Inline source editing is not added to this scope; existing parked Code Mode remains parked.
- [Commands and keyboard shortcuts](https://learn.chatgpt.com/docs/reference/commands#keyboard-shortcuts): command menu, task navigation, file/review/terminal shortcuts. These are references for supported actions, not a promise to duplicate unavailable features.
- [Steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing): refresh during UX-01 alongside the shipped Lamprey contract before freezing any shortcut or label differences.

Record the installed Codex build and owner-observed interaction differences at UX-00/02 when available. Documentation alone does not establish pixel-level equivalence to the user's installed build. This phase targets the enumerated interaction contracts, not blanket parity with all Codex capabilities.

## 8. Draft history and authorization record

| Date | Revision / event | Authorization |
|---|---|---|
| 2026-09-05 | Revision 1: granular plan covering all suggestions, concrete mockup checkpoint, 40 prompts, full relocation maps and verification gates | Draft requested; **STS not approved** |
| 2026-09-05 | User: "Approved for full STS and Bucket as v0.33.0 along with gh repo release notes update in humanized form." | Full source STS, prompt commits/pushes, v0.33.0 Bucket and release notes approved; UX-02 design checkpoint retained |

**Execution started:** UX-00 baseline and UX-01 contracts locally verified; commit/remote evidence resolved from their receipts. UX-02 design review is next. **Design approved:** No. **New release/Bucket approved:** Yes, v0.33.0.

Authored and reviewed by Basho Parks, copyright 2026

Execution update: UX-02 technical mockup checks passed; user explicitly waived the extra review stop. UX-03 is next. All 40 prompts and v0.33.0 publication are authorized.

Authored and reviewed by Basho Parks, copyright 2026
