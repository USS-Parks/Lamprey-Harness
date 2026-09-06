# UX-01 — Capability destinations and interaction contracts

Source: `5159466b1528868bfee467375eb9aa17207e80bf`. This freezes the behavior to preserve during UX-03–35. The destination column describes approved implementation scope, not functionality already shipped. Actual implementation still follows the roster and the UX-02 design checkpoint.

## Identity, ownership and authority

The conversation ID remains the task ID. A project groups tasks; it is not a replacement task ID. A workspace resource has an owning task/project and its existing resource identity. Two files named `index.ts` in different repositories are different resources. Opening the same resource twice selects its existing tab. Incidental model output may add an indicator but cannot focus another task or replace the user's selected document.

Closing a UI container is distinct from destroying its resource. Hiding the terminal keeps the existing process alive. Closing a file tab does not delete the file. Hiding the browser preserves its session; explicitly closing a browser page invokes the existing close-page lifecycle. Where an outer browser resource tab represents several pages, its close action hides that container and leaves page destruction to the named page control. A task switch never migrates a running process, draft, browser page, pending approval or follow-up to another task.

Steer targets a specific active turn at a safe boundary. Queue persists a later turn. Stop cancels the active turn through the existing typed path. The compact control must show its preferred action by name and expose the other action through a menu. Enter follows that visible preference. A successful acknowledgment, rather than a click, permits clearing submitted input. Rejections retain recoverable text, ordered attachments and a useful error. Retry uses the existing idempotency semantics; it must not create a duplicate turn.

Permission mode (`default`, `auto-review`, `full`), plan state and coding mode remain independent. Presentation cannot change any policy, acceptance default, active grant or approval lifetime. A permission-required operation still reaches its main-process authorization path. Pending decisions remain visible until resolved; a toast timer is not resolution. Settings search indexes public metadata and aliases, never secrets or user-supplied values.

## Complete tool destination map

`ToolId` in `src/stores/ui-store.ts` has 13 members. `src/components/tools/ToolsPanel.tsx` is the existing body dispatcher. Eleven primary launcher cards are not the complete capability inventory. Every row below requires its acceptance scenario before an old entry point is removed.

| Existing ID | Existing entry / implementation | Destination and exact access path | Scenario |
|---|---|---|---|
| `files` | RightPanelHome; ToolLauncherPopover; QuickOpenPalette; FilesPanel | Workspace Files control or Commands → Files; click a tree file or conversation path → file tab | W01 |
| `sidechat` | RightPanelHome; CodeBlock seedSideChat; SideChatPanel | Message/block action → Side chat; Commands → Side chat opens the existing conversation seed flow | W02 |
| `browser` | RightPanelHome; Ctrl+T; ToolSettings; BrowserPanel | Workspace + → Browser; Ctrl+T; URL open → existing browser session | W03 |
| `review` | RightPanelHome; Ctrl+Shift+G; EnvironmentPanel; FloatingEnvironmentCard; ReviewPanel | Task header Changes → Review tab; Commands → Review; Ctrl+Shift+G | W04 |
| `terminal` | RightPanelHome; Ctrl+backtick; ToolLauncherPopover; TerminalPanel | Bottom Terminal toggle; Ctrl+backtick; Commands → Terminal | W05 |
| `environment` | Ctrl+Shift+E; EnvironmentPanel; floating context | Project/branch context → Environment details; Commands → Environment | W06 |
| `sources` | Ctrl+Shift+S; SourcesPanel | Inline source → Sources detail; Commands → Sources; keep direct shortcut | W07 |
| `artifacts` | RightPanelHome; App artifact opener; ArtifactsPanel and ArtifactPanel | Inline artifact → resource tab; Workspace + → Artifacts list; Commands → Artifacts | W08 |
| `plan` | RightPanelHome; App plan-mode trigger; PlanToolPanel | Status plan progress → Plan details; Commands → Plan | W09 |
| `background` | RightPanelHome; BackgroundTasksPanel | Task status → Activity details → Background tasks; Commands → Background tasks | W10 |
| `afterAction` | RightPanelHome; AfterActionPanel | Task status/error → Diagnostics → After action; Commands → After action | W11 |
| `loop` | RightPanelHome; LoopsPanel | Activity details → Loops; Automations → Loops; Commands → Loops | W12 |
| `agents` | RightPanelHome; AgentsPanel | Activity details → Agents; Commands → Agents | W13 |

