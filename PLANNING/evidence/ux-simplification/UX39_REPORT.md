# UX simplification closeout — v0.33.0

## What shipped

Source STS UX-00 through UX-37 is on `main`. GitHub **v0.33.0** exists at source `0b49c399a45e3aeffc94280b2dcd3e429179f83a` (producer `34078809766`). README download links point there. **v0.32.0** was not overwritten.

Daily work is one task sidebar, one conversation column and an optional workspace. Settings are six searchable groups. Commands still find old names. Steer, Queue, Stop and permission defaults are unchanged.

## Gates

| Gate | Disposition |
|---|---|
| G0–G4 | Accepted across UX-00–UX-32 receipts and Windows lifecycle fixtures |
| G5 | Fire-Starter UX-34: taskSwitch p95Median 57 (limit 250; baseline 446.2); taskFeedback p95Median 39.9 (limit 100). Typing p95Median 77.4 / one run 100.5 is disclosed and is not an UX-34 remainingFailure |
| G6 | UX-36: default vitest 3147 passed / 171 skipped; native-db 171 passed; `verify:all` passed |
| G7 | Each prompt commit was pushed; hosted CI/Build recorded on the receipts |
| G8 | **Open.** GitHub hashes match local `dist/Lamprey-0.33.0-x64.exe`. CDN/R2 was not mirrored from this session. Windows package smoke was not run |

## Release URLs

- Source: https://github.com/USS-Parks/Lamprey-Harness
- Release: https://github.com/USS-Parks/Lamprey-Harness/releases/tag/v0.33.0
- Tag peel: `0b49c399a45e3aeffc94280b2dcd3e429179f83a`
- Docs-only delta after the tag: UX-38 `e213c294e07d3f1f16edd54f4cbd9749e797ee43` and this UX-39 commit
- Visible installer (this session): `dist/Lamprey-0.33.0-x64.exe`
- Manifest of GitHub hashes: `UX38_GITHUB_HASHES.json`

## Retained limitations

- G8 / TL-W4: no proven GitHub == local dist == CDN triple
- No Windows NSIS/portable install smoke of the v0.33.0 CI bytes
- No macOS or Linux GUI smoke
- No current-Codex feature-parity claim
- Unsigned builds remain a permanent non-goal
- Owner worktrees were not refreshed from Linux; see `UX39_STORAGE.md`
- September/site leftovers were not resumed
- GitHub release body may still be the workflow default; `RELEASE_NOTES/v0.33.0.md` is the authored text

## Owner-only leftover (unchanged from UX-38)

1. On the Windows primary checkout, ensure Bucket setup (`pwsh scripts/bucket-setup.ps1` if needed).
2. Fast-forward to `origin/main`. Do not move `v0.33.0`.
3. `pwsh scripts/bucket.ps1 -NoTag`
4. Confirm installer sha256 `2eb7f57ebc97643b5f0d1db3feda215a77580472a44da6ab66094f902b5ee42f`
5. Paste `RELEASE_NOTES/v0.33.0.md` into the GitHub release body
6. Optional Windows portable/NSIS smoke
7. Do not overwrite `v0.32.0`

Authored and reviewed by Basho Parks, copyright 2026
