# Lamprey Codex July 2026 Parity PSPR

**Initiative:** Steering and Current Codex Control-Surface Parity
**Roster:** CJP-0, ST-1–ST-12, TC-1–TC-7, VA-1–VA-6, CM-1–CM-6,
PR-1–PR-6, MR-1–MR-5, BD-1–BD-6, GA-1–GA-6, CJP-WRAP
**Drafted:** 2026-07-17
**Status:** **M9 CJP-WRAP COMPLETE; M8 RELEASED AS v0.26.0; OWNER LIVE PLAYBOOKS OPEN; M4 PARKED INDEFINITELY**

> The user's direction is the era-lock exception: Lamprey needs Steering identical in
> behavior and functionality to current Codex, and its six-week-old Codex parity baseline
> must be refreshed against the July 2026 product. The draft was approved on 2026-07-17
> with an explicit one-enhancement-at-a-time constraint. On 2026-07-17 the user clarified
> that the full §1 contract is required and authorized CJP-0 plus ST-1 through ST-12 STS.
> Each prompt remains a separate gated commit. See the append-only records in §6.

---

## §0 — Governance

### Goal

Give Lamprey behavior-complete Codex Steering first, then close the highest-value July 2026
Codex control-surface gaps through independently shippable milestones that reuse Lamprey's
existing turn, task, artifact, GitHub, MCP, browser, automation, goal, and orchestration
spines without reviving the deleted always-on agent pipeline.

### Authoritative repository and truth sources

- Working repository: `C:\Users\17076\Documents\Claude\Lamprey Harness`
- Current implementation baseline: `main` at `1e13e24f71ff1ec409848361014891546bda8efc`,
  package version `0.18.0`, observed 2026-07-17.
