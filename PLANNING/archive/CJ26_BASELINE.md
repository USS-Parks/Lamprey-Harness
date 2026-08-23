# Codex July 2026 Baseline

**Prompt:** CJP-0
**Snapshot date:** 2026-07-17
**Lamprey baseline:** `main` at `1e13e24f71ff1ec409848361014891546bda8efc`, package `0.18.0`
**Upstream ceiling:** Codex CLI `0.144.5` (2026-07-16), iOS `1.2026.188`
(2026-07-13), Desktop `26.707` (2026-07-09)
**Evidence status:** source-pinned; owner desktop traces remain
`user-verification-needed` where marked

This is the dated baseline for
`LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md`. It does not make a blanket parity
claim. Later Codex releases require a dated addendum and cannot silently change
this roster.

## 1. Evidence rules

| Mark | Meaning                                                 | Acceptance use                                                     |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `O`  | Official OpenAI product documentation or changelog      | Normative for documented product behavior                          |
| `R`  | Reproducible, version-pinned OpenAI source or test      | Normative for protocol and timing behavior exercised by the test   |
| `L`  | Owner-run desktop trace using the paired smoke playbook | Required for timing-sensitive GUI behavior not closed by `O` + `R` |
| `U`  | `user-verification-needed`                              | Open evidence row; no parity-complete claim                        |

Documentation is not treated as proof of timing by itself. A source test counts
only for the path it executes. Absence from documentation is recorded as
unknown, not inferred behavior.

## 2. Official source and version ledger

