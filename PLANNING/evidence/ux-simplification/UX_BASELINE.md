# UX-00 â€” Source and interface baseline

Status: UX-00 local baseline gate passed on 2026-09-05; hosted commit verification is recorded separately. This document does not claim v0.33.0 is implemented or released.

## Source and ownership

The source baseline is `bc78ec984205695480568b5e2a7097b676265a52`, verified against `origin/main`. Work continues in the canonical checkout on `codex/ux-simplification`. No new worktree or dependency installation was created. The production build passed (`npm.cmd run build`, captured in the local `PLANNING/evidence/ux00-build.log`).

The September remediation-plan modification, its publication helpers/receipts, and the three pre-existing August/Saddle planning documents belong to the earlier work. They remain outside the UX commit. The UX PSPR and this evidence directory are the new lane's files. The storage receipt records the initial status and remote ancestry.

The prior v0.32.0 Bucket completed successfully; its publication and Windows portable acceptance receipts are separate from the unfinished September documentation ledger. Starting this plan does not close that ledger or resume the paused website proposal. The directly discoverable v0.32.0 installer remains `dist/Lamprey-0.32.0-x64.exe`. The approved new release is v0.33.0, after the source and release gates pass.

## Reproduction and evidence boundaries

Run `node PLANNING/evidence/ux-simplification/baseline.cjs` after the production build. It starts the production Electron bundle through the existing isolated acceptance bootstrap, with a disposable userData profile and a temporary Git repository. Its only model endpoint is a local HTTP server. Built-in plugins and the default MCP process are disabled in that profile. SQLite and the renderer/preload/main IPC are real.

Fixture inputs are 50 tasks, a 1,000-message primary history containing 200 completed tool/result pairs, an alternate task, a local streaming turn, and a one-file Git diff. The baseline confirms that all 200 historical tool rows render after rehydration. Generated profiles are removed on ordinary completion or failure; an interrupted process requires an explicit ownership check before cleanup.

The benchmark window is visible via Electron `showInactive`, without requesting keyboard focus. Hidden-window trial results were rejected because animation frames arrived in approximately two-second batches. They are not evidence of product latency. Background throttling is disabled consistently for the accepted comparison fixture.

Typing samples measure the captured input event through two animation frames, not physical display latency. Task switching measures the actual task button event through rendering the destination message and two animation frames. Panel measurements cover reopening the cached panel shell; they do not claim asynchronous Git/file/network content has finished loading. Five runs retain raw samples and p50/p95. Streaming is measured separately, including scroll anchoring and long tasks.

Ten simultaneous workspace resource tabs do not exist in v0.32.0. That case is explicitly unavailable in this baseline and must be measured after the tab host exists. Browser/terminal lifecycle acceptance remains required at the corresponding implementation prompts and UX-33. No hardware-independent performance claim is made from this machine's result.

The three PNGs are the actual baseline application, not the proposed design. Runtime/build, viewport, display scale and machine provenance are recorded in `UX00_RUNTIME.json`; the captured appearance is the default dark theme. The new design mockups belong to UX-02.

## Findings carried into the roster

1. Task identity appears in both Activity/Task Graph and the task list. The same title can therefore match two navigation surfaces. UX-21/22 must consolidate presentation while preserving the existing task identity and operations.
2. `ReviewPanel` calls `review.status({})`, and `electron/ipc/review.ts` defaults to `process.cwd()`. `files:setWorkdir` updates the active file workspace without changing that process directory. UX-09 must make review use the owning task/project repository explicitly and verify with two distinct real Git repositories. The baseline launches inside its temporary repository; that setup is not a product fix.
3. Starting a new turn clears the renderer's tool-call list; selecting a different task and returning reconstructs the historical entries from persisted messages. UX-18 must preserve access to completed history during and after a new turn, including reopening and task switching.
4. Review initially renders the clean-tree empty state before its asynchronous status request resolves. UX-09/17 must distinguish loading, a genuinely clean tree, and an error.

## Storage closeout

`UX00_STORAGE.json` records four retained audit worktrees. All four are clean, have no commits unpublished against the exact main SHA, and their heads are ancestors of main. Each shares canonical `node_modules` through a junction. Their original owners are unconfirmed; retirement is blocked on cleanup authorization, not missing source preservation. No worktree or cache was removed.

| Checkout | Retained generated output | Purpose / blocker |
|---|---:|---|
| AC-Add | 488,927 bytes | Prior audit lane; cleanup not authorized |
| AC-Delete | 517,744 bytes | Prior audit lane; cleanup not authorized |
| AC-Improve | 500,842 bytes | Prior audit lane; cleanup not authorized |
| AC-Wrap | 61,405,394 bytes | Prior audit lane; cleanup not authorized |
| Canonical | dist 29,725,695,259; dependencies 1,397,642,137; out 61,505,798; coverage 38,472,684 bytes | Active sequential UX/release lane; existing installers and dependencies retained |

The initial inventory reported 341,397,794,816 bytes free. Dist is approximately 27.7 GiB and remains visible storage debt for a separately authorized retention/cleanup decision.

Authored and reviewed by Basho Parks, copyright 2026

## Accepted measurements

Actual renderer viewport: 1440 x 902 CSS pixels at device scale 1.25 (Windows sizing rounds the requested 1440 x 900). All later comparisons must use this recorded viewport.

| Run | Idle typing p95 | Task switch p95 | Cached panel shell p95 | Streaming typing p95 |
|---|---:|---:|---:|---:|
| 1 | 11.4 ms | 428.9 ms | 75.3 ms | 42.8 ms |
| 2 | 16.5 ms | 446.2 ms | 62.2 ms | 67.4 ms |
| 3 | 23.9 ms | 425.0 ms | 92.2 ms | 52.0 ms |
| 4 | 25.5 ms | 450.3 ms | 79.2 ms | 45.4 ms |
| 5 | 25.5 ms | 503.7 ms | 72.3 ms | 43.9 ms |

Streaming scroll position stayed at 55502.3984375 CSS pixels. There were 0 observed main-thread tasks above 100 ms inside the recorded streaming measurement window.

Task switching exceeds the 250 ms target in all five runs. This is an observed baseline failure to address at UX-33/34, not a waiver or a failed capture. Typing and cached shell opening meet their respective absolute targets in this baseline. Raw samples, per-run p50/p95 and runtime provenance remain in UX00_RUNTIME.json.

The final fixture exited 0 and its focused ESLint check passed. Earlier fixture development failures (module access, selectors, hidden frame scheduling and history rehydration) were corrected before the accepted capture; they are not product verification passes.
