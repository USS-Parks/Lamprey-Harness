# Turn control, Steering, and Queue

**Release:** v0.20.0

**Database migration:** v21

**Scope:** ordinary chat turns, follow-ups, interruption, and recovery

## What the two controls mean

Steering changes the active turn. It is accepted only for the exact running
`turnId` and is appended to that turn at the next safe model boundary. It does
not cancel a provider request, undo a tool side effect, or start a second turn.

Queue is different. A queued follow-up is a durable next-turn request. The
first queued item is claimed after the current turn completes and is dispatched
through the same `runHeadlessTurn` entry point used by ordinary chat, loops, and
wake-ups.

The renderer keeps these meanings visible. While a turn runs, Enter uses the
configured default and Tab uses the alternate. The v0.20.0 default is Enter to
Steer and Tab to Queue. There is no separate Steer pill. Stop remains its own
compact control.

## Invocation map

| Boundary           | Production entry                                                                | Responsibility                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composer           | `src/components/chat/ChatInput.tsx` → `handleSubmit`                            | Builds one stable client message ID and sends Steer or Queue without clearing a failed draft.                                                     |
| Renderer state     | `src/stores/chat-store.ts` → `submitFollowUp`                                   | Requires the active turn for Steering, calls typed preload IPC, then rehydrates the durable ledger.                                               |
| IPC                | `electron/preload.ts` and `electron/ipc/turn-control.ts`                        | Exposes `turn:steer`, `turn:queue`, list, edit, reorder, send-now, delete, interrupt, and state reconciliation.                                   |
| Validation         | `electron/ipc/turn-control.ts` → `createTurnControlActions`                     | Enforces delivery mode, exact expected turn, target agent state, idempotent client IDs, and typed rejection.                                      |
| Runtime identity   | `electron/services/turn-runtime.ts` → `TurnRuntimeRegistry`                     | Owns one active runtime per conversation, the Steering inbox, steerable child set, wake signals, abort linkage, and exact-once settlement.        |
| Same-turn delivery | `electron/ipc/chat.ts` → `consumeRootSteersAtBoundary`                          | Drains accepted Steering after streaming or a completed tool result, appends it to the current transcript, and continues under the same `turnId`. |
| Queue delivery     | `electron/services/queued-follow-up-dispatch.ts` → `dispatchNextQueuedFollowUp` | Claims the first queued item, persists one user row, and invokes the injected `runHeadlessTurn` seam.                                             |
| Interruption       | `electron/services/turn-interrupt.ts`                                           | Settles the exact active turn, recovers undelivered Steering, and leaves background terminals alone.                                              |
| Presentation       | `src/components/chat/FollowUpQueue.tsx`                                         | Shows pending Steering, ordered Queue items, and recoverable drafts above the composer.                                                           |

## State machines

### Turn

```text
registered/running
  ├─ completed
  ├─ failed
  ├─ interrupted
  └─ recovered after restart
```

Settlement is exact-once. The in-memory runtime is removed even if a durable
write fails; startup recovery then repairs a remaining database row instead of
presenting a dead runtime as active.

### Steering follow-up

```text
validated → accepted → delivered
                 ├─ rejected after a delivery race
                 └─ recovered after interruption, failure, or restart
```

Rejected and recovered items remain editable. Steering never silently becomes
Queue and never falls back to an ordinary new send.

### Queued follow-up

```text
queued → accepted/claimed → delivered → next regular turn runs
   ├─ edited
   ├─ reordered
   ├─ deleted
   └─ send-now → accepted for the exact running turn
```

Queue order is stored, not inferred from renderer order. Restart recovery keeps
queued rows queued.

## Persistence and privacy

Migration v21 adds `conversation_turns` and `turn_followups`. The ledger stores
stable IDs, ordered versioned input, target attribution, positions, timestamps,
and terminal dispositions. SQLite constraints enforce one running turn per
conversation and unique client-message identity.

Activity events contain identifiers, input type names, counts, and outcomes.
They do not contain follow-up text, attachment bytes, data URLs, filenames,
MIME values, or local paths. Event logging is best-effort and cannot change the
real control result.

## Verification boundary

The automated conformance matrix maps all twenty M1 contracts to executable
tests, including races, tool boundaries, child-agent waits, restart recovery,
Queue delivery, and audit redaction. The v0.20.0 release is
implementation-complete. The separate paired Codex/Lamprey desktop playbook is
still open, so this document does not claim blanket current-Codex parity.

---

Authored and reviewed by Basho Parks, copyright 2026
