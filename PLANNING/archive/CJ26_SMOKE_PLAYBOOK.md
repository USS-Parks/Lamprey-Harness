# Codex July 2026 Steering Smoke Playbook

**Prompt:** CJP-0
**Baseline:** `CJ26_BASELINE.md`
**Purpose:** collect paired, reproducible Codex/Lamprey evidence for the M1
Steering and Queue gate

This is an owner-run playbook. Source tests establish protocol behavior; these
steps establish the desktop timing and interaction behavior that source alone
cannot prove.

## 1. Fixed configuration

Run the Codex side against Desktop `26.707` where available. If only a later
build is installed, record its exact version and label every result
`post-cut observation`; it cannot silently revise the `0.144.5`/`26.707`
target. Run the Lamprey side against the exact candidate commit and package
version recorded in `CJ26_STEERING_AFTER.md`.

Use:

- Windows 11, one local Git repository containing a disposable tracked text
  file and no secrets.
- One ordinary coding task, one review/non-steerable task if the product
  exposes it, and one task that spawns a waiting subagent.
- A tool-capable model with deterministic or lowest-available temperature.
- Approval mode that pauses before a harmless, reversible mutation.
- No uncommitted valuable work. Use a disposable worktree for mutation cases.
- Two tiny attachments: one text file and one non-sensitive PNG. Never attach
  credentials, private images, or customer data.
- Screen recording or timestamped screenshots plus redacted event/protocol
  logs. Do not capture API keys, attachment bytes, auth headers, or full local
  paths outside the disposable worktree.

The official target contract is [Steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing),
the [`turn/steer` protocol](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1026-L1036),
and the pinned [`pending_input.rs` timing tests](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L291-L1057).

## 2. Evidence packet

Create one row per case and product:

```text
Case ID:
Product and exact version/commit:
OS:
Model/provider:
Follow-up default:
Start timestamp with timezone:
Initial prompt:
Follow-up text and attachment kinds (no attachment bytes):
Submission moment/event:
Expected signals:
Observed signals and order:
Turn/task IDs (redacted but internally consistent):
Final follow-up disposition:
Screenshot/video/log artifact names:
Result: PASS | FAIL | BLOCKED | USER-VERIFICATION-NEEDED
Notes:
```

Name artifacts `CJ26-<case>-<product>-<sequence>.<ext>`, for example
`CJ26-S01-codex-01.png`. Store only redacted textual findings in the repository;
large recordings remain in the owner evidence location named in
`CJ26_STEERING_AFTER.md`.

## 3. Codex owner-run cases

### CJ26-S01 — Steer during visible streaming

1. Start an ordinary turn that produces at least three paragraphs slowly.
2. While output is still streaming, submit: `Use a numbered list from this point.`
3. Capture the composer, the active-turn identity if visible, user-item event,
   continuation, and completion.

Expected: the composer accepts input; no new turn-start signal appears; the
follow-up is neither duplicated nor silently deferred to a later ordinary
turn. Record the exact point at which behavior changes.

### CJ26-S02 — Steer while a tool is executing

1. Ask the agent to run a harmless command that waits 8–10 seconds and then
   prints a sentinel.
2. After tool start and before completion, submit:
   `After the tool finishes, report only the sentinel.`
3. Capture tool start/completion, follow-up acceptance, next model dispatch,
   and final turn state.

