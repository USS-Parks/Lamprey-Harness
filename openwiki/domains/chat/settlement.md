---
type: Domain
title: Turn Settlement and Finalization
description: Exact-once semantics, status cap, error paths, and the finalizeTurn choreography (v0.29.0 Audit Closure).
tags: [chat, settlement, turn-lifecycle, persistence]
resource: repo://electron/services/finalize-turn.ts
sources:
  - id: openwiki-source-304e54fff0b4e53c3755ff29
    resource: repo://ARCHITECTURE/TURN_CONTROL_AND_STEERING.md
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-aeb398ef7c0dd1c3a2d18c92
    resource: repo://electron/services/finalize-turn.ts
generated: {by: "openwiki/0.3.3", at: "2026-08-23T18:40:37.531Z"}
verified:
  - by: openwiki/0.3.3
    at: 2026-08-23T18:40:37.531Z
---

# Turn Settlement and Finalization

**Version:** v0.30.0 (Operability Debt phase, 2026-08-23)  
**Key release:** v0.29.0 (Audit Closure — honest settlement)  
**Maintained by:** OpenWiki (generated); verify against `electron/services/turn-interrupt.ts`

---

## What Settlement Is

A turn is **settled** when its final state (completed/failed/cancelled/interrupted) is durable in SQLite and the runtime is removed from memory. Settlement happens **exactly once** per turn — the runtime is removed even if the database write fails, and startup recovery then repairs a remaining database row instead of presenting a dead runtime as active.

**finalizeTurn** is the core choreography. It runs when a turn's execution path ends:
- After streaming completes (model response arrived, tool calls dispatched, no more recursion)
- After user interruption
- After a failure before streaming (pre-stream throw)
- After a failure during execution (tool dispatch error, stream error, cap exceeded)

---

## Settlement Choreography

```typescript
finalizeTurn({
  runtime: TurnRuntime,              // Active runtime for this conversation
  status: SettledTurnStatus,         // 'completed' | 'failed' | 'cancelled' | 'interrupted'
  conversationId: string,
  model?: string,                    // For queued follow-up dispatch
  dispatchQueue?: (input) => void    // Injected to dispatch next queued item
})
→ { settled: boolean, recoveredFollowUps: number }
```

**Settlement path:**

1. **Recover pending Steer follow-ups** (if any exist)
   - If undelivered Steers exist when the turn settles, `recoverPendingRuntimeSteers` converts them to editable drafts
   - Recovery reason: `"turn completed before pending Steering was delivered"` (or status-specific message)
   - Recovered Steers remain in pending state and can be edited by the user

2. **Settle the runtime** — call `turnRuntimeRegistry.settle(runtime, status, completedAt)`
   - Remove the runtime from memory (exact-once guarantee)
   - Write the turn status to `conversation_turns` table
   - Persist the final message row with settlement marker
   - Return whether the database write succeeded

3. **Emit settlement event**
   - `emitTurnSettled(runtime, status, completedAt, persisted)`
   - Record to activity log (identifiers, status, timestamps, no sensitive content)
   - Fire any async cleanup hooks

4. **Drain temporary artifacts**
   - `drainPendingDocuments(correlationId)` — remove in-flight temp files
   - `drainPendingArtifacts(correlationId)` — clean up unsaved artifact previews

5. **Dispatch next queued follow-up** (only if completed successfully)
   ```typescript
   if (settled && status === 'completed' && model && dispatchQueue) {
     dispatchQueue({
       conversationId,
       model,
       activeSkillIds
     })
   }
   ```
   - Failed turns do not dispatch their queue
   - Cancelled turns do not dispatch their queue
   - Only completed turns flow into the next queued item

---

## Status Mapping (v0.29.0 Audit Closure)

| Termination Event | Settlement Status | Message Persisted | Queue Dispatched |
|---|---|---|---|
| Model response completes (no error) | `completed` | Yes (assistant row) | **Yes** |
| Tool cap exceeded (>10 rounds) | `failed` | Yes (cap error message) | No |
| Pre-stream throw (before streaming starts) | `failed` | Yes (system note) | No |
| Stream error (mid-response) | `failed` | Yes (partial content + error) | No |
| Tool dispatch error | `failed` | Yes (tool calls + error message) | No |
| User Stop / interrupt (`turn-interrupt.ts`) | `cancelled` | Audit event `turn.interrupted` + disposition `interrupted`; settle status is `cancelled` (OD-2/K1) | No |
| Schema may still store `interrupted` / `recovered` | (schema statuses) | Distinct from user-interrupt settle — startup recovery / historical rows | No |