- Project truth: `AGENTS.md`, `DEVLOG.md`, current source and tests, this PSPR after approval.
- Current Codex behavior truth:
  - [Steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing)
  - [Codex app-server contract](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
  - [Codex changelog](https://developers.openai.com/codex/changelog)
  - [Browser](https://learn.chatgpt.com/docs/browser)
  - [Record and Replay](https://learn.chatgpt.com/docs/extend/record-and-replay)
  - [Remote connections and handoff](https://learn.chatgpt.com/docs/remote-connections)
  - [Scheduled tasks](https://learn.chatgpt.com/docs/automations)
- Snapshot to pin during CJP-0: official material available through Codex CLI `0.144.5`
  (2026-07-16), iOS `1.2026.188` (2026-07-13), and Desktop `26.707`
  (2026-07-09). Later releases do not silently expand an approved roster; they become a
  dated addendum or a new PSPR.
- Historical-only references: `PLANNING/CODEX_TOOLSET_PARITY_RESEARCH.md`,
  `PLANNING/CODEX_TOOLSET_PARITY_PLAN.md`, `PLANNING/CODEX_TOOLSET_PARITY_PROGRESS.md`,
  and `PLANNING/LAMPREY_PARITY_PLAN.md`. They remain honest historical records but are not
  authority for a current parity claim.

### Era-lock exception and architectural invariants

This initiative deliberately extends past Lamprey's 2025-11-24 through 2026-01-24 era
lock. The user explicitly requested the exception on 2026-07-17. The exception does not
waive these invariants:

1. `chat:send -> runHeadlessTurn -> runChatRound` remains the single real-turn seam.
2. Privileged work remains in the Electron main process behind narrow, typed preload IPC.
3. Every IPC handler returns `{ success: true, data } | { success: false, error }`.
4. Tool authority remains descriptor/risk driven; nested or indirect execution cannot
   bypass approvals, plan-mode mutation blocking, audit, sandbox, or cancellation.
5. Ghost-reply protection and universal turn settlement remain true for every new path.
6. The deleted Planner→Coder→Reviewer pipeline, auto-router, runtime proof gate, composer,
   and stage chrome stay deleted. Steering is runtime input, not prompt machinery.
7. New power-shaped capabilities are independently toggleable and default OFF unless a
   milestone explicitly proves that an always-on surface is inert and era-faithful.
8. Existing tool schemas and stored history remain backwards compatible unless a prompt
   explicitly names a versioned migration.

### Prerequisites and blockers

- CJP-0 must pin the live Codex behavior matrix before implementation. Documentation alone
  is insufficient for timing-sensitive Steering behavior.
- The worktree currently contains user-owned untracked `.agents/` and `AGENTS.md`. Preserve
  both. Do not modify, stage, or commit them during STS unless the user explicitly confirms
  they are intended repository files. If not confirmed, milestone wrap records the current
  state in tracked planning/DEVLOG documents without absorbing those files.
- Steering needs a stable turn identity and persisted follow-up ledger before UI work.
- Subagent Steering depends on the root turn mailbox, not a second transport.
- Code Mode cannot leave its spike prompt until a sandbox design passes the stated threat
  gate; Node `vm` alone is not accepted as a security boundary.
- Live Codex conformance, Electron GUI, provider-keyed, GitHub, MCP-auth, and browser-CDP
  checks may require owner interaction. Missing live evidence is recorded as
  `user-verification-needed`; the word “parity” remains candidate until it passes.

### Milestones and approval cuts

| Milestone | Prompts    | Deliverable                                           | Dependency        | Recommended release cut               |
| --------- | ---------- | ----------------------------------------------------- | ----------------- | ------------------------------------- |
| M0        | CJP-0      | Dated Codex/Lamprey baseline and conformance fixtures | none              | documentation only                    |
| M1        | ST-1–ST-12 | Full Steering + Queue behavior                        | M0                | v0.20.0                               |
| M2        | TC-1–TC-7  | Model- and user-facing task/thread control suite      | M1                | v0.21.0                               |
| M3        | VA-1–VA-6  | Inline visualizations + direct artifact editing       | M1                | independent minor                     |
| M4        | CM-1–CM-6  | Sandboxed Code Mode orchestration                     | M1, threat gate   | independent minor; OFF by default     |
| M5        | PR-1–PR-6  | PR Chat and patch review workflow                     | M1                | independent minor                     |
| M6        | MR-1–MR-5  | MCP resources, templates, and session auth            | M1                | independent minor                     |
| M7        | BD-1–BD-6  | Browser Developer Mode                                | M1                | independent minor; OFF by default     |
| M8        | GA-1–GA-6  | Model-callable automations + operational goals        | M1                | independent minor; loops remain gated |
| M9        | CJP-WRAP   | Current-parity ledger, docs, and honest-gaps closeout | M1–M8 as approved | no forced version bump                |

M1 is mandatory and first. M2–M8 are independently approvable. “Approve all and run STS”
authorizes them in dependency order; approval of M1 alone does not authorize later
milestones.

### Scope

- Turn lifecycle, identities, follow-up persistence, IPC, preload, renderer store, composer,
  event spine, settings, and task/subagent wait integration for Steering and Queue.
- Task/thread inspection, waiting, messaging, steering, interrupting, historical forking,
  and lifecycle metadata tools.
- Persistent inline visualization and artifact-revision primitives.
- A sandboxed JavaScript orchestration surface over registered Lamprey tools.
- Chat-connected GitHub PR review and patch workflow.
- MCP resource/template discovery, reads, and authenticated-session lifecycle.
- CDP-backed browser developer inspection with explicit trust controls.
- Model-callable automation management and operational goal lifecycle, reusing loops.
- Tests, conformance playbooks, architecture documents, DEVLOG entries, release notes, and
  per-milestone versioning.

### Explicit non-goals

- No refresh of Claude Code parity inside this PSPR. It needs a separate dated audit so
  Claude changes cannot destabilize the Codex Steering critical path.
- No automatic migration of an ordinary turn into multi-agent mode.
- No “Steering by prompt injection,” no polling the database from the system prompt, and no
  second chat execution seam.
- No implicit cancellation of shell processes or background terminals when a turn is
  interrupted; process cleanup remains an explicit action.
- No silent conversion of rejected or stale Steer input into a new turn or queued message.
- No unrestricted JavaScript `require`, Node built-ins, filesystem, process, environment,
  or direct network access in Code Mode.
- No full desktop Computer Use, Chrome-profile takeover, remote SSH/control, or local↔remote
  handoff in core. These remain privileged plugin candidates.
- No Office/Sites implementation in core. Documents, PDFs, spreadsheets, presentations,
  and Sites remain plugin-backed artifact suites.
- No Record and Replay in this roster. It remains a separate skill/plugin PSPR after the
  browser and artifact contracts stabilize.
- No rewrite of historical plans or DEVLOG entries. Corrections are appended.

### Verification gates

Every implementation prompt must pass before commit:

1. `npx tsc --noEmit -p tsconfig.node.json`
2. `npx tsc --noEmit -p tsconfig.web.json`
3. `npx vitest run <affected tests>` with zero unexpected skips
4. Any prompt touching `electron/ipc/chat.ts`:
   `npm run verify:proof -- --no-tests` exits 0
5. Any migration prompt: exact DDL/query-shape tests under `node:sqlite`, plus native DB
   tests confirmed to RUN rather than skip
6. Any prompt changing prompts, provider dispatch, or tool-round construction: relevant
   prompt-byte guards plus `PLANNING/LL_SMOKE_PLAYBOOK.md` impact assessment
7. Any renderer milestone: `npm run build`, `npm run smoke:renderer`, and the named GUI
   playbook steps; source-lock tests support wiring claims but do not replace GUI evidence
8. Every milestone wrap: `npm run lint`, both TypeScript checks, full `npx vitest run`,
   `npm run build`, and `npm run verify:proof`

Steering has an additional parity gate: every case in §1 must pass both Lamprey's automated
contract suite and the dated live Codex-vs-Lamprey conformance playbook. If owner-run Codex
evidence is unavailable, M1 may be labeled implementation-complete but not parity-complete.

### Commit, branch, and worktree discipline

- One focused commit per prompt; no batching across prompt IDs.
- Present-tense imperative subject, no co-author trailer, and the required owner footer:
  `Authored and reviewed by Basho Parks, copyright 2026`.
- Append a DEVLOG entry per prompt with files, actual gate output, honest skips/gaps, and SHA.
- Recommended branches: `codex/steering-parity`, then one `codex/cjp-<milestone>` branch per
  later milestone. Separate worktrees are mandatory for parallel sessions.
- No parallel implementation before ST-12. After M1, only milestones without an explicit
  dependency may run concurrently, each in its own worktree and Git index.
- No push unless the user explicitly authorizes it. An explicit “commit and push all” is
  durable for the approved STS scope.

### Completion criteria

- Every approved prompt is checked, gated, logged, and committed in dependency order.
- M1's normative Steering matrix is fully passing with live evidence.
- Every shipped capability has a real call-site citation in `ARCHITECTURE/`, a discoverable
  user surface, risk metadata, cancellation, audit events, and negative-path tests.
- `CJ26_AFTER.md` distinguishes complete, partial, parked, and owner-verification-needed
  claims. No blanket “Codex parity” claim is allowed while any approved matrix row is open.
- Every milestone ship updates README, tracked current-state documentation, DEVLOG, and the
  package version chosen at its approval gate.

### Approval state

- **APPROVED FOR M0 + M1** — STS began 2026-07-17. Execute CJP-0 and ST-1
  through ST-12 sequentially, one gated prompt/commit at a time. Stop before M2.
- **APPROVED FOR M2** — STS began 2026-07-18. Execute TC-1 through TC-7
  sequentially, release v0.21.0, update governance, push, and run Bucket.

---

## §1 — Normative Steering and Queue contract

The following is acceptance authority for M1. CJP-0 may refine a timing detail only when a
dated official source or reproducible live Codex trace proves the correction; such a change
must be shown to the user before implementation.

1. **Same in-flight turn:** Steer appends user input to the current ordinary turn without
   creating another turn or emitting a second turn-start event.
2. **Separate next-turn queue:** Queue stores input for the next turn and never injects it
   into the current one.
3. **Stable identity:** every running turn has `turnId`; steer requires
   `expectedTurnId`. No active turn or a mismatch returns a typed, visible error.
4. **Idempotent client identity:** optional `clientUserMessageId` is echoed through the
   user-message event and deduplicates retries.
5. **Input parity:** text, image, and local-image items preserve order and attachment
   metadata; unsupported input fails before persistence.
6. **No settings override:** a steer message cannot change model, workspace, approval mode,
   sandbox, skill set, or turn kind.
7. **Safe delivery boundary:** input reaches the next safe agent boundary inside the same
   turn. It does not preempt a mutating tool midway through its side effect.
8. **Streaming race behavior:** steer submitted while output is streaming follows the exact
   behavior pinned by CJP-0, with no dropped, duplicated, or post-completion message.
9. **Tool-wait behavior:** steer submitted while a tool runs is retained and consumed before
   the next model dispatch in the same turn.
10. **Agent-wait behavior:** steer wakes the root agent when it is waiting on subagents and
    can target a steerable child without starting a sibling task.
11. **Non-steerable kinds:** review, manual compaction, terminal, completed, cancelled, and
    other kinds found non-steerable by CJP-0 reject visibly and keep the input as an editable
    draft. There is no silent queue/new-turn fallback.
12. **Composer remains usable:** while a turn runs, the user can compose and submit follow-up
    input; Stop remains a separate control.
13. **Configurable default:** General settings chooses Steer or Queue as follow-up default;
    the alternate action and exact keyboard mapping match the CJP-0 Codex trace.
14. **Queue management:** queued items appear above the composer and support edit, reorder,
    send-now, and delete. Ordering is deterministic.
15. **Durability:** queued items survive renderer reload, application restart, and remote
    reconnect. Orphaned active turns settle honestly on restart; their undelivered steer
    items remain recoverable drafts rather than pretending to have been delivered.
16. **Interrupt separation:** interrupt settles the turn as interrupted but does not
    implicitly kill background terminals. Steering never aborts the whole turn.
17. **Root and child attribution:** every follow-up records actor, source conversation/task,
    target turn/agent, delivery mode, timestamps, and final disposition.
18. **Audit/event truth:** accepted, queued, reordered, edited, delivered, rejected,
    deleted, interrupted, and recovered states emit bounded events without attachment bytes
    or secrets.
19. **One seam:** interactive sends, queued next turns, loops, wake-ups, and resumed work all
    enter through `runHeadlessTurn`; no alternate provider-dispatch path is introduced.
20. **Failure visibility:** every accepted follow-up reaches `delivered`, `rejected`,
    `cancelled`, or `recovered`; none remains silently stranded.

---

## §2 — Reuse ledger

| Capability              | Current Lamprey substrate                                            | Decision                                                                          |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Turn execution          | `electron/ipc/chat.ts` `runHeadlessTurn` / `runChatRound`            | **Extend at the seam** with `TurnRuntime`; do not duplicate dispatch              |
| Cancellation            | `activeAbortControllers`, `chat:cancel`                              | **Extract/extend** into turn runtime; preserve cancel behavior                    |
| Conversation history    | `conversation-store.ts`, messages/events                             | **Extend** with turn/follow-up identity and lineage                               |
| Attachments             | existing chat attachment/RAG/image metadata                          | **Reuse** canonical input shapes; no new blob store unless CJP-0 proves necessary |
| Event spine             | `event-log.ts`, `chat-events.ts`                                     | **Extend** with bounded turn/follow-up events                                     |
| Agent tasks             | `agent_runs`, `tasks:*`, identities, receipts, kill                  | **Reuse/extend** for wait, steer, descendants, and task tools                     |
| Cross-session messaging | `send_to_session`, async event bridge                                | **Extract common delivery service**; keep next-turn semantics as Queue            |
| Spawn/fork              | `spawn_task`, conversation fork, worktrees                           | **Extend** with turn lineage and fork-at-turn                                     |
| Tool authority          | `tool-registry.ts` risks/approval/cancel/audit                       | **Reuse without bypass** for every new tool and Code Mode nested call             |
| Artifacts               | `create_document`, artifact sandbox, Mermaid/HTML/SVG/JSX            | **Extend** with persistence, inline items, revisions, and annotations             |
| GitHub                  | existing PR panel, diff/check/comment services                       | **Extend** into chat and patch lifecycle; do not replace the panel                |
| MCP                     | manager connection + tool discovery/calls                            | **Extend** with resources/templates/auth; preserve tool behavior                  |
| Browser                 | WebContentsView manager, selectors, screenshot, read-only evaluation | **Extend** via CDP with an explicit developer-mode gate                           |
| Automations             | CRUD IPC/store, cron runner/history                                  | **Wrap as model tools**, then add trigger kinds incrementally                     |
| Goals/loops             | persisted goal tools, loop/wakeup engine                             | **Bridge** operational lifecycle to loops; loops remain independently gated       |
| Node REPL MCP           | existing default MCP server                                          | **Do not relabel as Code Mode**; preserve as a separate capability                |
| Deleted pipeline        | historical code/docs only                                            | **Do not rebuild**                                                                |

Genuinely new work: persistent turn/follow-up ledger, live turn mailbox and wake signal,
Codex-like queue UX, task wait/control tools, persistent visualization revision model,
sandboxed tool-composition runtime, PR patch acceptance ledger, MCP resource/auth surface,
CDP observation service, and event/monitor automation triggers.

---

## §3 — Sequential Prompt Roster

### M0 — Current baseline

#### **CJP-0 — Pin the July 2026 behavior and wiring baseline**

- [x] Create `PLANNING/CJ26_BASELINE.md` with: dated official source/version ledger;
      old-plan claim-vs-current-source matrix; current tool inventory; exact call sites;
      and Codex conformance traces for Steering during streaming, tool execution,
      subagent wait, completion race, stale target, non-steerable turn, attachments,
      queue reorder/edit/delete, restart, and interrupt/background-terminal behavior.
- [x] Inventory every current Lamprey partial equivalent and mark `reuse`, `extend`,
      `replace`, `new`, or `parked`; record tool-schema and system-prompt byte baselines.
- [x] Write `PLANNING/CJ26_SMOKE_PLAYBOOK.md` with configuration, expected signals,
      evidence capture, and explicit owner-run steps.
- Files: planning documents only.
- Verify: every behavior claim has an official URL or reproducible trace; every Lamprey
  claim has a file:line citation; no code changes.

### M1 — Steering and Queue parity

#### **ST-1 — Define canonical turn and follow-up contracts**

- [x] Add pure types and validators for `TurnId`, turn kind/status, ordered input items,
      delivery mode, follow-up status, typed rejection reasons, expected-turn guard, and
      client-message deduplication. Keep API naming consistent across main/preload/renderer.
- Files: new `electron/services/turn-control-types.ts`, validator/tests, renderer mirrors.
- Verify: table-driven validator tests cover all §1 input and rejection shapes; tsc ×2.

#### **ST-2 — Persist turns and follow-ups with migration v21**

- [x] Add additive `conversation_turns` and `turn_followups` tables with indexes and exact
      input JSON versioning. Preserve ordered Queue positions, client IDs, target IDs,
      status transitions, and recovery metadata. No rewrite of messages or agent tables.
- Files: `db-migrations.ts`, schema module, store, `schema-init` coverage.
- Verify: exact DDL/query tests under `node:sqlite`; native store migration tests RUN;
  restart/dedup/reorder/state-machine tests; tsc node.

#### **ST-3 — Replace the abort map with a TurnRuntime registry**

- [x] Extract `ActiveRun` into a service owning `turnId`, correlation ID, controller,
      kind/status, steer inbox, wake signal, active agent target, and settlement. Provide
      one registration/lookup/settle API for normal chat, research, loops, and wake-ups.
- [x] Preserve current cancellation, ghost-reply, pending-document, and cleanup semantics.
- Files: new `turn-runtime.ts`; focused changes in `electron/ipc/chat.ts` and loop seams.
- Verify: runtime race/cleanup tests; existing turn-settlement and loop-wiring suites;
  `verify:proof -- --no-tests`; tsc ×2.

#### **ST-4 — Add typed Steer, Queue, and queue-management IPC**

- [x] Add `turn:steer`, `turn:queue`, `turn:listFollowups`, `turn:updateFollowup`,
      `turn:reorderFollowups`, `turn:sendFollowupNow`, and `turn:deleteFollowup` handlers.
- [x] Enforce `expectedTurnId`, steerable kind, idempotency, input validation, envelope
      shape, and no silent fallback. Queue handlers operate without an active runtime.
- Files: new `electron/ipc/turn-control.ts`, handler registration, preload/types/tests.
- Verify: IPC contract/negative tests; envelope source-lock; tsc ×2.

#### **ST-5 — Consume Steering inside the active turn**

- [x] Drain accepted steer input at the CJP-0-pinned safe boundaries, append canonical user
      input items to the same API transcript, persist/emit the user item once, and continue
      the same `turnId` without another turn-start event.
- [x] Cover streaming, tool-running, completion-race, provider error, and duplicate-client-ID
      cases. A mutating tool is never interrupted midway by Steering.
- Files: `chat.ts`, provider transcript helpers as needed, turn runtime/store/tests.
- Verify: deterministic multi-round harness tests for all §1 timing cases; existing FC and
  ghost-reply suites; prompt-byte guard; `verify:proof -- --no-tests`; tsc ×2.

#### **ST-6 — Wake and target waiting subagents**

- [x] Thread the turn wake signal through current agent-run, strategy, and multi-agent wait
      points so root Steering interrupts a wait and child Steering targets the selected
      steerable run. Preserve identity, grants, budget, kill, and receipt enforcement.
- [x] A child that has already completed rejects; no sibling task is synthesized.
- Files: turn runtime, `subagent-runner.ts`, agent strategy/wait services, tests.
- Verify: wait-interruption, target-attribution, completed-child rejection, budget/kill
  regression tests; tsc ×2.

#### **ST-7 — Separate interrupt and recovery semantics**

- [x] Give interrupt a turn-aware expected-ID contract, settle status/events exactly once,
      and preserve background terminals. On startup, settle orphan running turns and expose
      undelivered steer items as recoverable drafts; keep Queue items ordered.
- Files: turn runtime/store, `chat:cancel` compatibility adapter, startup recovery/tests.
- Verify: cancel/interrupt race matrix, restart recovery, no-background-process-cleanup
  source lock, ghost-reply and turn-settlement suites; tsc ×2.

#### **ST-8 — Add renderer state and reconnect reconciliation**

- [x] Replace the single global streaming lock with per-conversation active-turn state.
      Hydrate/reconcile active turn and Queue state through preload without leaking a prior
      conversation's state during navigation or reload.
- Files: `src/stores/chat-store.ts`, renderer types, preload event subscriptions, pure
  follow-up queue state module/tests.
- Verify: state-transition tests for switch/reload/reconnect/stale events; current JM-21
  regression locks; tsc web.

#### **ST-9 — Ship the Codex follow-up composer UX**

- [x] Keep the composer editable while a turn runs. Add Follow-up behavior setting
      (Steer/Queue), exact alternate shortcut from CJP-0, clear action labeling, separate
      Stop, and input-type support.
- [x] Render queued items above the composer with edit, reorder, send-now, and delete;
      rejected Steer remains an editable draft with the reason shown.
- Files: `ChatInput.tsx`, queue components, settings store/defaults/UI, styles/assets/tests.
- Verify: default-settings parity lock, pure queue reducer tests, accessibility/source-lock
  tests, build + renderer smoke, CJP smoke cases; tsc ×2.

#### **ST-10 — Complete turn activity and audit truth**

- [x] Add bounded events for every §1 disposition and show accepted/delivered/queued/rejected
      progress without duplicate user bubbles. Activity items carry IDs/status/counts, never
      attachment bytes, secrets, or raw local paths beyond existing redaction policy.
- Files: event log/types, ActivityFeed/tool activity components, tests.
- Verify: event order/payload/redaction tests; UI wiring source-lock; tsc ×2.

#### **ST-10A — Deliver queued follow-ups through the real next-turn seam**

> **Conformance addendum (2026-07-18):** ST-11 inventory found that Queue persistence,
> CRUD, and UI were wired, but `TurnControlStore.listQueuedFollowUps()` had no production
> caller. Queued input therefore never became the next turn. This is a real mismatch with
> §1 rows 2, 14, 19, and 20; the original matrix remains unchanged.

- [x] Claim the first queued item in deterministic position order when an ordinary turn
      completes, transition it through accepted/delivered exactly once, persist one user
      message, and execute it through `runHeadlessTurn`. Chain remaining items one turn at
      a time; never call a provider directly or synthesize an alternate execution seam.
- [x] Preserve structured text/image/local-image order in the queued model input while the
      persisted/renderer message remains metadata-safe. An input that becomes unreadable
      before dispatch rejects visibly; later Queue items remain queued.
- Files: queue dispatcher service/tests, `turn-control-store.ts` as needed, focused
  `chat.ts` seam wiring, conformance/source locks.
- Verify: queue claim/order/dedup/failure tests; one-seam source lock; no duplicate user
  message/turn-start; existing Steering/turn-settlement/ghost-reply suites;
  `verify:proof -- --no-tests`; tsc ×2.

#### **ST-10B — Restore native DB skip-accounting truth**

> **Gate-integrity addendum (2026-07-18):** ST-10A's final receipt proved that
> `verify:proof` treated `require('better-sqlite3')` as a successful native load even when
> constructing `new Database(':memory:')` failed with the active Node/Electron ABI mismatch.
> The gate therefore contradicted Vitest's nine honest native-DB skips.

- [x] Make the proof probe construct and close an in-memory database, matching the guarded
      suites' real capability check; keep accounting informational and list the same bounded
      cohort when construction fails.
- [x] Add an end-to-end regression that compares accounting output with the direct
      construction probe so lazy module loading cannot produce another false positive.
- Files: `scripts/verify-proof.cjs`, skip-accounting tests, PSPR, DEVLOG.
- Verify: accounting-only regression; direct probe/output agreement;
  `verify:proof -- --no-tests`; tsc ×2.

#### **ST-11 — Run the complete Steering conformance gate**

- [x] Complete automated contract coverage for all 20 §1 rows and record the exact receipt in
      `PLANNING/CJ26_STEERING_AFTER.md`.
- [ ] Run `CJ26_SMOKE_PLAYBOOK.md` against both current Codex and the built Lamprey app using
      the pinned configuration. Record the paired traces/screenshots/results in
      `PLANNING/CJ26_STEERING_AFTER.md`.
- [x] Any mismatch becomes a new ST prompt addendum; do not weaken the matrix to pass.
- Verify: automated Steering suite green; full build and renderer smoke green. The owner's
  report that Steering works in Lamprey is recorded, but it does not replace the full paired
  replay and therefore does not establish blanket current-Codex parity.

#### **ST-12 — Steering milestone wrap**

- [x] Write `ARCHITECTURE/TURN_CONTROL_AND_STEERING.md` with real invocation sites and state
      machine; update README/current-state docs/DEVLOG; choose and apply the approved next
      release version; run the full milestone gate. List honest gaps explicitly.
- Verify: full gate from §0. The owner explicitly authorized the v0.20.0 release on
  2026-07-18 despite the still-open paired replay. M1 is implementation-complete and shipped;
  “parity-complete” remains withheld.

### M2 — Task and thread controls

#### **TC-1 — Define the canonical task graph**

- [x] Add one read model spanning conversations, parent/child conversation forks,
      `agent_runs`, identities, and turn lineage without merging their storage semantics.
      Define descendant traversal, cursoring, status, and ownership.
- Verify: graph construction/cycle-defense/pagination tests; tsc ×2.

#### **TC-2 — Add list, read, and bounded wait tools**

- [x] Register `list_tasks`, `read_task`, and `wait_tasks` as read-risk tools. Wait supports
      one or many targets, cursors, bounded timeout, cancellation, and Steering wake-up;
      it does not busy-poll or monopolize the main process.
- Verify: schema coverage, cursor/wake/timeout/cancel tests, lazy-tool discovery tests.

#### **TC-3 — Add send, steer, queue, and interrupt task tools**

- [x] Replace duplicated delivery logic beneath `send_to_session` with a shared service and
      add `send_to_task` delivery modes plus `interrupt_task`. Steer routes through M1 and
      requires expected turn identity; Queue preserves next-turn semantics.
- Verify: target/race/attribution/approval tests; `send_to_session` compatibility tests.

#### **TC-4 — Add historical fork-at-turn**

- [x] Extend conversation fork/worktree metadata so `fork_task` can branch history through a
      specified completed turn and retain a backlink to the source task/turn.
- Verify: history-boundary, invalid-turn, worktree-isolation, and backlink tests.

#### **TC-5 — Add lifecycle metadata tools**

- [x] Add title, pin, archive, close, and optional permanent-delete operations using distinct
      risk levels. Delete requires explicit destructive approval and descendant impact
      preview; close/archive remain recoverable.
- Verify: risk metadata, descendant cleanup/retention, archive recovery, approval tests.

#### **TC-6 — Surface task graph and activity controls**

- [x] Make parent/child links, live status, unread state, waits, Steering, interrupt, and
      lifecycle actions discoverable in existing sessions/agents/activity UI.
- Verify: UI wiring tests, build/renderer smoke, task-control GUI playbook.

#### **TC-7 — Task-control milestone wrap**

- [x] Architecture doc, README/current-state/DEVLOG/version update, full gate, AFTER matrix.
- Verify: full milestone gate and owner task-control smoke.

### M3 — Inline visualizations and direct artifact editing

#### **VA-1 — Persist artifact identities and revisions**

- [x] Add additive artifact/revision/annotation storage with conversation/message provenance,
      type, sandbox policy, current revision, and export metadata; migrate current ephemeral
      source without invalidating existing document/research artifacts.
- Verify: node:sqlite exact-schema tests, native store tests RUN, retention/provenance tests.

#### **VA-2 — Add visualization and artifact tools**

- [x] Add `create_visualization`, `update_visualization`, `artifact_read`,
      `artifact_update`, and `artifact_annotate` with strict schemas and type-specific
      validation for Mermaid, charts, tables, and sandboxed interactive content.
- Verify: tool schema/risk/size/sanitization/revision-conflict tests.

#### **VA-3 — Render visualizations inline**

- [x] Introduce first-class visualization message items with loading/error/ready states,
      accessible fallback data, expand/open/export actions, and sandbox isolation. Do not
      encode an interactive visualization as untrusted raw chat HTML.
- Verify: renderer wiring tests, CSP/sandbox regression tests, build/renderer smoke.

#### **VA-4 — Add selection editing and inline annotations**

- [x] Let users select Markdown/code/artifact ranges, request revisions in chat, preview a
      diff, and accept/reject without losing the prior revision. Persist annotations and
      actor provenance.
- Verify: range/version-conflict/diff/accept/reject tests and GUI playbook.

#### **VA-5 — Align tool activity and file-opening feedback**

- [x] Apply the July task-activity pattern to visualization generation, artifact edits, and
      file open outcomes with honest queued/running/complete/error states.
- Verify: event-to-UI state tests, no-false-success negative cases, renderer smoke.

#### **VA-6 — Visualization/artifact milestone wrap**

- [x] Architecture doc, README/current-state/DEVLOG/version update, full gate, AFTER matrix.
- Verify: full milestone gate and owner visualization/editing smoke.

### M4 — Sandboxed Code Mode

#### **CM-1 — Complete the sandbox threat model and runtime spike**

- [ ] Compare viable runtimes against escape resistance, Electron/Windows packaging,
      cancellation, deterministic limits, source-map quality, and native-dependency cost.
      Required boundary: no Node/process/env/fs/network/global Electron access.
- [ ] Write `PLANNING/CJ26_CODE_MODE_SPIKE.md`. Stop for approval if no option meets the
      boundary; never ship Node `vm` as the sole boundary.
- Verify: adversarial escape corpus and packaging spike; no production registration yet.

#### **CM-2 — Build the isolated execution engine**

- [ ] Execute bounded JavaScript in the approved isolate with wall-clock, source-byte,
      memory, output, nested-call, and concurrency ceilings plus cancellation.
- Verify: timeout/memory/output/cancel/escape tests and packaged Windows load smoke.

#### **CM-3 — Expose registered tools through one authority-preserving facade**

- [ ] Add `code_exec` behind `codeModeEnabled: false`. Nested `tools.*` calls resolve through
      the normal registry and retain schema validation, risk, approval, plan-mode,
      fallback-provenance, audit, workspace, and abort context.
- Verify: no-bypass tests for every authority layer; lazy-tool discovery and prompt-byte
  default-OFF lock.

#### **CM-4 — Add composition helpers and structured output**

- [ ] Provide Codex-like `text`, `image`, `generatedImage`, `store`, `load`, `notify`, and
      `yield_control`, plus safe parallel composition and bounded persisted temporary state.
      Unawaited operations are cancelled when the isolate ends.
- Verify: parallel ordering, state isolation, yield/progress, image forwarding, and
  unawaited-call cleanup tests.

#### **CM-5 — Add Code Mode activity, approvals, and diagnostics**

- [ ] Show script, nested calls, approvals, progress, limits, failure locus, and final
      outputs without leaking secrets. Add Settings toggle/ceilings and a kill action.
- Verify: redaction/event/UI wiring tests, build/renderer smoke, escape/approval GUI playbook.

#### **CM-6 — Code Mode milestone wrap**

- [ ] Threat model + architecture doc, README/current-state/DEVLOG/version update, full gate,
      packaged Windows smoke, and honest gaps. Keep OFF by default.
- Verify: full milestone gate plus adversarial corpus.

### M5 — PR Chat

#### **PR-1 — Bind PR context to a conversation**

- [x] Extend the current conversation↔PR association so chat receives bounded PR metadata,
      base/head SHAs, file list, checks, review threads, and selected diff context on demand.
- Verify: stale-SHA, pagination, context-budget, and repository-identity tests.

#### **PR-2 — Add PR inspection tools**

- [x] Register read tools for PR summary, files, diff hunks, checks, comments, and patch
      inspection using existing GitHub service/auth. Tool results spill through the normal
      large-result valve.
- Verify: schemas, pagination, redaction, stale/permission/network error tests.

#### **PR-3 — Add review and annotation tools**

- [x] Add inline comment, reply, pending review, submit review, and detached finding flows.
      External writes require normal approval and show the exact target before execution.
- Verify: risk/approval, line mapping, stale-diff, idempotency, and draft-review tests.

#### **PR-4 — Add patch propose/edit/accept/reject**

- [x] Let chat draft a patch against the bound head SHA, render it for editing, and require
      explicit accept before applying through the normal patch/workspace authority. Reject
      is non-mutating; stale head blocks application.
- Verify: patch path confinement, SHA race, accept/reject, rollback, audit tests.

#### **PR-5 — Connect the existing PR panel and chat activity**

- [x] Add “Chat about this PR,” selected-hunk send, patch cards, annotations, check progress,
      and review-submit confirmation without replacing the current panel.
- Verify: UI wiring, build/renderer smoke, live test-repository playbook.

#### **PR-6 — PR Chat milestone wrap**

- [x] Architecture doc, README/current-state/DEVLOG/version update, full gate, AFTER matrix.
- Verify: full milestone gate; owner GitHub smoke with no unintended external review.

### M6 — MCP resources and authenticated sessions

#### **MR-1 — Extend the MCP manager with resources and templates**

- [x] Add capability-aware list/read APIs, cursor pagination, change notifications where
      supported, bounded content handling, and URI validation without changing current tool
      discovery/call behavior.
- Verify: SDK fixture tests for supported/unsupported servers, pagination, timeout/cancel.

#### **MR-2 — Add MCP resource tools**

- [x] Register `list_mcp_resources`, `list_mcp_resource_templates`, and
      `read_mcp_resource`; preserve server provenance and use the spill valve for large text
      or blobs. Binary/image items use canonical content blocks.
- Verify: schemas, lazy discovery, MIME/content, spill, URI/server mismatch tests.

#### **MR-3 — Add authenticated-session and elicitation lifecycle**

- [x] Support hosted-session auth status, reauthorization, user-consent elicitation, expiry,
      reconnect, and actionable errors. Credentials remain in keychain/safe storage and
      never enter prompts/events.
- Verify: auth state machine, cancellation, secret-redaction, reconnect tests.

#### **MR-4 — Surface resources and auth status**

- [x] Extend connector/plugin UI with resources/templates, auth state, reauthorize, and
      safe preview/open actions; expose progress in activity.
- Verify: UI wiring, build/renderer smoke, local fixture-server and hosted-auth playbooks.

#### **MR-5 — MCP milestone wrap**

- [x] Architecture doc, README/current-state/DEVLOG/version update, full gate, AFTER matrix.
- Verify: full milestone gate; owner hosted-auth evidence if available.

### M7 — Browser Developer Mode

#### **BD-1 — Add an explicit CDP session service**

- [x] Attach/detach through Electron's supported debugger/CDP seam with one owner per browser
      target, protocol-version handling, cancellation, and cleanup. Gate behind
      `browserDeveloperModeEnabled: false`.
- Verify: lifecycle/reattach/target-close/version tests; packaged Electron smoke.

#### **BD-2 — Add console and network observation tools**

- [x] Register bounded tools for console events/errors and network request/response metadata,
      filters, cursors, and clear operations. Bodies are opt-in, size-capped, MIME-aware,
      and redacted for auth/cookies/secrets.
- Verify: redaction, cap, pagination, target navigation, and disabled-mode tests.

#### **BD-3 — Add DOM snapshot, runtime, and performance tools**

- [x] Add structured DOM/accessibility snapshot, constrained runtime inspection, layout and
      performance metrics, trace windows, and screenshot annotation references. Do not turn
      this into unrestricted page-world code execution.
- Verify: schema/size/cancel/navigation race and untrusted-page tests.

#### **BD-4 — Enforce domain, approval, and dangerous-action policy**

- [x] Reuse browser/domain trust and tool risk metadata; require explicit approval for body
      capture, sensitive context, or mutation. Extend dangerous-command detection and
      conservative PowerShell inspection before broader control surfaces ship.
- Verify: policy matrix, deny/approval, secret, dangerous-command, uninspectable-AST tests.

#### **BD-5 — Add Developer Mode UI and annotations**

- [x] Show attached target, recording state, console/network progress, captured evidence,
      annotations, clear/detach, and per-site control in the existing browser surface.
- Verify: UI wiring, build/renderer smoke, local test-page playbook.

#### **BD-6 — Browser Developer Mode milestone wrap**

- [x] Architecture/security doc, README/current-state/DEVLOG/version update, full gate,
      AFTER matrix. Keep OFF by default.
- Verify: full milestone gate and owner browser-CDP smoke.

### M8 — Model-callable automations and operational goals

#### **GA-1 — Wrap existing automation CRUD as tools**

- [x] Add `automation_list`, `automation_update`, `automation_delete`, and
      `automation_run_now` over the existing store/runner. Mutations require appropriate
      approval; the tool cannot invent raw internal scheduler directives.
- Verify: schema/risk/approval/CRUD/run-history tests and UI compatibility.

#### **GA-2 — Add one-shot, schedule, event, and monitor trigger types**

- [x] Version the automation schema beyond cron while preserving existing rows. Define
      deterministic next-run, deduplication, retry, missed-run, and disabled semantics for
      each trigger kind.
- Verify: node:sqlite migration tests, fake-clock trigger matrix, restart/dedup tests.

#### **GA-3 — Make goal lifecycle operational**

- [x] Extend current goal records/tools with edit, pause, resume, clear, abort, budget usage,
      blocker, completion, and elapsed-time semantics. User/system-controlled states remain
      distinct from model-requested transitions.
- Verify: state-machine/authority/persistence/restart tests.

#### **GA-4 — Bridge goals and automations to the loop engine**

- [x] A goal may own a bounded loop/backlog and an automation may wake it through the single
      turn seam. `loopsEnabled` remains an outer gate at every entry point; automation/goal
      ceilings may tighten but never raise loop ceilings.
- Verify: loop-safety source lock, ceiling composition, pause/abort/restart tests,
  `verify:proof -- --no-tests` if chat seam changes.

#### **GA-5 — Surface management, progress, and reminders**

- [x] Extend existing Automations and Plan/Goal surfaces with trigger kind, next run,
      progress, budget, pause/resume/abort, reminders, and honest blocked/completed states.
- Verify: UI wiring, fake-clock state tests, build/renderer smoke, automation/goal playbook.

#### **GA-6 — Automation/goal milestone wrap**

- [x] Architecture doc, README/current-state/DEVLOG/version update, full gate, AFTER matrix.
- Verify: full milestone gate and owner background/restart smoke.

### M9 — Initiative closeout

#### **CJP-WRAP — Publish the dated parity ledger and follow-on boundary**

- [x] Write `PLANNING/CJ26_AFTER.md` with every CJP-0 row marked complete, partial, parked,
      superseded, or owner-verification-needed; include exact releases, settings, tests,
      skips, GUI traces, and commit SHAs.
- [x] Update `PLANNING/README.md` to identify this PSPR as the current Codex parity authority
      and the June documents as historical, without rewriting them.
- [x] Record dedicated follow-on PSPR candidates for: Claude Code refresh; Record and Replay;
      Computer Use/Chrome; remote control/handoff; and Office/PDF/Sheets/Slides/Sites plugins.
- [x] Run the full repository gate and append the final DEVLOG closeout. Do not claim blanket
      parity beyond the dated matrix.
- Verify: full §0 milestone gate; documentation link/source audit; all approved prompts
  closed with real SHAs and honest gaps.

---

## §4 — Decision menu for approval

The user should answer these when approving. Recommended defaults are first.

1. **Approval scope:** M0+M1 Steering first, then stop for review (**recommended**); M0–M3;
   or all M0–M9 STS.
2. **Release strategy:** one minor release per milestone (**recommended**) or one combined
   release after all approved milestones.
3. **Follow-up default on fresh installs:** Steer (**recommended, Codex-like**) or Queue.
   Existing installs receive the same default unless a migration-preservation decision is
   recorded in ST-9.
4. **Rejected Steer behavior:** keep as editable draft (**recommended**) or explicitly offer
   one-click Queue; never auto-convert.
5. **Code Mode:** include M4 behind OFF-by-default threat gate (**recommended**) or defer M4
   to a dedicated PSPR.
6. **Task deletion:** include permanent delete behind destructive approval
   (**recommended**) or ship close/archive only.
7. **Untracked project instructions:** may STS update/stage the current untracked
   `AGENTS.md` and `.agents/` when milestone documentation requires it, or must those paths
   remain untouched?
8. **Version target:** permit ST-12 to choose the next available minor from the then-current
   mainline (**recommended**) or pin a specific version now.

---

## §5 — Parked scope ledger

| Candidate                                   | Why parked                                                       | Unparking condition                                              |
| ------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Claude Code 2026 parity refresh             | Separate vendor baseline; avoids destabilizing Steering          | Dedicated dated research + PSPR approval                         |
| Record and Replay                           | Depends on stable browser observation and artifact/skill formats | M3 and M7 complete, then skill/plugin PSPR                       |
| Computer Use / Chrome profile               | High privilege and privacy boundary                              | Dedicated threat model, explicit user approval, plugin isolation |
| Remote SSH/control and local↔remote handoff | Host authority, credentials, Git/worktree transfer               | Dedicated protocol/security PSPR                                 |
| Documents/PDF/Sheets/Slides/Sites           | Large dependency/UI surface unrelated to core turn control       | Common artifact API complete; installable plugin plans           |
| Global cross-project semantic search        | Valuable product feature, not required for Steering/tool parity  | Separate retrieval/privacy plan                                  |

Parked means named and deliberately excluded, not forgotten and not authorized.

---

## §6 — Approval record

On approval, append—do not silently rewrite—the user's exact scope decisions here:

```text
APPROVED: <date>
Milestones: <M0...>
Decisions: <1...8>
STS instruction: <exact user wording>
Branch/worktree: <resolved path>
```

```text
APPROVED: 2026-07-17
Milestones: M0 / CJP-0 only for this execution tranche; stop before ST-1.
Decisions: 1 = one enhancement at a time, interpreted conservatively as CJP-0 only now;
  2-8 = unresolved and not consumed by CJP-0; untracked AGENTS.md and .agents/ remain
  untouched; push is not authorized.
STS instruction: "C:\Users\17076\Documents\Claude\Lamprey Harness\PLANNING\LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md" Approved to run STS. Only ONE enhancement at a time.
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

```text
APPROVED: 2026-07-18 (M5 PR Chat tranche)
Milestones: M5 / PR-1 through PR-6; execute sequentially with one focused commit per prompt.
Publication: not authorized by this instruction; stop after the local M5 wrap unless separately
  directed to push, release, or run Bucket. M4 remains unapproved and is not a dependency of M5.
STS instruction: "Continue to STS M5 PR-1–PR-6 now"
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

```text
APPROVED: 2026-07-18 (M3 + M5 source publication and governance closeout)
Milestones: publish the complete VA-1 through VA-6 and PR-1 through PR-6 commit chains.
Decisions: commit governance/public-page copy and push the full branch directly to origin/main;
  update the GitHub repository About description; enforce the no-AI-slop/no-smelly-code rule;
  include plain-language public notes and the canonical owner footer.
Release boundary: source publication only. No tag, Bucket run, CDN update, binary upload, or
  v0.23.0 GitHub release is authorized; packaged downloads remain the verified v0.21.0 set.
Instruction: "Commit and push all to main, update governance docs and github repo page accordingly."
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

```text
APPROVED: 2026-07-18 (M2 task-control tranche)
Milestones: M2 / TC-1 through TC-7; stop before M3.
Decisions: release v0.21.0; update all governance documents; commit and push the
  completed milestone; run Bucket to update R2, GitHub release artifacts, and CDN.
  Existing untracked .agents/ remains preserved and unstaged.
STS instruction: "Run the next major session STS. When complete, release v0.21.0 and
  update all governance docs, and Bucket to update R2, etc."
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

```text
APPROVED: 2026-07-18 (M3 visualization/artifact tranche)
Milestones: M3 / VA-1 through VA-6; execute sequentially with one focused commit per prompt.
Publication: not authorized by this instruction; stop after the local M3 wrap unless separately
  directed to push, release, or run Bucket.
STS instruction: "Continue STS: M3 — Inline visualizations and direct artifact editing"
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

### M2 pre-publication correction — 2026-07-18

The release tag was deliberately withheld after the first post-push Ubuntu coverage job
reported two provider-registry failures. Root cause was cache identity keyed only by
`settings.json` mtime across different profile paths. `electron/services/providers/registry.ts`
now keys the base-URL override, custom-provider, and custom-model caches by path plus mtime;
the deterministic same-mtime/two-profile regression passes 41/41 under the focused suite.
The linked provider failures disappeared in the full Windows coverage reproduction. Its
only remaining failure was the separately documented Windows real-time-scanning timeout in
the 210-file memory stress case. No v0.21.0 tag or public artifact existed before this
correction; Bucket resumes only from the corrected commit.

### M2 publication receipt — 2026-07-18

`v0.21.0`, `origin/main`, and the release checkout all resolve to corrected commit
`d172586a1b76cab87bcdae51af3d790c6202f416`. The public GitHub release is published with
the Windows installer/ZIP/updater pair plus the macOS arm64 DMG and Linux x64 AppImage.
R2 object HEAD and CDN HTTP HEAD independently verified all four public downloads at the
published byte lengths after cache purge. Bucket's known multi-file GitHub 404 was
recovered by uploading the installer and ZIP individually and then clobbering the updater
blockmap/manifest with the matching local pair. M2 is released; M3 remains unauthorized,
and the packaged owner GUI playbook remains `USER-VERIFICATION-NEEDED` rather than parity
evidence.

```text
APPROVED: 2026-07-18 (release override)
Milestones: finish M1 at ST-12; stop before M2.
Decisions: release as v0.20.0; commit and push to main; run Bucket; update the public
  repository page and governance; use the owner footer for new documents and commits.
  The open paired Codex/Lamprey replay remains an explicit evidence gap, not a release block
  and not a parity pass.
STS instruction: "Commit and push to Main. This is a major version update: v0.20.0"
  followed by the full Bucket and governance instruction.
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

```text
APPROVED: 2026-07-17 (scope clarification)
Milestones: M0 + M1; CJP-0 and ST-1 through ST-12; stop before M2.
Decisions: 1 = full Steering milestone; 2 = one M1 minor; 3 = Steer default;
  4 = rejected Steer remains an editable draft; 5-6 = outside approved scope;
  7 = untracked AGENTS.md and .agents/ remain untouched; 8 = ST-12 selects the
  next available minor. Execute one prompt and one gated commit at a time.
STS instruction: "No, what I want is ALL of these done. STS" followed by the
  complete §1 Normative Steering and Queue contract reproduced in this plan.
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

### M3 + M5 source publication receipt — 2026-07-18

`origin/main` accepted the complete VA-1 through VA-6 and PR-1 through PR-6 chains plus the
source-publication governance commit at `b4ba3e2`. The pre-push proof gate passed lint, both
TypeScript projects, 2717 tests with 162 explicitly reported skips and zero failures, bundle
smoke, and renderer smoke. The GitHub repository About description was updated and read back
through the authenticated API. The untracked `.agents/` skill library remained outside the
published scope.

This is a source publication only. No v0.23.0 tag, Bucket run, CDN update, binary upload, or
GitHub release was performed. Packaged downloads remain v0.21.0, and the disposable PR Chat
plus packaged artifact GUI playbooks remain `USER-VERIFICATION-NEEDED`.

---

Authored and reviewed by Basho Parks, copyright 2026

### M3 + M5 source publication correction — 2026-07-18

The first source-push CI run (`29667235683`) passed its Windows coverage job but exposed one
real Ubuntu failure: host-native `path.isAbsolute` did not recognize a Windows drive path.
`validatePrPatchPaths` now applies the explicit POSIX and Windows absolute-path classifiers
before resolving beneath the current workspace. The focused host and Electron-runtime gates
pass, and the existing traversal/rollback authority remains unchanged.

```text
APPROVED: 2026-07-18 (v0.23.0 production release override)
Milestones: productionize the completed M3 and M5 tranches; do not start M4 or M6–M9.
Decisions: update release and governance records, commit and push to main, run the full
  Bucket pipeline, publish all platform artifacts, update the GitHub release, and verify R2
  plus CDN delivery. Preserve the untracked .agents/ library outside the public commit.
STS instruction: "This needs full Bucket treatment and production. Push to main and get to
  bucketing please."
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

### M3 + M5 production publication receipt — 2026-07-18

Release commit `da8744160de02659ae974b2d0f451b41e741584b`, `origin/main`, and annotated tag
`v0.23.0` aligned before publication. Bucket built the Windows installer, portable ZIP,
blockmap, and updater manifest; published the six-asset GitHub release; mirrored the Windows,
macOS, and Linux downloads to R2; and purged Cloudflare. Tag workflow `29668900892` completed
successfully on the release commit. Independent R2 HEAD and CDN HEAD checks returned exact
byte lengths and HTTP 200 for all four public platform downloads.

The first GitHub inventory check exposed a race-reconciliation defect: the tag workflow's
Windows assets had the expected names but different bytes from the local installer described
by `latest.yml`. The four Windows assets were clobbered individually with the matching local
set, then size and SHA-256 equality were verified. Bucket now requires matching name, size,
and available digest before treating a failed upload as a harmless workflow race. The
disposable GitHub and packaged GUI playbooks remain `USER-VERIFICATION-NEEDED`; M4 and M6–M9
remain unapproved.

---

Authored and reviewed by Basho Parks, copyright 2026

### Owner sequencing decision and M6 STS authorization — 2026-07-18

```text
APPROVED: 2026-07-18 (M6 MCP resources and authenticated sessions tranche)
Milestones: M6 / MR-1 through MR-5; execute sequentially with one focused gated commit per
  prompt. Begin at MR-1 and stop after the local MR-5 wrap.
Decisions: M4 / CM-1 through CM-6 is parked indefinitely. Do not research, spike,
  implement, schedule, or treat Code Mode as a blocker. M6 is the next parity milestone.
  M7 through M9 remain unapproved. Preserve the historical M4 roster text as written.
Publication: not authorized by this instruction; do not push, tag, release, run Bucket, or
  publish artifacts without a separate owner instruction.
Sequence instruction: "M6 is next" established sequence but was not execution authority.
STS instruction: "STS Authorized"
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

This append-only decision supersedes the earlier recommendation to consider M4 behind an
OFF-by-default threat gate. The CM-1 through CM-6 text remains historical and unchanged;
Code Mode has no unparking condition and is not a dependency or completion blocker for M6
or the remaining separately approved parity milestones.

---

Authored and reviewed by Basho Parks, copyright 2026

### M6 production publication authorization — 2026-07-19

```text
APPROVED: 2026-07-19 (v0.24.0 production release override)
Milestones: productionize the completed M6 / MR-1 through MR-5 tranche; do not start M4 or
  M7 through M9.
Decisions: commit and push the M6 chain to main, run the full Bucket pipeline, publish the
  platform artifacts, update release governance, and verify GitHub, R2, and CDN delivery.
  Preserve the untracked .agents skill library outside the public commit.
STS instruction: "Commit and push to main and Bucket."
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

This instruction supersedes only M6's earlier no-publication boundary. It does not unpark
Code Mode or authorize M7 through M9. The local-fixture and real hosted-provider playbooks
remain evidence gaps and are not converted into parity claims by publication.

---

Authored and reviewed by Basho Parks, copyright 2026

### M6 v0.24.0 production publication receipt — 2026-07-19

Release commit, `origin/main`, and annotated tag `v0.24.0` aligned at
`f7cc742f45f4982d96c5a49caa0c7db71fb70f09` before publication. The pre-push and tag-push
proof gates each passed 2,752 tests with zero failures and 162 explicit skips. Tag workflow
`29679259907` completed successfully on that exact SHA.

Bucket built the Windows installer, ZIP, blockmap, and updater manifest; uploaded Windows,
macOS, and Linux artifacts to R2; and purged Cloudflare. Its GitHub upload encountered the
known workflow race and correctly reported a partial ship because all four Windows assets
were mismatched. The failed step was repaired with one clobber upload, not a Bucket rerun.
Independent verification then matched local size and SHA-256 for all six GitHub assets,
confirmed the four R2 object lengths, and received CDN HTTP 200 with matching content length
for the installer, ZIP, DMG, and AppImage. The local-fixture and hosted-provider playbooks
remain `USER-VERIFICATION-NEEDED`; M4 remains parked and M7–M9 remain unapproved.

---

Authored and reviewed by Basho Parks, copyright 2026

### Owner M7 STS authorization — 2026-07-19

```text
APPROVED: 2026-07-19 (M7 Browser Developer Mode tranche)
Milestones: M7 / BD-1 through BD-6; execute sequentially with one focused gated commit per
  prompt. Begin at BD-1 and continue through the local BD-6 wrap for this session.
Decisions: keep Browser Developer Mode OFF by default; preserve M4 as parked indefinitely;
  do not start M8 or M9. Preserve the untracked .agents skill library outside commits.
Publication: not authorized by this instruction; do not push, tag, release, run Bucket, or
  publish artifacts without a separate owner instruction.
STS instruction: "Commence M7 STS Authorized for entire session"
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

This authorization supersedes M6's earlier M7-unapproved boundary only. It does not unpark
Code Mode, authorize M8 or M9, or convert the future owner browser-CDP smoke into automated
evidence.

---

Authored and reviewed by Basho Parks, copyright 2026

### M7 local completion receipt — 2026-07-19

BD-1 through BD-6 completed sequentially on `codex/steering-parity` with one focused commit
per prompt. Package metadata is `0.25.0`; `browserDeveloperModeEnabled` remains false by
default. Architecture, AFTER, owner-playbook, current-state, and prepared release-note records
are present. The full local milestone gate passed before the BD-6 commit.

The owner-visible browser/CDP procedure remains `USER-VERIFICATION-NEEDED`. M7 is therefore
implementation-complete, not live-parity-complete. No push, tag, release, Bucket run, or
artifact publication was authorized or performed. M4 remains parked indefinitely; M8 and M9
remain unapproved.

---

Authored and reviewed by Basho Parks, copyright 2026

### Owner M8 STS authorization — 2026-07-19

```text
APPROVED: 2026-07-19 (M8 automation and operational-goal tranche)
Milestones: M8 / GA-1 through GA-6; execute sequentially with one focused gated commit per
  prompt. Begin at GA-1 and continue through the local GA-6 wrap for this session.
Decisions: preserve M4 as parked indefinitely; do not start M9. Preserve the untracked
  .agents skill library outside commits.
Publication: not authorized by this instruction; do not push, tag, release, run Bucket, or
  publish artifacts without a separate owner instruction.
STS instruction: "Commence STS of M8 GA-1–GA-6 with my full authorization for this entire session."
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

This authorization supersedes M7's earlier M8-unapproved boundary only. It does not unpark
Code Mode, authorize M9, or convert future owner automation/goal background and restart
smokes into automated evidence.

---

Authored and reviewed by Basho Parks, copyright 2026

### M8 local closeout — 2026-07-19

GA-1 through GA-6 executed sequentially on `codex/steering-parity`, with one focused commit
per prompt: `94be706`, `d08d2ff`, `f1c1f78`, `bb58207`, `0bc81c4`, and the GA-6 wrap commit
recorded in git history. Package metadata is `0.26.0`; `loopsEnabled` remains false by
default. Architecture, AFTER, owner-playbook, current-state, and prepared release-note
records are present.

**Final gate:** lint OK · tsc node+web OK · vitest 2,834 passed / 165 skipped / 0 failed ·
build OK · bundle+renderer smokes OK · `verify:proof --require-smokes` exit 0.

**Honest gaps:** The owner-visible packaged-app background/restart procedure remains
`USER-VERIFICATION-NEEDED`. The proof gate reports 18 ABI-guarded native-DB files among the
165 explicit skips because the local binding is built for Electron rather than Node. M8's
new migration and restart cohorts use Node SQLite and ran without skips. M8 is therefore
implementation-complete, not live background/restart parity-complete. No push, tag, release,
Bucket run, or artifact publication was authorized or performed. M4 remains parked
indefinitely; M9 remains unapproved.

---

Authored and reviewed by Basho Parks, copyright 2026

### M8 publication authorization — 2026-07-19

After the local GA-6 closeout, the owner instructed: “Push to main and bucket this one.”
That instruction authorizes the v0.26.0 release metadata commit, push to `origin/main`,
annotated tag, Bucket artifact publication, GitHub release, R2 mirroring, and CDN purge.
It does not close the owner background/restart playbook or authorize M9.

---

Authored and reviewed by Basho Parks, copyright 2026

### Owner M9 STS authorization — 2026-07-19

```text
APPROVED: 2026-07-19 (initiative closeout)
Milestones: M9 / CJP-WRAP only; execute the dated parity ledger, current planning authority,
  follow-on boundary, full repository gate, DEVLOG closeout, and focused commit.
Decisions: preserve M4 as parked indefinitely; do not convert open owner playbooks into passing
  evidence; preserve the untracked .agents skill library outside commits; no forced version bump.
Publication: not authorized by this instruction; do not push, tag, release, run Bucket, or
  publish artifacts without a separate owner instruction.
STS instruction: "Commence STS with full authorization for this session M9 CJP-WRAP"
Branch/worktree: codex/steering-parity at C:\Users\17076\Documents\Claude\Lamprey Harness
```

This authorization supersedes the M8 publication record's M9-unapproved boundary only. It does
not close any owner playbook, unpark Code Mode, or extend the dated upstream ceiling.

---

Authored and reviewed by Basho Parks, copyright 2026

### M9 initiative closeout — 2026-07-19

CJP-WRAP completed on `codex/steering-parity` without a version bump. `CJ26_AFTER.md`
adjudicates every CJP-0 source, historical-claim, Steering/Queue behavior, and Lamprey-wiring
row. `PLANNING/README.md` names this PSPR as the current dated Codex parity authority, and
`CJ26_FOLLOW_ON_CANDIDATES.md` prevents unapproved successor work from silently entering it.

**Final gate:** build OK · lint OK · tsc node+web OK · 246 test files passed / 15 skipped ·
vitest 2,834 passed / 165 skipped / 0 failed · bundle+renderer smokes OK ·
`verify:proof --require-smokes` exit 0 · documentation link/source audit OK ·
61 referenced commit SHAs resolve · release-tag audit OK · `git diff --check` OK.

**Honest gaps:** Eighteen named native-DB files remain outside host-Node execution because the
installed `better-sqlite3` binding targets Electron's ABI. The paired Steering replay and the
task-control, artifact, PR Chat, MCP, Browser Developer, and automation/goal owner playbooks
remain open. M4 remains parked indefinitely. No push, tag, release, Bucket run, or artifact
publication was authorized or performed by M9.

**Commit:** see Git history (CJP-WRAP).

---

Authored and reviewed by Basho Parks, copyright 2026