Expected: the running tool is not terminated by Steer; the follow-up is
retained and consumed before the next model response in the same turn. This is
the GUI companion to
[`turn_steer.rs:235-383`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/tests/suite/v2/turn_steer.rs#L235-L383).

### CJ26-S03 — Steer during subagent wait

1. Start a task that spawns one subagent and waits for it. Make the child wait
   long enough to expose the waiting state.
2. Steer the root: `Stop waiting and summarize the evidence already available.`
3. If the UI exposes child targeting, repeat in a fresh task targeting the
   child: `Return now with your partial result.`

Expected: root Steering wakes the wait without creating a sibling. Child
targeting either reaches the selected active child or rejects visibly. Record
what happens to the original child. Compare with
[`pending_input.rs:291-340`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L291-L340).

### CJ26-S04 — Completion race

1. Run a short response ten times.
2. Submit a uniquely numbered steer as the completion indicator appears.
3. Record whether each attempt is accepted or rejected and where rejected text
   remains.

Expected: each attempt has one terminal disposition. An accepted item is
delivered exactly once to the original turn. A losing race rejects visibly and
does not silently become Queue or a new turn. Record whether the text remains
an editable draft; that UX is `user-verification-needed` until observed.

### CJ26-S05 — Stale expected target

This requires protocol/devtools access capable of retaining an old turn ID.

1. Complete turn A and start turn B in the same thread.
2. Submit `turn/steer` with A as `expectedTurnId` while B is active.
3. Repeat with a nonexistent ID.

Expected: typed/visible invalid request; neither message is persisted as
delivered, queued, or new-turn input. Compare with the official
[`turn_steer_requires_active_turn` test](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/tests/suite/v2/turn_steer.rs#L41-L100).

### CJ26-S06 — Non-steerable kind

1. Enter a review or manual-compaction turn if exposed.
2. Attempt Steer with a unique message.
3. Repeat against a completed and an interrupted turn through protocol tooling
   if the desktop UI does not expose the action.

Expected: visible non-steerable/no-active-turn rejection, no silent fallback.
Record whether Desktop preserves the attempted input as an editable draft.

### CJ26-S07 — Ordered mixed attachments

1. Compose one follow-up in this exact order: text A, PNG, text B, local text
   file, text C, if the UI supports interleaving.
2. Submit during an active tool wait.
3. Capture the UI order, protocol user item, persisted transcript, and model
   interpretation.
4. Repeat with an intentionally unsupported attachment.

Expected: supported items preserve order and metadata; unsupported input fails
before false delivery. Record any UI limitation separately from protocol
support. The protocol shape is pinned at
[app-server README lines 1352–1354](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L1352-L1354).

### CJ26-S08 — Queue CRUD, order, and send-now

1. Set Follow-up behavior to Queue.
2. During an active turn queue items `Q1`, `Q2`, and `Q3`.
3. Edit `Q2` to `Q2-edit`; reorder to `Q3`, `Q1`, `Q2-edit`; delete `Q1`;
   use send-now on `Q2-edit` if offered.
4. Let the active turn finish and capture the delivered order and remaining UI.

Expected: deterministic visible order, exact edit, single deletion, and no
duplicate delivery. Record whether send-now means Steer-now or next-turn-now;
do not infer the label. These controls are documented in
[Steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing).

### CJ26-S09 — Queue restart, reload, and reconnect

1. Queue `R1`, `R2`, `R3`; reorder to `R3`, `R1`, `R2`.
2. Reload the renderer/window if available; record state.
3. Fully quit and relaunch; record state.
4. If remote reconnect is in use, disconnect/reconnect without completing the
   active task; record state.
5. Observe what happens to any steer accepted immediately before shutdown.

Expected target for Lamprey: Queue order survives; orphan active work settles
honestly; undelivered steer input is recoverable, never falsely marked
delivered. Codex behavior is deliberately `user-verification-needed` because
the inspected product documentation does not specify restart durability.

### CJ26-S10 — Interrupt versus background terminal

1. Start a background terminal that writes a harmless timestamp after 10
   seconds.
2. Start an ordinary turn that references but does not own that terminal.
3. Interrupt the turn before the timestamp is written.
4. Inspect/list the terminal, wait for the timestamp, then terminate/clean it
   explicitly.

Expected: turn becomes interrupted exactly once; the terminal is not implicitly
killed. Compare with the official
[interrupt and background-terminal lifecycle](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/app-server/README.md#L989-L1025).

### CJ26-S11 — Default behavior and keyboard mapping

1. Open Settings → General → Follow-up behavior and capture the available
   default values and exact alternate-shortcut text.
2. With Steer as default, exercise both primary and alternate submission.
3. With Queue as default, repeat.
4. If testing CLI, separately confirm Enter = Steer and Tab = Queue.

Expected: setting and labels match the current product. Desktop keyboard
mapping must be copied verbatim into the evidence packet; do not derive it from
the CLI mapping.

### CJ26-S12 — Mid-turn compaction boundary

This is primarily a deterministic protocol case. If the owner build exposes a
debug token ceiling, force compaction after a large tool result and steer before
the next request.

Expected: the steer is absent from the compaction request and any required
post-compaction continuation, then appears once in the following request. The
version-pinned truth is
[`pending_input.rs:759-1057`](https://github.com/openai/codex/blob/rust-v0.144.5/codex-rs/core/tests/suite/pending_input.rs#L759-L1057).

## 4. Lamprey replay

After ST-11 produces a candidate build, replay CJ26-S01 through S12 without
changing prompts, sentinel values, attachment ordering, or adjudication rules.
Add these Lamprey-specific observations:

- `turnId`, `clientUserMessageId`, target, mode, and final follow-up disposition;
- whether a second turn-start event occurred;
- tool/subagent state before acceptance and before delivery;
- persisted Queue order before and after reload/restart;
- bounded event names and proof that payloads omit attachment bytes/secrets;
- background terminal identity before and after interrupt.

Use the same disposable worktree. A source-lock test is supporting evidence,
not a replacement for renderer behavior.

## 5. Adjudication

A case passes only when:

1. the expected user-visible state and protocol/event order both match;
2. every submitted follow-up reaches exactly one terminal disposition;
3. there is no duplicate user bubble, duplicate model dispatch, ghost reply, or
   second turn-start for Steer;
4. a rejected/stale item is visible and recoverable according to the recorded
   product behavior, never silently converted;
5. evidence names exact versions and contains no secrets.

Use `BLOCKED` when the required surface cannot be exercised. Use
`USER-VERIFICATION-NEEDED` when owner access or interaction is missing. Never
convert either state to PASS from screenshots of source code or documentation.

Any Codex/Lamprey mismatch becomes an ST addendum. Do not weaken this playbook
or the PSPR matrix to make the gate pass.