**Important:** These status values are **caps**, not suggestions.
- A failed tool call **caps** to `failed`, never escalates to user confirmation
- A cancelled turn **settles** to `cancelled`, not to `failed`
- User interrupt **settles** `cancelled` and **records** audit event `turn.interrupted` (disposition `interrupted`); do not conflate event name with settle status (OD-2/K1)

---

## Error Paths

### Pre-Stream Throw (Never Started Streaming)

When `runChatRound` throws before the provider call (`chatStream`) is initiated:

```
runHeadlessTurn
  ├─ Validate request
  ├─ Acquire turn runtime
  ├─ Build system prompt
  ├─ Resolve model
  └─ runChatRound throws (e.g., missing keys, model not found)
      └─ Outer catch in chat.ts
          ├─ recordEvent('chat.failed', {error, reason})
          ├─ buildGhostReplyNotice if no message row yet
          ├─ finalizeTurn({status: 'failed'})
          └─ No reply sent to user (SP-4 ghost-reply guard)
```

**Result:** Turn settles as `failed`, system message persists noting the pre-stream failure, no message row is shown to the user (ghost-reply).

### Stream Error (Mid-Response)

When the streaming connection fails or the provider returns an error:

```
chatStream onError
  ├─ Accumulate partial content
  ├─ Close streaming state
  ├─ Persist partial message + error flag
  └─ runChatRound catches error
      ├─ finalizeTurn({status: 'failed'})
      └─ Partial message visible in chat with error marker
```

**Result:** Turn settles as `failed`, user sees the partial response with an error note.

### Tool Dispatch Error

When a tool handler throws or returns an error:

```
resolveSingleToolCall throws
  ├─ Tool result persisted with isError: true
  ├─ runChatRound catches
  ├─ Check if turn should retry or bail
  └─ If bailing:
      └─ finalizeTurn({status: 'failed'})
```

**Result:** Turn settles as `failed`, tool_calls and error message visible in transcript.

### Tool Cap Exceeded

When more than 10 tool call rounds occur (MAX_TOOL_ROUNDS):

```
runChatRound
  ├─ Count tool call rounds
  ├─ If rounds > 10:
  │   └─ Throw ToolRoundCapError
  │       └─ runChatRound catches
  │           └─ finalizeTurn({status: 'failed'})
  └─ Message: "Tool call limit exceeded"
```

**Result:** Turn settles as `failed`, cap error message persists.

### User Cancellation

When the user clicks Stop:

```
turn:interrupt IPC
  ├─ interruptTurn(conversationId)
  │   ├─ Halt in-flight provider requests
  │   ├─ Recover pending Steers
  │   └─ finalizeTurn({status: 'cancelled'})
  └─ No reply message row (stop does not persist a message)
```

**Result:** Turn settles as `cancelled`, no new message, Steering recovered as editable drafts.

### Signal or Window Close

When the process receives SIGTERM or the window closes:

```
app onQuitting or process signal
  ├─ Drain in-flight turns
  │   └─ finalizeTurn({status: 'interrupted', steerRecoveryReason: 'app quit'})
  ├─ Persist system note: "Turn interrupted by app quit"
  └─ Cleanup db connection
```

**Restart recovery:**
- On next launch, `turnRuntimeRegistry` detects a row in `conversation_turns` with status `null` (not yet settled)
- Recovery message: "Turn was interrupted. You can resume or start over."
- Steering that was pending is recovered as editable drafts

---

## Persistence Schema

**conversation_turns table** (migration v21):

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Stable turn identity |
| `conversationId` | UUID | Back-link |
| `status` | TEXT | 'completed' \| 'failed' \| 'cancelled' \| 'interrupted' \| NULL (running) |
| `createdAt` | INTEGER | Turn start time (ms since epoch) |
| `settledAt` | INTEGER | Settlement time (NULL if still running) |

**messages table** (related):

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Stable message identity |
| `conversationId` | UUID | Back-link |
| `turnId` | UUID | Which turn created this message |
| `role` | TEXT | 'user' \| 'assistant' \| 'system' |
| `content` | TEXT | Message content (sanitized for fallback) |
| `content_raw` | TEXT | Original content if sanitized (NULL otherwise) |
| `tool_calls` | JSON | ToolCallRequest[] — what the model intended |

