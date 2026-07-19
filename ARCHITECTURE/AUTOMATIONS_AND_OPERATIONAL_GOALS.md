# Automations and Operational Goals

**Version:** v0.26.0 local milestone, not published

**Autonomy default:** OFF through `loopsEnabled: false`

M8 turns the legacy cron and plan-goal records into a bounded local control plane. It reuses
the existing automation runner, loop controller, goal store, typed IPC, and tool approval
authority. It does not add a daemon, cloud scheduler, or second turn executor.

## Automation model

Four strict lazy tools wrap the canonical automation store: list, create/update, delete, and
run now. Reads require no approval. Mutations require approval; permanent deletion is
destructive and immediate runs carry network risk.

Migration v30 preserves legacy cron rows while adding typed one-shot, schedule, event, and
monitor triggers. Every claimed attempt has a durable `(automation, trigger key, attempt)`
identity. Timed misses coalesce, event IDs deduplicate, retries use bounded exponential
backoff, disabled rows claim no work, and startup settles interrupted attempts before retry.

Invoked from: `electron/services/automation-tool-pack.ts`,
`electron/services/automation-trigger.ts`, `electron/services/automations-runner.ts`.

## Goal lifecycle and authority

Migration v31 adds open, active, paused, blocked, completed, and aborted lifecycle state
without deleting the legacy goal status. Goals persist actor provenance, token/time budgets,
usage, active elapsed time, lifecycle timestamps, blocker, completion evidence, and reason.

Model tools may create, edit, start, pause, resume, block, complete, and record usage. They
cannot abort or clear. Typed user IPC and system recovery retain those stronger authorities.
Budget exhaustion blocks under system provenance.

Invoked from: `electron/services/plan-goal-store.ts`,
`electron/services/plan-goal-persistence.ts`, `electron/ipc/plan.ts`.

## One recurring execution path

Migration v32 lets one goal own one persistent loop and lets automations reference that
goal. `goal_bind_loop` creates the bounded loop/backlog at the existing loop store.
`automation_bind_goal` attaches a wake source. When a bound automation fires, it only makes
the loop due; the established loop controller remains the sole recurring path into
`runHeadlessTurn`.

`loopsEnabled` is the outer gate for create, bind, wake, resume, scheduled ticks, and event
dispatch. Global, goal, and automation ceilings compose by the smallest positive cap.
Narrower scopes can tighten policy but cannot disable or raise an outer cap. Goal pause or
block aborts in-flight loop work and pauses it. Complete, abort, and clear settle the loop
with explicit stop reasons.

Invoked from: `electron/services/goal-automation-loop-bridge.ts`,
`electron/services/loop-controller.ts`, `electron/services/loop-store.ts`.

## Renderer and evidence boundary

Settings and the right-panel Automations entry share one typed manager for all trigger kinds,
next-run/retry/waiting/completed states, exact next eligibility, and bound-goal wake labels.
Plans & goals exposes lifecycle, blocker/completion detail, budget progress, loop ownership,
and user lifecycle controls through typed IPC.

Automated evidence covers strict tools, trigger state and fake clocks, migration/restart
behavior, authority transitions, ceiling composition, loop safety, UI wiring, build, bundle
smoke, and renderer smoke. `PLANNING/GA_AUTOMATION_GOAL_PLAYBOOK.md` is the owner-operated
background/restart gate. Until that receipt exists, v0.26.0 is implementation-complete but
not live background/restart parity-complete.

---

Authored and reviewed by Basho Parks, copyright 2026