The current artifact/file routes also include `App.__openArtifact`, MarkdownRenderer path/research links, CodeBlock artifact opens and `ui-store.requestOpenFile`. UX-06 adapts those callers into the same resource host; it must not create competing stores or remove the existing external-editor fallback without an equivalent explicit action. Line references must either reveal the correct line or visibly report that the viewer cannot honor the location.

Browser Developer Mode remains reachable inside the existing browser details: site policy, inspection, screenshot/evidence capture and annotation actions retain the same permission and origin checks. Its controls are not replaced with a mock browser page or a generic iframe. Browser UI history is distinct from task navigation history.

## Workspace acceptance scenarios

| ID | Required operations and concrete expected result |
|---|---|
| W01 | Open tree, filter, expand folder, preview file, quick-open, open path:line and missing/denied path. Reopen dedupes. Same basename in two real repositories opens the right file. Closing a tab restores focus without deleting content. |
| W02 | Seed from a whole message and a code block, then use custom seed. Source task/message lineage and exact selected content survive. The child is not silently the parent conversation. |
| W03 | Create/select/close page, address navigation, back/forward/reload, hide/show and task switch against a local HTTP server. Ten cycles leave the expected page count. Developer policy/inspection/evidence/annotation actions remain reachable and permission scoped; denied origins remain denied. |
| W04 | Load real unstaged/staged/untracked changes, select diff, refresh, stage/unstage, request existing discard confirmation, and use Fix this → draft. Two repositories prove correct task scope despite the baseline process.cwd defect. Loading must not say clean. Missing Git/repository failures are visible. Existing PR review/open/comment paths stay available; no new arbitrary source editor. |
| W05 | Start each installed supported shell, inspect cwd, type/copy/paste, resize, hide/reopen, switch task and explicitly terminate. Hiding never stops or duplicates a process. Missing shell produces a useful error. Ctrl+C and shell shortcuts are delivered to the terminal. |
| W06 | Open/select project and local/worktree context, inspect branch and changes, use branch/work-mode actions, commit/push and existing PR flow. Compact context invokes the existing validations/dialogs. The actual repository identity must match review, files and terminal; stale branch labels are not acceptable. |
| W07 | Open current sources, follow a citation, inspect no-sources and unavailable-source states, then switch tasks. The source belongs to the selected task, and external links retain their safe-open path. |
| W08 | Open generated markdown/code/image or supported artifact, switch tabs, return through the artifact list and follow a research report link. Existing viewers, export/open actions and attachment identity survive; missing artifacts are reported honestly. |
| W09 | Inspect progress and steps, open required plan acceptance, accept/reject through current handlers, and verify that a pending plan remains pending after hiding the panel. Completed/failed/cancelled work never receives a misleading completed plan state. |
| W10 | Open 200 historical completed tool entries, expand args/results/errors and inspect active jobs/wakeups. Stop/cancel uses the existing operation for that item. Completed history remains accessible while a new turn runs and after reopen, addressing the UX-00 reset observation. |
| W11 | Inspect diagnostics, after-action/reasoning history and existing export/search/filter paths. Expand full errors and evidence; condensed presentation cannot erase the underlying record or claim model reasoning that was never supplied. |
| W12 | Pause/resume/stop/remove loop and inspect/add/remove backlog items. Switching loops during a load never shows another loop's backlog. Destructive removal retains current decisions; hiding is not stopping. |
| W13 | Inspect active agents and their identity, grants and spending. Revoke grants and use existing stop/kill controls where exposed. Revocation remains effective in the real main-process policy path; the new surface grants no additional authority. |

## Complete settings relocation map

The exact old leaf ID remains accepted by `openSettings(id)` and `settingsInitialTab`. A group is navigation metadata, not a new saved configuration schema. Each Sxx scenario opens the leaf by old ID and by search alias, changes a reversible fixture value through its existing form, reopens to verify persistence, restores the fixture value, and checks existing validation. Read-only Activity/Library cases verify viewing/navigation rather than inventing a write. No production credential is needed for these fixtures.

