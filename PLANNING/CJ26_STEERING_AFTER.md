# Codex July 2026 Steering Conformance — v0.20.0 Release Evidence

**Prompt:** ST-11

**Evidence date:** 2026-07-18

**Status:** automated contract gate passes; owner reports the Lamprey Steering path works;
the complete paired desktop replay is still `USER-VERIFICATION-NEEDED`

**Release:** v0.20.0, implementation-complete

**Parity claim:** withheld until the paired Codex/Lamprey replay is complete

## 1. Candidate ledger

| Item                          | Exact value                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| Lamprey production candidate  | `v0.20.0` release cut                                            |
| Queue-delivery implementation | `781756e` (`Deliver queued follow-ups through the turn seam`)    |
| Branch                        | `codex/steering-parity`                                          |
| Package version               | `0.20.0`                                                         |
| Baseline                      | `CJ26_BASELINE.md`, Codex CLI `0.144.5`, Desktop target `26.707` |
| Playbook                      | `CJ26_SMOKE_PLAYBOOK.md`, CJ26-S01 through CJ26-S12              |
| OS for automated run          | Windows 11, `America/Los_Angeles`                                |
| Codex UI reference            | `PLANNING/evidence/CJ26-codex-steering-reference.png`            |
| Owner Lamprey report          | “It works beautifully” in the 2026-07-18 Steering task           |

The v0.20.0 cut includes the final Codex-style composer treatment: Enter Steers,
Tab Queues, the running composer keeps only a compact Stop button, and accepted
Steering appears as a muted pending row above the composer. The executable
matrix remains `electron/services/steering-conformance-matrix.test.ts`.

## 2. Automated gate receipt

Command: the 27-file Steering/Queue suite named in the ST-11 DEVLOG working
entry, including the conformance matrix and every referenced evidence suite.

Result:

- 27 test files: 26 passed, 1 skipped;
- 286 tests: 277 passed, 9 skipped;
- all 20 normative rows mapped exactly once by the matrix;
- the one skipped file is the nine-test `better-sqlite3` TurnControlStore
  cohort under the confirmed Node/Electron ABI mismatch;
- the independent no-addon `node:sqlite` turn-control integration file passed
  all eight DDL/query/constraint/recovery/cascade tests.

The corrected proof gate reports 16 ABI-guarded native test files as skipped
instead of claiming they ran. Native-store skips are not converted to PASS.

## 3. Twenty-row automated contract matrix

`PASS` below means the named automated contract is green. It does not replace
the paired Codex/Lamprey desktop replay in the final column.

| §1 row | Contract                   | Executable Lamprey evidence                                                            | Automated | Live companion | Owner status             |
| -----: | -------------------------- | -------------------------------------------------------------------------------------- | --------- | -------------- | ------------------------ |
|      1 | Same in-flight turn        | `steering-boundary-wiring.test.ts` stable runtime + continuation                       | PASS      | S01, S04       | USER-VERIFICATION-NEEDED |
|      2 | Separate next-turn Queue   | `queued-follow-up-dispatch.test.ts` synchronous first-position claim                   | PASS      | S08            | USER-VERIFICATION-NEEDED |
|      3 | Stable identity            | `turn-runtime.test.ts`; `turn-control.test.ts` exact expected-turn guard               | PASS      | S05, S06       | USER-VERIFICATION-NEEDED |
|      4 | Idempotent client identity | `turn-control.test.ts` exact retry dedupe and echo                                     | PASS      | S01, S04       | USER-VERIFICATION-NEEDED |
|      5 | Ordered input parity       | `turn-control-types.test.ts`; `steer-transcript.test.ts`; queued structured-input test | PASS      | S07            | USER-VERIFICATION-NEEDED |
|      6 | No settings override       | `turn-control-types.test.ts` strict override rejection                                 | PASS      | S05            | USER-VERIFICATION-NEEDED |
|      7 | Safe delivery boundary     | `steering-round-harness.test.ts` mutating-tool boundary                                | PASS      | S02, S12       | USER-VERIFICATION-NEEDED |
|      8 | Streaming race             | deterministic streaming and completion-race harness                                    | PASS      | S01, S04       | USER-VERIFICATION-NEEDED |
|      9 | Tool wait                  | `steering-boundary-wiring.test.ts` side effect/result before consumption               | PASS      | S02            | USER-VERIFICATION-NEEDED |
|     10 | Agent wait                 | `agent-wait.test.ts`; targeted `subagent-runner.test.ts` continuation                  | PASS      | S03            | USER-VERIFICATION-NEEDED |
|     11 | Non-steerable kinds        | typed kind/status rejection plus editable-draft reducer                                | PASS      | S05, S06       | USER-VERIFICATION-NEEDED |
|     12 | Composer remains usable    | `follow-up-composer-wiring.test.ts` editable running composer + separate Stop          | PASS      | S01, S11       | USER-VERIFICATION-NEEDED |
|     13 | Configurable default       | default-settings and composer shortcut wiring tests                                    | PASS      | S11            | USER-VERIFICATION-NEEDED |
|     14 | Queue management           | IPC CRUD/order tests plus complete queue-control source lock                           | PASS      | S08            | USER-VERIFICATION-NEEDED |
|     15 | Durability                 | `node:sqlite` recovery/preserve-Queue test + renderer rehydration reducer              | PASS      | S09            | USER-VERIFICATION-NEEDED |
|     16 | Interrupt separation       | exact-once interrupt test + no terminal/process authority source lock                  | PASS      | S10            | USER-VERIFICATION-NEEDED |
|     17 | Root/child attribution     | event lineage test + selected-child IPC test                                           | PASS      | S03            | USER-VERIFICATION-NEEDED |
|     18 | Audit/event truth          | bounded disposition event tests and UI presentation tests                              | PASS      | S01–S10        | USER-VERIFICATION-NEEDED |
|     19 | One execution seam         | queued `runHeadlessTurn` lock + loop/wakeup persist-then-run locks                     | PASS      | S08, S09       | USER-VERIFICATION-NEEDED |
|     20 | Failure visibility         | Steer recovery/rejection tests + Queue input/provider/renderer failure tests           | PASS      | S04–S09        | USER-VERIFICATION-NEEDED |

