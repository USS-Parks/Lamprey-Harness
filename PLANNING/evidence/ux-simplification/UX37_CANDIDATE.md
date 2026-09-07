# UX-37 release candidate

Version: **0.33.0**. On 7 September 2026, remote tag lookup returned no `v0.33.0`, and GitHub reported no release for it. Package and lockfile root versions are updated together. Notes are at `RELEASE_NOTES/v0.33.0.md`. README download links stay on published **v0.32.0** until UX-38 publication succeeds. Do not overwrite v0.32.0.

Source gates at UX-36: default vitest 3147 passed / 171 skipped; native-db 171 passed under Electron; `verify:all` including both smokes. Tag remains uncreated until UX-38.

## Reviewed artifact contract

| Artifact | Required content check |
|---|---|
| Lamprey-x64.exe | Nonempty native Windows installer; SHA-256 and size; updater SHA-512 |
| Lamprey-x64.exe.blockmap | Same producer; SHA-256 and size |
| Lamprey-x64.zip | Portable Windows package; SHA-256 and size |
| latest.yml | Version 0.33.0; EXE name, size and SHA-512 match |
| Lamprey-arm64.dmg | Native macOS producer; SHA-256 and size |
| Lamprey-x86_64.AppImage | Native Linux producer; SHA-256 and size |
| dist/Lamprey-0.33.0-x64.exe | Versioned copy of the Windows installer in dist root |

Actual hashes cannot exist before the tag producer runs. CDN/TL-W4 is not claimed closed.

Authored and reviewed by Basho Parks, copyright 2026