| Surface                            | Pinned source                                                                                                                                                                                                                                                | What it establishes                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steering and Queue UX              | [Prompting: Steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing) (`O`, observed 2026-07-17)                                                                                                                                  | Steer adds to the current run; Queue saves for the next run; Desktop exposes a follow-up default and queue editing, reordering, send-now, and deletion; CLI Enter steers and Tab queues           |
| Turn protocol                      | [App-server README at `rust-v0.144.5`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L385-L389) (`O`/`R`)                                                                                                                 | `turn/start`, `turn/steer`, and `turn/interrupt`; steer does not create a new turn and requires the expected active turn                                                                          |
| Steer validation and event shape   | [App-server README, steer section](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1026-L1036) (`O`/`R`)                                                                                                                   | No `turn/started` event for steer; no per-turn setting override; missing, stale, or non-steerable targets reject                                                                                  |
| Ordered user input                 | [App-server README, user-message item](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1352-L1354) (`O`/`R`)                                                                                                               | User messages carry an optional client ID and ordered `text`, `image`, and `localImage` items                                                                                                     |
| Active-turn steer test             | [`turn_steer.rs` at `rust-v0.144.5`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/tests/suite/v2/turn_steer.rs#L235-L383) (`R`)                                                                                                    | A steer accepted during a sleeping tool returns the active turn ID, emits a user item with the client ID, and completes the same turn                                                             |
| Pending-input timing tests         | [`pending_input.rs` at `rust-v0.144.5`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L291-L426) (`R`)                                                                                                       | New input interrupts `wait_agent` and sleep waits, then appears in the follow-up request                                                                                                          |
| Safe-boundary and compaction tests | [`pending_input.rs`, safe-boundary cases](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L709-L1057) (`R`)                                                                                                    | Input does not preempt immediately after a reasoning item and remains pending across mid-turn/tool-output compaction until the correct continuation boundary                                      |
| Interrupt and terminals            | [App-server README, interrupt](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L989-L998) and [background terminals](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L999-L1025) (`O`/`R`) | Interrupt ends the active turn as interrupted; background terminals require explicit list/terminate/clean operations                                                                              |
| July release delta                 | [Codex changelog](https://learn.chatgpt.com/docs/changelog) (`O`, observed 2026-07-17)                                                                                                                                                                       | CLI `0.144.5`, iOS `1.2026.188`, and Desktop `26.707` bound this audit; July Desktop added direct Markdown/code editing, PR Chat, activity visibility, plugin settings, and follow-up permissions |
| Code Mode implementation status    | [Feature definition](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/features/src/lib.rs#L93-L98) and [registry at `rust-v0.144.5`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/features/src/lib.rs#L853-L869) (`R`)             | JavaScript Code Mode is a V8-backed, under-development, default-off feature; it is not equivalent to a generic Python/Jupyter claim                                                               |
| Browser Developer Mode             | [Browser: Developer mode](https://learn.chatgpt.com/docs/browser#developer-mode) (`O`)                                                                                                                                                                       | Full CDP inspection is an explicit, admin-gated setting with approval and trust implications                                                                                                      |
| Remote handoff                     | [Remote connections](https://learn.chatgpt.com/docs/remote-connections) (`O`)                                                                                                                                                                                | Remote handoff exists but crosses host, credential, and worktree authority; it remains parked here                                                                                                |
| Record and Replay                  | [Record and Replay](https://learn.chatgpt.com/docs/extend/record-and-replay) (`O`)                                                                                                                                                                           | A distinct extension surface; deliberately parked pending stable browser/artifact contracts                                                                                                       |

The installed Windows Store Codex binary was not readable from this managed
workspace because of WindowsApps ACLs. Running a disposable third-party package
was not authorized. Therefore no local binary trace is represented as complete;
the owner steps in `CJ26_SMOKE_PLAYBOOK.md` are the live-evidence path.

## 3. Historical claim versus July source

The June documents remain historical records. Their completion marks describe
their own rosters, not current Codex parity.

| Historical claim                                       | Historical citation                                  | July disposition                                                                                                               | Current authority                                        |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| The research was a complete Codex inventory            | `PLANNING/CODEX_TOOLSET_PARITY_RESEARCH.md:5`, `:11` | **Superseded as a current inventory.** It was assembled by parallel web-research agents before the July cut.                   | Section 2 ledger and the current version-pinned protocol |
| Hosted-tool details derived from leaked prompts        | `PLANNING/CODEX_TOOLSET_PARITY_RESEARCH.md:17`       | **Rejected as normative authority.** Useful provenance, but not an official contract.                                          | Official docs and `openai/codex` tag only                |
| Codex has no Code Interpreter/Python sandbox           | `PLANNING/CODEX_TOOLSET_PARITY_RESEARCH.md:35`       | **Narrowed.** No Python/Jupyter surface is established, but Codex `0.144.5` has a V8-backed, under-development Code Mode.      | Pinned feature registry above                            |
| Codex relies on hosted runs rather than agent controls | `PLANNING/CODEX_TOOLSET_PARITY_RESEARCH.md:241`      | **Stale.** The app-server now exposes thread/turn control and version-pinned pending-input tests exercise agent-wait steering. | App-server README and `pending_input.rs`                 |
| Codex-like tool surface was the goal                   | `PLANNING/CODEX_TOOLSET_PARITY_PLAN.md:3`            | **Historical scope, not product parity.** It targeted the observed tool surface, not the complete current control plane.       | This PSPR                                                |
| Progress rows are factual for that plan                | `PLANNING/CODEX_TOOLSET_PARITY_PROGRESS.md:3`, `:49` | **Retained.** They prove what Lamprey shipped, not what current Codex contains.                                                | Current source plus this baseline                        |
| Lamprey parity plan closes the structural gap          | `PLANNING/LAMPREY_PARITY_PLAN.md:3`                  | **Different vendor target.** The plan is explicitly Claude Code-focused.                                                       | Separate future Claude refresh; not this roster          |

## 4. Codex Steering and Queue conformance matrix

This table pins the observable target before Lamprey implementation. “Same
turn” means the active regular turn ID is preserved and no second
`turn/started` notification is emitted.

| Case                           | Pinned Codex behavior                                                                                                                                                                                                | Evidence                                                                                                                                                                                                                                                       | Status                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Steering during streaming      | Input remains pending until a safe continuation boundary; it is not dropped or duplicated and is appended to the active regular turn.                                                                                | `R`: [`pending_input.rs:709-751`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L709-L751); `O`: steer contract                                                                                                | Source-pinned; desktop `L` required                            |
| Steering during tool execution | A steer accepted while the sleep tool is active returns the active turn ID and becomes the next user item in that turn. It does not cancel the tool side effect.                                                     | `R`: [`turn_steer.rs:235-383`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/tests/suite/v2/turn_steer.rs#L235-L383)                                                                                                                  | Source-pinned; desktop `L` required                            |
| Steering during subagent wait  | New input interrupts `wait_agent`; the root continues with both the initial and steer prompts in order.                                                                                                              | `R`: [`pending_input.rs:291-340`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L291-L340)                                                                                                                     | Source-pinned; child-target GUI `L` required                   |
| Completion race                | The protocol requires an active regular turn and exact `expectedTurnId`; once completion wins, the steer rejects rather than silently becoming Queue/new-turn input. Exact Desktop draft recovery is not documented. | `O`: [steer errors](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1026-L1036); `R`: [`turn_steer.rs:41-100`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/tests/suite/v2/turn_steer.rs#L41-L100) | Protocol pinned; draft UX `U`                                  |
| Stale target                   | A mismatched `expectedTurnId` is an invalid request; no fallback is specified.                                                                                                                                       | `O`: [steer errors](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1026-L1036)                                                                                                                                              | Source-pinned; desktop `L` required                            |
| Non-steerable turn             | Review and manual compaction reject as non-steerable; completed/interrupted turns have no active regular turn to accept a steer.                                                                                     | `O`: [turn/steer overview](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L385-L389), [steer errors](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1026-L1036)                           | Protocol pinned; editable-draft UX `U`                         |
| Ordered attachments            | A user item may contain ordered text, image, and local-image elements and an optional client ID. The exact Desktop reorder/preview affordance is not specified.                                                      | `O`: [user-message item](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1352-L1354)                                                                                                                                         | Protocol pinned; desktop `L` required                          |
| Queue edit/reorder/send/delete | Queued items appear above the composer and support edit, reorder, send-now, and delete.                                                                                                                              | `O`: [Steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing)                                                                                                                                                                     | Documented; desktop `L` required                               |
| Queue restart/reconnect        | The July product documentation inspected for CJP-0 does not state queue durability across application restart or remote reconnect.                                                                                   | No affirmative claim; test prescribed in playbook                                                                                                                                                                                                              | `U`; M1 must not claim Codex-identical durability until traced |
| Interrupt/background terminal  | Interrupt settles the turn as interrupted. Background terminals are not implicitly terminated; cleanup is explicit.                                                                                                  | `O`/`R`: [interrupt and terminal lifecycle](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L989-L1025)                                                                                                                       | Source-pinned; desktop `L` required                            |
| Default and shortcuts          | Desktop exposes a General setting for follow-up behavior and an alternate shortcut; CLI Enter steers and Tab queues. The exact Desktop key labels must be read from the owner build.                                 | `O`: [Steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing)                                                                                                                                                                     | Desktop shortcut `U`                                           |
| Mid-turn compaction            | A steer stays pending through compaction and is sent only after the correct post-compaction continuation; tool-output-triggered compaction follows the same ordering discipline.                                     | `R`: [`pending_input.rs:759-1057`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L759-L1057)                                                                                                                   | Source-pinned                                                  |

### Resulting M1 clarifications

1. The server contract, not UI timing guesses, defines identity and rejection:
   active regular turn plus exact expected turn ID.
2. “Immediate” does not mean interrupting arbitrary work. Delivery occurs at a
   safe model-continuation boundary; wait primitives may be woken.
3. A rejected or racing steer is not silently converted into Queue. The
   editable-draft behavior remains the approved Lamprey default unless a live
   Codex trace proves a different current UX.
4. Queue durability across restart/reconnect is a Lamprey reliability target,
   not yet a Codex-parity fact.

## 5. Current Lamprey wiring and partial equivalents

| Concern                                      | Current Lamprey evidence                                                                                                                                                         | Classification                                  | CJP conclusion                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Real turn seam                               | `electron/ipc/chat.ts:211` registers `chat:send`; `:520` exports `runHeadlessTurn`; `:659` enters `runChatRound`; `:769` defines the round                                       | `extend`                                        | Preserve the one real-turn seam                                              |
| Active run state                             | `electron/ipc/chat.ts:153-158` stores only controller, correlation ID, and start time keyed by conversation                                                                      | `replace` (internal shape), preserving behavior | Extract a turn-ID-aware runtime; no mailbox exists yet                       |
| Cancellation                                 | `electron/ipc/chat.ts:416-431` aborts the active controller and emits cancellation data                                                                                          | `extend`                                        | Add expected-turn identity; keep Stop separate from Steer                    |
| Tool continuation                            | `electron/ipc/chat.ts:769`, `:991`, `:1145`, `:1679` form the recursive tool-round and native-dispatch path                                                                      | `extend`                                        | Drain steer only at tested safe boundaries                                   |
| Async next-turn delivery                     | `electron/services/async-event-bridge.ts:111`, `:168`, `:192`, and `electron/ipc/chat.ts:562-564` enqueue then drain task notifications into a later prompt                      | `reuse` for Queue substrate                     | It is not a same-turn steering mailbox                                       |
| Persistence                                  | `electron/services/schema-init.ts:52`, `:60`, `:285`, `:396` define conversations, messages, agent runs, and async events; no turn/follow-up ledger is present                   | `new`                                           | Add additive turn and follow-up tables                                       |
| Renderer streaming state                     | `src/stores/chat-store.ts:45`, `:219`, `:405`, `:535` use one global `isStreaming` flag                                                                                          | `replace` (state model)                         | Reconcile active turn per conversation                                       |
| Composer lock                                | `src/components/chat/ChatInput.tsx:1124` requires `!isStreaming` to send; `:1228` exposes Stop                                                                                   | `replace` for submit gating; `reuse` Stop       | Keep composer usable during a run                                            |
| Event filtering                              | `src/hooks/useChat.ts:66-70`, `:83-121` filters live events to the active conversation                                                                                           | `extend`                                        | Add turn/follow-up identity and reconnect reconciliation                     |
| Attachments                                  | `src/stores/chat-store.ts:377-392` separates images, converts only non-images into attachment blocks, and drops images for non-vision models; `:420-424` sends text content only | `extend`                                        | Canonical ordered input items are new; current path is not attachment parity |
| Subagents                                    | `electron/services/subagent-runner.ts:405-419`, `:437`, `:753-757` provides live abortable handles; `electron/ipc/tasks.ts:60-90` exposes list/get/output/stop                   | `extend`                                        | Add wait/wake/steer targeting over existing run identity                     |
| Spawn and notification                       | `electron/services/spawn-task.ts:57-73` creates a task and uses the async event bridge                                                                                           | `reuse`                                         | Preserve next-turn notification semantics                                    |
| Audit events                                 | `electron/services/event-log.ts:22-53`, `:251-347`, `:497` define bounded/redacted tool/chat events                                                                              | `extend`                                        | Add every follow-up disposition without attachment bytes                     |
| Preload surface                              | `electron/preload.ts:4-11` exposes send/cancel; no steer/queue methods are present                                                                                               | `extend`                                        | Add narrow typed IPC only                                                    |
| Tool authority                               | `electron/services/tool-registry.ts:332`, `:491`, `:509`, `:528`, `:542`, `:716` owns descriptors, provider/role normalization, lazy surfaces, search, and singleton dispatch    | `reuse`                                         | New control tools must retain risk, approval, audit, and cancellation        |
| Background terminals                         | `electron/ipc/tasks.ts:79-90` provides output/stop for agent runs; shell lifecycle is registered through the native pack bootstrap at `electron/services/tool-packs.ts:21-36`    | `extend`                                        | Interrupt must not imply process termination                                 |
| Remote handoff, Record/Replay, Office suites | No M1 seam is authorized; see this PSPR parked ledger                                                                                                                            | `parked`                                        | Separate security and plugin plans                                           |

### Missing primitives at the baseline

Repository search found no `conversation_turns`, `turn_followups`,
`expectedTurnId`, or `clientUserMessageId` definitions in tracked runtime code.
That negative result is consistent with the current `ActiveRun` shape
(`electron/ipc/chat.ts:153-158`) and schema bootstrap
(`electron/services/schema-init.ts:52-60`, `:285`, `:396`). It is a CJP-0
search result, not a claim that history can never contain similar words.

## 6. Current native tool inventory and byte baseline

The native pack bootstrap imports sixteen registration packs at
`electron/services/tool-packs.ts:21-36`. The registry enumerates registered
descriptors at `electron/services/tool-registry.ts:332` and provider-normalized
schemas at `:491`; the lazy surface is assembled at `:528`. On the pinned
Lamprey commit, an isolated Vitest import produced **54 native descriptors**:

- Memory, planning, and context (12): `memory_add`, `enter_plan_mode`,
  `exit_plan_mode`, `mark_chapter`, `ask_user_question`, `update_plan`,
  `get_goal`, `create_goal`, `update_goal`, `workspace_context`,
  `verify_workspace`, `skill_open`.
- Shell, files, and developer support (12): `shell_command`, `shell_monitor`,
  `shell_list`, `shell_stop`, `shell_output`, `create_document`, `apply_patch`,
  `view_image`, `read_thread_terminal`, `load_workspace_dependencies`,
  `request_permissions`, `read_tool_result`.
- Browser, web, and current information (16): `browser_open`, `browser_click`,
  `browser_type`, `browser_find`, `browser_screenshot`,
  `browser_get_current_tab`, `browser_evaluate_readonly`, `frontend_qa`,
  `web_search`, `web_open`, `web_find`, `image_search`, `time_lookup`,
  `finance_quote`, `weather_lookup`, `sports_lookup`.
- Image generation (3): `image_generate`, `image_edit`, `image_variation`.
- Agents and session messaging (6): `multi_agent_run`, `agent_fanout`,
  `agent_critique`, `agent_advisor`, `spawn_task`, `send_to_session`.
- Background control (5): `schedule_wakeup`, `loop_enqueue`,
  `loop_complete_task`, `loop_control`, `push_notification`.

The twelve always-on core names are declared at
`electron/services/model-tool-surface.ts:24-39`; `tool_search` is appended at
`:41-72`, giving a **13-schema lazy surface** before any unlocks.

| Measurement                                                              | UTF-8 bytes |
| ------------------------------------------------------------------------ | ----------: |
| `JSON.stringify(toolRegistry.getNormalizedToolsForProvider('deepseek'))` |      43,601 |
| `JSON.stringify(toolRegistry.getModelToolSurface('deepseek'))`           |      14,332 |
| `renderContract()`                                                       |       3,118 |
| `buildSystemPrompt([], '')`                                              |       3,545 |
| `buildSystemPrompt([], '', undefined, undefined, undefined, 'coding')`   |       3,756 |

The relevant measurement seams are
`electron/services/tool-registry.ts:491-532`,
`electron/services/system-prompt-builder.ts:178-193`, and
`:230-269`. The existing registry test independently locks that full provider
schemas materialize parameters at
`electron/services/tool-registry.test.ts:156-169`.

Measurement recipe: create a temporary `*.test.ts` inside
`electron/services/`, import `toolRegistry`, `renderContract`, and
`buildSystemPrompt`, print `Buffer.byteLength(JSON.stringify(value), 'utf8')`
(or `Buffer.byteLength(value, 'utf8')` for strings), run it with Vitest, then
delete the temporary file. The CJP-0 run left no measurement file in the tree.

## 7. Baseline verdict

- The July Steering protocol and safe-boundary semantics are sufficiently
  pinned from official documentation plus versioned OpenAI source tests to
  design ST-1 through ST-8.
- Desktop-only details—completion-race draft recovery, exact desktop shortcuts,
  child targeting, ordered mixed-attachment UI, Queue restart/reconnect, and
  GUI terminal behavior—remain `user-verification-needed` and are explicitly
  exercised by `CJ26_SMOKE_PLAYBOOK.md`.
- Lamprey has reusable turn, cancellation, async-event, agent, audit, tool, and
  composer substrates, but no stable turn identity, same-turn mailbox, or
  persisted follow-up ledger. Its current composer intentionally blocks sends
  while streaming.
- No production code changed in CJP-0. M1 must preserve the single
  `runHeadlessTurn`/`runChatRound` dispatch seam and may not claim
  parity-complete until the live matrix is recorded.
