# Codex July 2026 Task Control — v0.21.0 Release Evidence

**Prompts:** TC-1–TC-7  
**Evidence date:** 2026-07-18  
**Release:** v0.21.0
**Status:** published; owner GUI evidence remains open
**Parity claim:** withheld pending the packaged owner GUI playbook

## Milestone matrix

| Prompt | Delivered substrate | Mechanical evidence | Status |
| --- | --- | --- | --- |
| TC-1 | canonical read graph over conversations, forks, runs, identities, turns | graph construction, ownership, cycle, filter, cursor suite | PASS |
| TC-2 | `list_tasks`, `read_task`, bounded event-driven `wait_tasks` | wait wake/cursor/timeout/cancel and registry/schema suites | PASS |
| TC-3 | shared Queue/Steer delivery, `send_to_task`, exact `interrupt_task` | attribution/race/compatibility/approval suites | PASS |
| TC-4 | `fork_task` at a completed historical turn, v22 backlink | boundary/backlink/worktree tests plus native migrations | PASS |
| TC-5 | recoverable metadata, v23 close state, confirmed permanent delete | lifecycle/preview/retention and native schema suites | PASS |
| TC-6 | Activity task graph, unread, wait, Steering, interrupt, lifecycle UI | 32 focused tests, production build, renderer smoke | PASS |
| TC-7 | architecture, governance, v0.21.0 cut, full gate, publication | full gate and publication receipt below | PASS |

## Reuse outcome

M2 extends the existing stores and control seams. It does not introduce a second turn
dispatcher, duplicate task transcript, new attachment store, or alternate permission
path. The shared delivery service sits beneath both `send_to_session` and `send_to_task`;
Steering/interrupt reuse M1; forks reuse conversations/RAG/worktrees; unread uses the
existing async-event bridge; every model tool still crosses the registry authority layer.

Genuinely new M2 state is limited to the historical turn backlink and recoverable close
metadata. The graph, waits, controls, and UI are projections/services over canonical data.

## Release gate receipt

- `npm run lint`: PASS.
- TypeScript node and web programs: PASS.
- Default-concurrency full Vitest suite: 223 files total; 210 passed, 13 skipped;
  2,796 tests total; 2,653 passed, 143 skipped, 0 failed.
- Electron ABI-148 migration/schema run: 2 files, 19 tests, all RUN and PASS.
- Production build: PASS (main, preload, renderer).
- `npm run verify:proof`: exit 0; repeated lint/typecheck/full-suite totals above;
  bundle smoke PASS; renderer smoke PASS.
- Host Node cannot load the Electron-ABI `better-sqlite3` binding, so the proof gate
  honestly reports 16 ABI-guarded files as skipped. The M2 migration/schema claims are
  independently covered by the Electron-native 19-test receipt; unrelated native cohorts
  are not relabeled PASS.

The gate found and fixed one release-host reliability defect outside M2 behavior:
`workflow-meta.ts` allowed only 100 ms to enter a fresh VM context and intermittently
rejected valid pure literals under load. The bounded production guard is now one second.
Load-sensitive catalog-import, process-exit, and 210-file-generation test deadlines were
aligned with observed Windows real-time-scanning latency; focused and complete suites pass.

The first post-push Ubuntu coverage job exposed a separate release blocker before the tag
was created: three settings-backed provider caches used only `mtimeMs` as identity, so two
different temporary/profile `settings.json` files with the same timestamp could reuse a
stale base-URL override, custom-provider set, or custom-model set. The caches now key on
canonical file path plus mtime. A deterministic same-mtime/two-profile regression passes
as part of the 41-test provider suite under coverage. A repeat full Windows coverage run
showed both reported provider assertions fixed; its only failure was the already documented
210-file memory-store stress test exceeding 240 seconds under Windows coverage and real-time
scanning. The ordinary full suite and proof gate remain the release authority for that host.

## Publication receipt

- Corrected release/tag commit: `d172586a1b76cab87bcdae51af3d790c6202f416`.
- `HEAD`, `origin/main`, and annotated tag `v0.21.0` resolve to that same commit.
- GitHub release: <https://github.com/USS-Parks/Lamprey-Harness/releases/tag/v0.21.0>;
  published, non-draft, non-prerelease, with six uploaded assets.
- GitHub Windows artifacts: installer 300,824,094 bytes; portable ZIP 401,683,090
  bytes; locally paired blockmap 314,682 bytes; `latest.yml` 328 bytes.
- GitHub cross-platform artifacts: Apple-silicon DMG 326,481,741 bytes; Linux x64
  AppImage 545,650,854 bytes.
- R2 HEAD verified the installer, ZIP, DMG, and AppImage at those same payload sizes.
- CDN HEAD returned HTTP 200 and matching R2 content length/ETag for all four public
  download URLs after the Cloudflare cache purge.

Bucket's initial multi-file GitHub upload hit the documented uploads-endpoint 404 after
R2 and cross-platform publication succeeded. Recovery uploaded the installer and ZIP one
at a time, then clobbered the workflow-generated blockmap and `latest.yml` with the local
pair generated alongside that installer. Final inventory and updater metadata are coherent.

## Owner GUI ledger

`PLANNING/CJ26_TASK_CONTROL_PLAYBOOK.md` defines eight packaged checks. They remain
`USER-VERIFICATION-NEEDED` in this automated session. Therefore the release may state
“M2 implementation complete” but must not state blanket current-Codex task-control parity.

## Remaining scope

M3 through M8 remain independent approval cuts. This release does not authorize inline
visualizations, Code Mode, PR Chat, MCP resource/auth expansion, Browser Developer Mode,
or automation/goal work. The deleted always-on pipeline remains deleted.

---

Authored and reviewed by Basho Parks, copyright 2026
