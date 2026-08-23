# Codex July 2026 Parity — Task-Control GUI Playbook

**Milestone:** M2 / TC-6  
**Release target:** v0.21.0  
**Date:** 2026-07-18

Run this owner smoke against the packaged build with two ordinary conversations, one
historical fork, and one running turn. Record screenshots or a short capture beside the
release evidence; do not replace the mechanical gate with this playbook.

1. Expand **Activity → Task graph**. Confirm the fork is indented under its parent and each
   row shows a live status.
2. Cause a background task or cross-session notification. Confirm the owning task shows an
   unread badge and that the event remains next-turn delivery rather than an injected live
   turn mutation.
3. Select the running task, enter a Steering message, and press **Steer**. Confirm it reaches
   that exact turn. Settle/restart the turn before pressing and confirm the stale action is
   rejected rather than queued.
4. Press **Wait 30s**, change the selected task from another surface, and confirm the wait
   wakes. Repeat without a change and confirm a bounded timeout.
5. Interrupt a running turn. Confirm the visible status settles once and recoverable Queue
   items remain available.
6. Rename, pin/unpin, archive/restore, and close/restore a task. Restart Lamprey and confirm
   the metadata persists.
7. Preview permanent deletion on a task tree. Confirm the descendant impact counts are
   shown, active descendants block the final action, **Cancel** is harmless, and the final
   delete requires the second explicit click.
8. Open a task from the graph and confirm the existing chat/session view is selected; no
   duplicate task transcript or alternate dispatch path should appear.

**Pass condition:** all eight checks pass without renderer errors, busy polling, Queue
fallback after rejected Steering, or divergence between the graph and the existing
sessions/agents surfaces.
