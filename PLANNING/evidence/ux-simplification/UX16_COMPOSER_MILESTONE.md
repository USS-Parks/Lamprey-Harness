# UX-16 - Integrated composer acceptance

The composer milestone passed in the built Electron app. UX16_FOCUSED9 is the final integrated receipt; it exercises real renderer, preload, main, SQLite, files, a loopback model provider and a permission-gated shell write in the owned temporary repository. Chooser paths and rejected IPC responses are controlled fault boundaries. No external provider or owner credential was used, and this is agent-run acceptance, not owner-performed acceptance.

Draft text and ordered attachments now belong to their task and survive reload. Text and attachment fields persist separately, so typing does not rewrite image payloads. Migration 34 also stores structured image content with its user message and removes deleted-task drafts inside the conversation deletion transaction. Normal sends clear only acknowledged input; rejection, delayed attachment processing, task switching and newer edits retain the correct owner's data. Initial synchronous double submission creates one task/message. Enter while running follows the visible Steer/Queue preference. Invalid or unavailable attachments stay recoverable.

The integrated run verifies normal ordered text/image/text delivery at the actual local provider, image history on the next turn after reload, rejected and thrown sends without persisted duplicate messages, delayed picker ownership, active-task switching, Queue via Enter, Stop and approval before a real file write. UX16_RUN2 passed all prior shared scenarios plus the initial integrated cases. Later full runs reached the final layout assertions after passing the preceding scenarios. The final focused run repeats the entire integrated composer case with the repaired layout, both themes, initial-task recovery and strict clipping checks.

At 1440x900/100%, 1024x768/150% and 800x600/200%, the input remains focused/readable and the whole Stop target is inside the viewport and every clipping ancestor. Native Electron captures avoid the zoom mismatch in Playwright screenshots. Narrow drawers follow CSS viewport width and dismiss through their real controls. On short windows the composer precedes diagnostics, primary actions come directly after the input, and remaining controls can scroll. Titlebar overlap remains visible in the extreme-width captures and belongs to the whole-shell UX-32 gate; this receipt does not claim that later gate is complete.

## Navigation against UX-00

Counts exclude typing and the native file chooser. Baseline source is bc78ec984205695480568b5e2a7097b676265a52; final operations are exercised by the shared fixtures.

| Operation | UX-00 pointer actions | Integrated composer | Change |
|---|---:|---:|---|
| Send ordinary text | 1 | 1, or Enter | No extra navigation |
| Attach a file through Add | 2 | 2, or Ctrl+U | No extra navigation |
| Submit preferred follow-up | 1 | 1, or Enter | Enter now avoids leaving the input |
| Submit the other follow-up mode | 1 | 3 initially; 1 on later submissions | Explicit menu selection persists the preference |
| Stop active turn | 1 | 1 | Preserved at every measured scale |

There is no blanket click-count reduction for these core operations. The gain is task-safe input, fewer competing persistent labels, removal of dead actions and a remembered follow-up choice. The less-used follow-up incurs two extra clicks when changing preference; the menu never submits by itself. This tradeoff is recorded rather than hidden behind a general efficiency claim.

## Verification and retained failures

- Final full proof: lint, both TypeScript projects, 3,044 tests and both build smokes passed (UX16_PROOF_PUSH14.log).
- Native Electron database gate: 171 tests in 22 files, zero skips (UX16_NATIVE_RESULTS.json). The ordinary Node run's 176 skips remain explicit; it is not the native database proof.
- Production builds through UX16_BUILD9.log passed. Final real acceptance and cleanup: UX16_FOCUSED9. All owned fixture processes, servers and temporary profiles were removed.
- UX16_BEFORE records the original cross-task draft failure. RUN3/4 and FOCUSED5/6 retain drawer, overflow and clipping failures. FOCUSED7 stopped at collapsed-sidebar fixture navigation. FOCUSED8 passed its earlier geometry checks but visual inspection found partial ancestor clipping; FOCUSED9 supersedes that acceptance with a stricter assertion and corrected layout.
- Eight new behavior tests cover real SQLite draft isolation/cleanup/validation and delayed or rejected renderer persistence. Updated old wiring locks reflect the approved running-Enter behavior and durable structured history.

## Storage and publication

UX16_STORAGE.json inventories the canonical checkout and four prior clean audit worktrees. The old lanes have no unpublished work and share dependencies; removal remains unauthorized. No production worktree or dependency copy was created. Free disk at the inventory was 328,076,771,328 bytes. Existing dist remains approximately 27.7 GiB of retained installers; no artifact was deleted.

UX-00 through UX-13 are published with all ten hosted checks green. UX-14 was pushed after UX-13 went green. UX-15 and this prompt retain separate commits for ordered publication. This milestone does not bump the version, run Bucket or replace the existing v0.32.0 installer. Those remain UX-37 through UX-39 in the already authorized roster.

Authored and reviewed by Basho Parks, copyright 2026
