# Task and thread control

**Release:** v0.21.0  
**Database migrations:** v22–v23 (on the v21 turn ledger)  
**Scope:** task inspection, waits, delivery, historical forks, lifecycle, and Activity UI

## Storage boundary

The task graph is a read model. It does not merge conversations, agent runs, identities,
or turns into a replacement table:

| Entity | Canonical store | Graph relationship |
| --- | --- | --- |
| Conversation/task | `conversations` | root or historical `fork` child |
| Agent execution | `agent_runs` | `run` or `child-run` descendant |
| Governed agent | `agent_identities` | conversation-scoped `identity` descendant |
| Interactive execution | `conversation_turns` | conversation-owned `turn` descendant |

`electron/services/task-graph.ts:125` constructs the bounded, cursor-paged projection;
`electron/services/task-graph.ts:313` loads the canonical stores and adds durable unread
event counts. Ownership and root conversation identity are explicit. Descendant traversal
is cycle-defended and bounded.

## Invocation map

| Boundary | Production entry | Responsibility |
| --- | --- | --- |
| Model read/wait | `electron/services/task-control-tool-pack.ts:13`, `:185`, `:218` | `list_tasks`, `read_task`, and cancellable/event-driven `wait_tasks` |
| Model delivery | `electron/services/notifications-tool-pack.ts:42`, `:85`, `:114` | shared Queue/Steer delivery, exact interrupt, compatibility `send_to_session` |
| Shared delivery | `electron/services/task-delivery.ts:49` | validates target and delegates Queue or exact-turn Steering without fallback |
| Historical fork | `electron/services/fork-task.ts:48` | copies history through one completed turn and retains source backlinks |
| Lifecycle tools | `electron/services/task-control-tool-pack.ts:51`, `:85`, `:109`, `:136` | recoverable metadata, bounded delete preview, approval-gated deletion, fork tool |
| Lifecycle service | `electron/services/task-lifecycle.ts:70` | revalidation, active-descendant block, cleanup, and event attribution |
| Renderer IPC | `electron/ipc/tasks.ts:26` and `electron/preload.ts:688` | narrow success/data or success/error bridge; no renderer database access |
| Activity UI | `src/components/activity/TaskControlPanel.tsx:30` | parent/child graph, status, unread, wait, Steering, interrupt, lifecycle controls |
| Existing surface | `src/components/activity/ActivityDashboard.tsx:323` | embeds task controls in Activity rather than creating a parallel task application |

Every model-callable operation remains registered through `tool-registry.ts`. Existing
risk metadata, plan-mode mutation blocking, approval, cancellation, and audit behavior
therefore remain authoritative. Renderer clicks use typed preload IPC and are attributed
to the user; model tool calls are attributed to the model.

## Control semantics

### Wait

`wait_tasks` accepts one to eight targets, an optional cursor per target, and a timeout
capped at five minutes. It subscribes to task lifecycle signals and releases the main
process between events. Steering wakes a waiter. Cancellation returns a distinct
`cancelled` disposition; no SQLite polling loop is used.

### Queue, Steering, and interrupt

Queue is durable next-turn delivery. Steering is same-turn input and requires the exact
running `turnId`. Interrupt also requires that identity. A race or stale identity is a
visible rejection and never converts Steering into Queue. All three routes reuse the M1
turn runtime and its `runHeadlessTurn` seam.

### Historical fork

`fork_task` requires a terminal turn belonging to the source conversation. It copies
messages through that turn's completion boundary, preserves canonical RAG attachments,
and stores both `forked_from_id` and v22 `forked_from_turn_id`. A requested worktree is
newly isolated; the source worktree is never silently shared.

### Lifecycle and deletion

Rename, pin/unpin, archive/restore, and close/restore are recoverable. Migration v23 adds
indexed `conversations.closed_at` so close is not conflated with archive.

Permanent deletion is two-step and fail-closed:

1. preview the exact conversation/run/identity/turn descendants;
2. receive a short-lived token;
3. block if any descendant is active;
4. re-read and compare descendants immediately before deletion;
5. reject stale, mismatched, truncated, or changed previews.

The model tool carries destructive risk and requires approval. The Activity UI shows the
impact and requires a second explicit click.

## Persistence, unread state, and privacy

Unread state is derived from undelivered rows in the existing `async_events` bridge. The
count is a graph projection; delivery remains the established next-turn notification
path. Event records for metadata and deletion contain identifiers, actions, and bounded
counts—not prompt text, task messages, attachment bytes, or file contents.

## Verification boundary

Pure suites cover graph ownership/cycles/pagination, waits, races, shared delivery,
historical boundaries, lifecycle recovery, destructive preview, UI presentation, and IPC
wiring. Exact production DDL and the complete migration registry are also run through
Electron's native SQLite ABI. The packaged GUI playbook is
`PLANNING/CJ26_TASK_CONTROL_PLAYBOOK.md`; until its owner run is recorded, v0.21.0 claims
implementation completion for M2, not blanket current-Codex task-control parity.

---

Authored and reviewed by Basho Parks, copyright 2026
