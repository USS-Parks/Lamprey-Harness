# Automations and Operational Goals after matrix

**Milestone:** M8 / GA-1 through GA-6

**Snapshot:** v0.26.0 local milestone on `codex/steering-parity`, not published

**Baseline:** `CJ26_BASELINE.md` dated 2026-07-17

## Outcome

M8 is implementation-complete. Deterministic gates pass and recurring autonomy remains OFF
by default. Real packaged-app background and restart behavior remains
`USER-VERIFICATION-NEEDED`; this matrix does not turn unit, migration, or renderer evidence
into a live desktop receipt.

## Baseline-to-after matrix

| Baseline requirement | After state | Evidence | Disposition |
| --- | --- | --- | --- |
| Model-callable automation management | Four strict lazy tools with shared approval/risk authority | tool-pack and schema cohorts | Implemented |
| Typed triggers | One-shot, cron/interval schedule, event, monitor | trigger fake-clock and runner tests | Implemented |
| Deterministic scheduling | Coalesced misses, stable keys, bounded retry, disabled state | runner scheduling and Node-SQLite restart tests | Implemented |
| Operational goals | Six-state lifecycle, provenance, budgets, elapsed time, blocker/completion | lifecycle, authority, persistence tests | Implemented |
| Loop ownership | One goal owns one bounded loop/backlog | bridge migration and unit tests | Implemented |
| Automation wake | Bound automation marks the owned loop due; no second provider path | bridge and runner source/wiring tests | Implemented |
| Outer safety gate | `loopsEnabled` gates every autonomous entry; ceilings only tighten | loop-safety source lock and composition tests | Implemented |
| Existing management UI | Shared trigger manager; goal lifecycle/progress/control UI | UI wiring, build, renderer smoke | Implemented; owner GUI receipt open |
| Background/restart behavior | Durable code path and restart tests exist | `GA_AUTOMATION_GOAL_PLAYBOOK.md` | Owner verification needed |

## Frozen boundaries

- Recurring autonomy remains OFF until the owner enables loops.
- Automation intervals are at least 30 seconds.
- Default retry is three attempts with bounded exponential delay.
- Global loop defaults remain 25 iterations, 30 active minutes, and 500,000 tokens.
- Model authority cannot abort or clear goals.
- A bound automation wakes the existing loop controller and never calls a provider directly.

## Honest gaps

- The packaged-app background/restart section of the owner playbook has not been run.
- No live receipt yet proves a real sleeping/resuming desktop coalesces a missed trigger or
  recovers an interrupted provider/loop turn without duplicate work.
- M8 does not supply a cloud scheduler; Lamprey must be running for triggers to fire.
- v0.26.0 is a local version wrap only. No push, tag, release, Bucket run, or artifact
  publication was authorized.

## Verdict

**ADOPTED as an OFF-by-default local implementation.** A public or live-parity-complete
claim requires the owner playbook receipt and separate publication authority.

---

Authored and reviewed by Basho Parks, copyright 2026

> **Publication update (2026-07-19):** The owner subsequently instructed “Push to main and
> bucket this one,” authorizing v0.26.0 publication from the completed M8 state. The local
> snapshot and honest-gap record above remain as captured; the background/restart playbook
> is still open.
