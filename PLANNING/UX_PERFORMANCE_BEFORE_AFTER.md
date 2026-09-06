# Lamprey UX performance before and after

UX-33 measurement and fresh independent review passed; publication is recorded by the next hosted receipt. This is not a performance acceptance or a v0.33.0 release claim. UX-34 must close the measured failures.

## Reproduction

Source: `41179ac7d6f87ad2512984f1d5e5376135b2a688`, compared with UX-00 source `bc78ec984205695480568b5e2a7097b676265a52`. Run `node scripts/acceptance/ux.cjs PLANNING/evidence/ux-simplification/<new-directory> --performance-only` after building. UX33_RUN4 is the complete instrumented capture. The production bundle is unchanged since accepted UX-32; only the acceptance runner changed in this prompt.

Same AMD Ryzen 7 5800H, Windows 10.0.26200, Electron 43.0.0 / Node 24.17.0, and measured 1440x902 CSS viewport at DPR 1.25 as UX-00. The window uses showInactive and disables background throttling; the fixture does not take foreground keyboard focus. The real renderer, preload, IPC, SQLite and local HTTP provider are used. No remote provider latency is included. The fixture creates 50 tasks and exactly 1,000 initial messages / 200 completed tool entries. Ten existing workspace resources are open: Files, Side chat, Browser, Review, Environment, Sources, Artifacts, Plan, Background tasks, After action. The terminal dock and an actual browser view are exercised during lifecycle measurements. UX-00 predates simultaneous tabs, so that additional resource load has no matched baseline.

The paged sidebar requires exact task search to expose the older fixture rows. Search completes outside each timed click. Typing retains the baseline input-event-to-two-animation-frame method and sample strings; this includes programmatic clear events in some streaming batches, as the baseline did. It measures renderer scheduling rather than hardware input/display latency. Task completion ends when the destination message is rendered and two frames elapse. Loading feedback uses the first Loading task status or completed destination, also followed by two frames. Cached panel opening measures the shell, excluding asynchronous Git content. Five repeat runs follow warm-up; all raw samples and per-run p50/p95 remain in PERFORMANCE.json. Relative comparison uses the median of the five per-run p95 values; every run must satisfy its absolute limit. These rules are retained for UX-34.

## Results

| Interaction | Baseline median p95 | Candidate median p95 | Absolute limit | Relative change | Disposition |
|---|---:|---:|---:|---:|---|
| Idle typing | 23.9 ms | 12.1 ms | 100 ms | -49.4% | Pass |
| Warm task switch | 446.2 ms | 686.8 ms | 250 ms | +53.9% | Open for UX-34 |
| Cached panel shell | 75.3 ms | 62.7 ms | 300 ms | -16.7% | Pass |
| Streaming typing | 45.4 ms | 24.4 ms | 100 ms | -46.3% | Pass |
| Task loading feedback | Unavailable | 618.2 ms | 100 ms | No baseline | Open for UX-34 |

No main-thread tasks above 100 ms were observed inside the recorded streaming interval. The scrolled-up history anchor stayed unchanged. All ten close/open/task-switch cycles retained the same terminal PID, native browser-view counts and all 52 IPC channel listener counts. The fixture-only session preload returns listener counts; it does not wrap callbacks or alter production code. See Electron's [session preload registration](https://www.electronjs.org/docs/latest/api/session#sesregisterpreloadscriptscript). The owned terminal and browser were closed; the profile/server were removed/closed and no owned processes remained.

## Traces and next fixes

Three CPU profiles capture separate repetitions after timing, so profiler overhead does not contaminate the five measured runs. TASK_SWITCH.cpuprofile locates application work in MessageBubble formatTime (261 ms sampled self-time over the profile), markdown syntaxExtension (95 ms), DOM setAttribute (222 ms) and appendChild (156 ms). These point to per-message date formatting, markdown parsing and mounting/layout of long histories. Inspect those existing seams first in UX-34. The same blocked main thread delays loading-feedback paint. Do not add new caches or virtualization without narrowing this trace evidence further.

PANEL_OPEN.cpuprofile and STREAM_TYPING.cpuprofile are retained even though the final measures pass. Their largest named functions include Playwright accessibility queries; those are test-driver overhead, not application hotspots. TRACE_SUMMARY.json records sampled self-time, bundle URL and zero-based lines. Profiles are diagnostic repetitions, not alternative timing results.

RUN1 failed only because the fixture used an incomplete task-search term. RUN2 and RUN3 completed before full trace/listener coverage. RUN2 reported a 110 ms panel median p95, a relative regression; RUN4 reports 63 ms without a product change. This is machine/run variability, not a claimed optimization. All captures remain retained; UX-34 must rerun the same final helper and satisfy both absolute and relative gates.

The only current failing final targets are warm task switching and loading feedback. UX-34 remains open. A manual screen-reader listening test is not part of this timing result. API-equivalent task cost is unavailable because observed parent token usage is not exposed.
