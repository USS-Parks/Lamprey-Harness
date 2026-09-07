# UX-39 worktree and storage inventory

This Linux session cannot refresh the owner's Windows worktrees. Facts below reuse `UX00_STORAGE.json` (observed 2026-09-06) plus later-named paths from UX-34 G5. No deletion is authorized.

## Retained worktrees (owner machine)

| Path | Purpose | UX-00 HEAD | Dirty at UX-00 | Unpublished vs main | Generated (approx) | Retirement blocker |
|---|---|---|---|---|---|---|
| `C:\Users\17076\Documents\Claude\Lamprey Harness` | Canonical checkout | `bc78ec9` on `codex/ux-simplification` | September PSPR modified; several untracked planning/evidence files | none vs then-main | `node_modules` 1.40 GB; `dist` 29.7 GB; `out` 62 MB; `coverage` 38 MB | Active canonical checkout |
| `C:\Users\17076\Documents\Claude\Lamprey-Harness-AC-Add` | Prior audit lane | `613dac0` `feat/audit-closure-add` | clean | none | shared `node_modules`; `out` 0.5 MB | Owner path-specific removal |
| `C:\Users\17076\Documents\Claude\Lamprey-Harness-AC-Delete` | Prior audit lane | `c5a04e4` `feat/audit-closure-delete` | clean | none | shared `node_modules`; `out` 0.5 MB | Owner path-specific removal |
| `C:\Users\17076\Documents\Claude\Lamprey-Harness-AC-Improve` | Prior audit lane | `4f25618` `feat/audit-closure-improve` | clean | none | shared `node_modules`; `out` 0.5 MB | Owner path-specific removal |
| `C:\Users\17076\Documents\Claude\Lamprey-Harness-AC-Wrap` | Prior audit lane | `2ff7aaf` `feat/audit-closure-wrap` | clean | none | shared `node_modules`; `out` 61 MB | Owner path-specific removal |
| `C:\Users\17076\Documents\Claude\Lamprey-Harness-ux34-measure` | UX-34 G5 Fire-Starter capture | `b06a016` (later) | raw `UX34_G5/PERFORMANCE.json` lives here | not refreshed | unknown here | Keep until owner archives the raw G5 files |

UX-00 also listed preserved untracked planning files on the canonical checkout (`LAMPREY_AUGUST_2026_AUDIT.md`, `_PLAN.md`, `_SADDLE_PADDOCK_PLAN.md`, SR-37 helpers). Those were not absorbed into UX commits.

## Dist / installer visibility

- Published GitHub: https://github.com/USS-Parks/Lamprey-Harness/releases/tag/v0.33.0
- This session's visible installer: `dist/Lamprey-0.33.0-x64.exe` sha256 `2eb7f57ebc97643b5f0d1db3feda215a77580472a44da6ab66094f902b5ee42f`
- Nested producer download: `dist/bucket-v0.33.0-0b49c39/` (gitignored)
- Owner `dist/` at UX-00 still held v0.32.0 and many older artifacts (~30 GB). Not deleted.

## Paused work not resumed

- September remediation leftover: SR-37 packaged install smoke, SR-38 CDN/storage closeout, islandmountain.io download-page proposal.
- Website / Nation / IM site work stays parked.
- M4 / Code Mode stays parked.

Authored and reviewed by Basho Parks, copyright 2026
