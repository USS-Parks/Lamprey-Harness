# SR-36 release candidate

Version: **0.32.0**. On 5 September 2026, remote tag lookup returned no `v0.32.0`, and GitHub reported no release for it. Package and lockfile root versions are updated together. Release notes are authored at `RELEASE_NOTES/v0.32.0.md`; current README download links stay on the existing release until publication succeeds.

The initial candidate was `dc67b05de22e79170d20baea0d0d2af5f12d965a`. It passed hosted gates but failed packaged vector retrieval before tagging. SR-36A corrects the native extension path; the revised candidate is the commit introducing `sr36a.json`, resolved by `git log -1 --format=%H -- PLANNING/evidence/sr36a.json`. Its push to main triggers CI and all platform builds. SR-37 must verify those exact hosted results before Bucket creates the tag.

## Reviewed artifact contract

| Artifact | Required content check |
|---|---|
| Lamprey-x64.exe | Nonempty native Windows installer; SHA-256 and size; updater SHA-512 |
| Lamprey-x64.exe.blockmap | Nonempty companion from the same producer; SHA-256 and size |
| Lamprey-x64.zip | Portable Windows installation; SHA-256 and size; extracted launch smoke |
| latest.yml | Version 0.32.0; EXE name, size and SHA-512 match |
| Lamprey-arm64.dmg | Native macOS producer; SHA-256 and size |
| Lamprey-x86_64.AppImage | Native Linux producer; SHA-256 and size |

Actual artifact hashes cannot exist before their producer runs. Bucket captures them from the exact successful tag workflow's three artifact archives, records source SHA/run/attempt, then compares final GitHub and CDN bytes. This is the reviewed pre-publication contract, not a fabricated binary manifest. The concrete manifest and installation evidence are mandatory SR-37 outputs.

Loose-bundle source behavior was accepted at `ae0ab1467fd62fc4b3d219a99eb120a19bc963c9`. SR-36A subsequently found and repaired a packaged-only SQLite-vec loading defect that this earlier gate did not cover. The actual locally packaged ASAR now passes embedding, ingestion and vector retrieval; that receipt explicitly identifies a working-tree build, not released bytes. SR-35's seven release regressions and existing gate contracts pass. Source CI and final tag package acceptance remain required.

Authorization: the user approved full STS and Bucket in this session, including committing and pushing each prompt to main. No additional approval pause is required. Old worktrees and artifacts remain retained under the existing storage restriction.

Authored and reviewed by Basho Parks, copyright 2026
