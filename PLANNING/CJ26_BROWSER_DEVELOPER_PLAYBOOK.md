# Browser Developer Mode owner smoke playbook

**Status:** USER-VERIFICATION-NEEDED

**Scope:** M7 / BD-5 local Electron UI and live CDP behavior. This playbook is the required
owner-operated evidence gate because it needs a visible packaged app, an interactive browser
target, and a deliberate per-site trust decision.

## Fixture

Use an HTTP(S) page you control that:

- logs one recognizable console message and one exception;
- performs one same-origin JSON request whose response includes a disposable fake token;
- contains a button or other named accessibility element;
- does not contain real credentials or private data.

Record the Lamprey commit, package version, Windows version, fixture origin, and fixture
revision with the result. Never use a production account or production secret.

## Procedure

1. Open the Browser panel and load the fixture. Open **Dev**. Confirm Developer Mode begins
   off on a new settings profile and no target is attached.
2. Turn Developer Mode on. Confirm the exact fixture origin appears with policy **Ask** and
   **Attach + record** stays disabled.
3. Set that exact origin to **Allow**, select **Attach + record**, and confirm the target id,
   CDP protocol, green Recording indicator, and console/network counts appear.
4. Reload the fixture. Confirm the counts advance. Use the model tools to list console and
   network metadata, then request only the known JSON response body. Confirm headers, URL
   credential parameters, and the disposable token are redacted; no other body is captured.
5. Run DOM, accessibility, fixed runtime, performance, and short trace inspections. Navigate
   during one capture and confirm the result is discarded or explicitly reports navigation.
6. Enter a harmless annotation label and coordinates, select **Capture screenshot**, and
   confirm the evidence list shows its stable reference, size, and annotation coordinates.
7. Select **Clear evidence**. Confirm console/network counts return to zero and the evidence
   list clears. Select **Detach** and confirm Recording changes to Detached.
8. Set the fixture origin to **Deny** and confirm attachment fails. Return it to **Ask** and
   confirm the same. Trust a different port or sibling hostname and confirm trust does not
   bleed to the fixture origin.
9. Turn Developer Mode off and restart Lamprey. Confirm it remains off only if deliberately
   saved that way, no CDP session is attached, and ordinary Browser panel navigation still
   works.

## Receipt

Record PASS or FAIL for each numbered step, attach the screenshot reference ids, and quote
only sanitized error text. Until that receipt exists, M7 may claim structural/headless proof
but not completed live Browser Developer parity.

---

Authored and reviewed by Basho Parks, copyright 2026