| Old ID | Existing label / search alias | Group | Scenario |
|---|---|---|---|
| `general` | General | General | S01 |
| `automations` | Automations | General | S02 |
| `appearance` | Appearance | Appearance | S03 |
| `models` | Models | Models & Connections | S04 |
| `api` | API Keys | Models & Connections | S05 |
| `github` | GitHub | Models & Connections | S06 |
| `webTools` | Web Tools | Tools & Extensions | S07 |
| `currentInfo` | Current Info | Tools & Extensions | S08 |
| `imageGen` | Image Gen | Tools & Extensions | S09 |
| `tools` | Tools | Tools & Extensions | S10 |
| `library` | Library | Tools & Extensions | S11 |
| `rag` | RAG | Tools & Extensions | S12 |
| `permissions` | Permissions | Permissions | S13 |
| `agenticCoding` | Coding Mode | Advanced | S14 |
| `planGoal` | Plans & Goals | Advanced | S15 |
| `hooks` | Hooks | Advanced | S16 |
| `loops` | Loops | Advanced | S17 |
| `orchestration` | Orchestration | Advanced | S18 |
| `snip` | Snip | Advanced | S19 |
| `timeouts` | Timeouts | Advanced | S20 |
| `seedBudget` | Seed Budget | Advanced | S21 |
| `reasoning` | Reasoning Audit | Advanced | S22 |
| `persistence` | Persistence | Advanced | S23 |
| `activity` | Activity | Advanced | S24 |

Settings rendering remains in the existing leaf components imported by SettingsDialog. Specific contextual callers include App local/keyless startup → `models`; ChatInput coding mode → `agenticCoding`; Sidebar Automations → `automations`; PullRequestDialog setup → `github`; and generic Sidebar/ChatInput/FloatingEnvironmentCard settings links → the group containing the requested leaf or General by default. ToolSettings' browser action still opens the browser rather than another settings form. Customize retains its existing Skills, Connectors and Plugins columns, reached from Tools & Extensions and Commands; it does not become three duplicate settings forms.

## Composer, tasks and feedback acceptance

| ID | Required operation and concrete expected result | Owning prompts |
|---|---|---|
| C01 | Idle Enter sends once; Shift+Enter inserts a newline; IME composition cannot send. Text, ordered mixed attachments, mentions, memory shortcuts, slash commands and workflow insertion survive. | UX-11/16/26 |
| C02 | While running, select Steer, submit to the exact active turn and show accepted-versus-consumed status truthfully. Change to Queue, submit once, reorder/edit/remove/send-now using the existing queue operations. Preference survives reopen. | UX-12/16 |
| C03 | Stop cancels the owning turn. Old turn IDs and duplicate/replayed submissions are rejected/idempotent as prescribed by typed IPC. Clicking an unrelated task's Stop cannot cancel this task. Completed/failed/cancelled remain distinct. | UX-12/17 |
| C04 | Rejected send/steer/queue retains the editable draft and its attachments; restore failed/recovered follow-up text and attachments. Task switch/reload never overwrites another task's draft. | UX-11/12/16 |
| C05 | Change coding/plan mode without changing permission mode; change permissions without approving a pending plan or tool. Keyboard cycling and popovers display the true independent states. | UX-11/16/20 |
| C06 | Search/select model, filter to connected providers, follow missing-key setup and use custom/local/keyless models. Stored keys remain provider-specific; opening a menu does not save a key or silently reroute to a broker. | UX-14/29 |
| C07 | Pending tool permission, plan acceptance, question, failed turn and integrity warning each appear in the correct task attention destination. Resolve using existing handlers; duplicate notices collapse but unresolved decisions remain. | UX-17/19/20 |
| C08 | Current status shows idle/running/queued/waiting/failed/cancelled/completed from real state. Expand tool results and diagnostics on demand. No synthetic progress percentage or completion claim is introduced. | UX-17/18 |
| N01 | New task; new/select/edit project; rename/pin/unpin/archive/unarchive/fork task. Task IDs and fork lineage remain stable; archive is reversible and never calls delete. Permanent deletion remains an explicitly named existing action. | UX-21/22 |
| N02 | Search recent/archived/project tasks and message history; change sort/group/filter, reload and navigate back/forward. Slow older responses cannot replace the newest query/task. Deleted targets recover without losing the current draft. | UX-23 |
| N03 | Select an attention row for another running task: open that task and focus its actual unresolved decision. A notification cannot steal focus merely by arriving. Project sections, task list and attention view refer to the same IDs. | UX-19/21/22 |
| N04 | Find a command by old label, execute available action, and inspect unavailable-action reason. Workflows retain list/search/run/dry-run/edit/create/meta-scaffold paths; files retain direct quick-open; Memory remains findable. No palette text becomes arbitrary shell execution. | UX-24/25 |
| N05 | Search each S01–S24 alias, clear search, navigate back and close with Escape. Focus reaches the target section and returns to the opener. Invalid old ID recovers to a valid section without rewriting settings. | UX-27/28 |
| N06 | Start without credentials, select a local endpoint, set up a fixture remote provider and recover from failed setup. Existing disabled capability flags stay disabled; UI grouping does not assert live tool support. | UX-29 |
| A01 | Keyboard-only start/find/steer/review; modal Tab containment, Escape precedence and focus restoration; no token-by-token announcements. All meaningful icon buttons have names. | UX-26/32/35 |
| A02 | Compare all three design states at the G4 sizes, themes and scale settings. Essential composer/Stop/approval controls remain reachable; narrow layout uses one workspace view at a time, with safe return to conversation. | UX-30/31/32 |
| P01 | Repeat the exact UX-00 inputs and accepted visible-window timing method. Five per-run p50/p95 sets, streaming scroll anchor and long-task capture, plus ten supported resource lifecycle cycles. Relative and absolute limits remain mandatory; task-switch baseline failure does not lower the target. | UX-33/34 |

