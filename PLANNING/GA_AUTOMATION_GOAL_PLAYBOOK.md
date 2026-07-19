# Automation and Goal Management Playbook

**Milestone:** M8 / GA-5  
**Date:** 2026-07-19  
**State:** implementation-complete; background/restart runs require owner verification

## Preconditions

1. Launch the local build and open Settings → Loops.
2. Enable loops deliberately. They remain OFF by default.
3. Open Settings → Automations and Settings → Plans & goals in separate passes.

## Typed automation checks

1. Create a future one-shot reminder. Confirm it reads **Reminder**, shows **Next run**, and
   becomes **Completed** after its single successful fire.
2. Create a cron schedule. Confirm its next-run countdown advances and a missed occurrence
   coalesces to one run after the app resumes.
3. Create a named event automation. Confirm it reads **Waiting · event _name_** until the
   exact event is dispatched; repeat the same event ID and confirm no duplicate run.
4. Create a monitor interval of at least 30 seconds. Confirm values below the floor are
   rejected and a failed attempt shows the retry number and countdown.
5. Disable each kind and confirm no background work starts. Run Now remains an explicit
   user action and records an honest last result.

## Operational goal checks

1. Start an open goal, pause it, and resume it. Confirm elapsed time does not increase while
   paused and the UI presents the lifecycle state rather than only the legacy status.
2. Exercise token and time budgets. Confirm progress bars reflect stored usage and exhaustion
   produces **Blocked** with the recorded system reason.
3. Complete a goal and confirm completion evidence is visible. On a separate goal, use Abort
   and confirm the destructive confirmation appears and the state becomes **Aborted**.
4. For a goal-owned loop, confirm the loop ID and iteration ceiling are visible. Pause/block
   must abort in-flight work and pause the loop; completion/abort must settle it.

## Automation-to-goal wake check

1. Bind an automation to an active goal-owned loop with `automation_bind_goal`.
2. Confirm the automation row reads **Wakes goal …**.
3. Fire it and confirm the automation result records a loop wake; it must not create a direct
   provider response or a second recurring runner.

## Owner background and restart smoke

This portion is `USER-VERIFICATION-NEEDED`: leave the packaged app running long enough for a
real background trigger, then restart between trigger claim and settlement. Verify one
durable attempt is recovered, the retry uses the same trigger key with the next attempt
number, goal/loop bindings survive, and no duplicate work appears. Record the app version,
automation/goal IDs, wall-clock timestamps, and observed run rows in the M8 closeout.