**Constraints:**
- One row per turn in `conversation_turns`
- One running turn per conversation at a time (enforced at `TurnRuntimeRegistry`)
- Every assistant message has a `turnId` (backlink to the settled turn)

---

## Exact-Once Guarantee

The exact-once semantic is enforced by **removing the runtime from memory first**, then writing to the database.

```typescript
let settled: boolean
try {
  settled = deps.settle(runtime, status, completedAt)  // ← removes runtime from memory + writes DB
  if (settled) deps.emitSettled(runtime, status, completedAt, true)  // event fires only if DB succeeded
} catch (error) {
  settled = false
  deps.reportError('[finalize-turn] settlement persistence failed', error)
  deps.emitSettled(runtime, status, completedAt, false)  // event fires even if DB failed
}
```

**If the DB write fails:**
- Runtime is already removed from memory
- Event fires with `persisted: false` so activity knows the write didn't stick
- Startup recovery finds the remaining `conversation_turns` row (status NULL) and repairs it
- User is never shown a dead or half-settled turn

---

## Steering Recovery

When a turn settles before a pending Steer is delivered to the model:

1. `recoverPendingRuntimeSteers(runtime, reason)` is called
2. Each pending Steer becomes an editable draft in the queue
3. Recovery reason: `"turn completed before pending Steering was delivered"` (or status-specific)
4. User can edit the draft and choose to send it as a new Queue item
5. The Steer is **never silently promoted to Queue** and **never lost**

---

## Activity Event Audit

Settlement events are recorded for audit:

```typescript
{
  type: 'turn.settled',
  turnId: UUID,
  conversationId: UUID,
  status: 'completed' | 'failed' | 'cancelled' | 'interrupted',
  createdAt: timestamp,
  settledAt: timestamp,
  recoveredSteers: count,
  queueDispatched: boolean
}
```

**Privacy:** Events do NOT contain:
- Turn content
- Tool arguments or results
- Error messages (only the status)
- Steering text (only recovered count)
- File paths or data

---

## Testing

**Unit tests:** `finalize-turn.test.ts`
- Settlement with pending Steers (recovery)
- Settlement with different status values
- Queue dispatch only on `completed`
- DB failure handling (persist flag)

**Integration:** `headless-turn-settlement.test.ts`
- Full turn execution → settlement lifecycle
- Error paths → correct status
- Pre-stream throws → ghost-reply guard

**Source locks:** `settlement-status.test.ts`
- Status cap invariants (failed cannot escalate, cancelled is terminal, only completed dispatches)

---

## Change Navigation

**To understand a settlement bug:**
1. Check if the turn reached a final status or hung in memory
2. Query `conversation_turns` for the status and `settledAt`
3. Check activity log for `turn.settled` event (persisted: true/false)
4. Check for orphaned Steer rows in `turn_followups` (reason = recovery reason)

**To add a new error path:**
1. Determine the status (almost always `failed` unless explicitly cancelled)
2. Call `finalizeTurn({runtime, status: '...', conversationId})` from the error handler
3. If you need a system message, add it before the call
4. Add test case covering the error → correct status mapping

**To inspect settlement state on startup:**
1. `TurnRuntimeRegistry.recover()` checks for NULL status rows
2. If found, `finalizeTurn({status: 'interrupted'})` repairs with recovery reason
3. User sees "Turn was interrupted" in chat

---

## Key Files

| File | Purpose |
|---|---|
| `electron/services/finalize-turn.ts` | Settlement choreography |
| `electron/services/turn-runtime.ts` | `TurnRuntimeRegistry.settle()` + recovery |
| `electron/services/steer-delivery.ts` | `recoverPendingRuntimeSteers()` |
| `electron/services/turn-interrupt.ts` | User-initiated cancellation |
| `electron/ipc/chat.ts` | Error paths calling `finalizeTurn` |
| `electron/services/ghost-reply-guard.ts` | Pre-stream failure detection |

---

Further reading: [architecture/overview.md](../../architecture/overview.md), [architecture/turn-control.md](../../architecture/turn-control.md)

---

Authored and reviewed by Basho Parks, copyright 2026