## Shortcut ownership

Existing source of dispatch: `src/hooks/useKeyboardShortcuts.ts`, `electron/services/shortcuts.ts`, component-local handlers and the current palettes. The new metadata must describe the existing handlers rather than register a second global listener for each action. Browser/terminal/editor local handling and IME take precedence where appropriate. Modal Escape closes the highest-priority dialog before the global Stop path.

| Binding | Current action | Contract for UX-26 |
|---|---|---|
| Ctrl/Cmd+N | New conversation | New task, same creation path |
| Ctrl/Cmd+K | Workflow palette | Unified command menu with all workflow entries preserved |
| Ctrl/Cmd+Shift+P | No handler in the current global hook | Additional command-menu entry; confirm native/component conflicts before binding |
| Ctrl/Cmd+P | File quick-open | Preserve direct file quick-open |
| Ctrl/Cmd+B | Sidebar | Preserve sidebar toggle |
| Ctrl/Cmd+J | No handler in the current global hook | Bottom panel toggle; terminal local behavior remains local |
| Ctrl/Cmd+backtick | Terminal tool | Bottom terminal using existing session |
| Ctrl/Cmd+T | Browser tool | Preserve browser access; page-local shortcut ownership is explicit |
| Ctrl/Cmd+Shift+G | Review | Preserve review access |
| Ctrl/Cmd+Shift+E | Environment | Preserve environment details |
| Ctrl/Cmd+Shift+S | Sources | Preserve sources access |
| Ctrl/Cmd+U | File attachment picker | Preserve attachment action |
| Ctrl/Cmd+Shift+M | Memory browser | Retain unless the owner approves its relocation in the design; do not silently repurpose it for models |
| Ctrl/Cmd+, | Settings | Grouped settings |
| Escape | Dialog first; otherwise cancel active stream / clear search | Keep priority and cancellation semantics; no menu Escape may unexpectedly stop a turn |

Model selection is always reachable from the composer and command menu. A new model shortcut is optional; existing Memory muscle memory wins over an unapproved conflicting binding. UX-02 must disclose this choice rather than imply every Codex shortcut already matches. User overrides, if found in implementation, take precedence over defaults and must be migrated without resets.

## Reuse and proof

Reuse `follow-up-composer`, `follow-up-state`, `turn-control-types`, the turn-control store/IPC and queued dispatch. Existing tests include `electron/ipc/turn-control.test.ts`, `turn-control-wiring.test.ts`, `electron/services/turn-control-db-integration.test.ts`, `queued-follow-up-dispatch.test.ts`, and `src/lib/follow-up-composer.test.ts` / `follow-up-state.test.ts`. Reuse workflow stores/runners and their existing tests. Reuse `scripts/acceptance/electron-fixture.cjs`, `shell-link.cjs` and `browser-lifecycle.cjs` for actual Electron proof; extend at UX-03 rather than creating a new test framework.

UX-01 verification is a source/document completeness check: exact ToolId and SettingsTabId set equality, all scenario references resolved, source paths present, caller inventory retained and no product changes. It is not live acceptance of these future behaviors. UX-02 must show where every W/S/C/N destination lives; low-frequency operations may use the named command/detail route, but may not disappear.

Authored and reviewed by Basho Parks, copyright 2026