## 4. Paired owner replay ledger

The owner tested Lamprey's core Steering path and reported that it works. The
owner also supplied the Codex composer screenshot used for the final visual
treatment. That is useful product evidence, but it is not a complete run of the
twelve-case paired protocol. Each row below therefore remains open until its
specific signals and artifacts are recorded.

Fixed fields for the Lamprey replay are tag `v0.20.0`, package `0.20.0`,
Windows 11, and the exact prompts from `CJ26_SMOKE_PLAYBOOK.md`. The owner must
record model/provider, follow-up default, start timestamp/timezone, redacted
turn/task identities, observed signal order, final disposition, and artifact
names for every row. For Codex, record the actually installed build; only
Desktop `26.707` is the pinned target. A later build must be labeled
`post-cut observation`.

| Case                                   | Codex result             | Lamprey result           | Required evidence still missing                                        |
| -------------------------------------- | ------------------------ | ------------------------ | ---------------------------------------------------------------------- |
| CJ26-S01 Steer during streaming        | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | composer, start count, user item, continuation, terminal disposition   |
| CJ26-S02 Steer during tool execution   | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | tool start/end, acceptance, following dispatch, unchanged side effect  |
| CJ26-S03 Steer during subagent wait    | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | root wake, selected-child identity, no sibling, original-child outcome |
| CJ26-S04 Completion race               | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | ten attempts, one disposition each, rejected editable text behavior    |
| CJ26-S05 Stale expected target         | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | old/nonexistent IDs, typed error, proof of no persistence/fallback     |
| CJ26-S06 Non-steerable kind            | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | review/compaction/completed/interrupted rejection and draft state      |
| CJ26-S07 Ordered mixed attachments     | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | UI/protocol/model order, metadata, unsupported-input rejection         |
| CJ26-S08 Queue CRUD/order/send-now     | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | Q3/Q1/Q2-edit operations, send-now meaning, single final delivery      |
| CJ26-S09 Queue restart/reconnect       | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | reload, full restart, reconnect, orphan turn and accepted Steer state  |
| CJ26-S10 Interrupt/background terminal | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | exact turn settlement and surviving terminal identity/timestamp        |
| CJ26-S11 Default and shortcuts         | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | settings capture and exact primary/alternate keys for both defaults    |
| CJ26-S12 Mid-turn compaction           | USER-VERIFICATION-NEEDED | USER-VERIFICATION-NEEDED | request ordering trace, or explicit BLOCKED reason if no debug ceiling |

## 5. Current adjudication

- Lamprey Steering/Queue is **automated-contract complete** for the 20-row M1
  matrix in v0.20.0.
- The owner has verified the core Lamprey Steering path and approved the release.
- Current Codex Desktop behavior is **not owner-traced** in this evidence set.
- No complete Codex/Lamprey mismatch adjudication is possible until the paired
  replay has case-by-case observations.
- ST-12 ships v0.20.0 under the owner's explicit release override. M1 is
  implementation-complete, but it is not labeled parity-complete.

Owner action: run CJ26-S01 through CJ26-S12 against both products, fill the
packet fields above, name the redacted artifacts, and return the results for
adjudication. `BLOCKED` and `USER-VERIFICATION-NEEDED` remain non-passing.

---

Authored and reviewed by Basho Parks, copyright 2026
