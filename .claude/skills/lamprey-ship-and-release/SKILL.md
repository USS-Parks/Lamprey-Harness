---
name: lamprey-ship-and-release
description: How Lamprey runs and ships — run modes, userData layout, the four Windows release artifacts, the one-command "Bucket" pipeline (build → tag → R2 upload → GitHub release → CDN purge), CI release paths, and failure recovery. Load when the user says "ship", "release", "tag it", "Bucket", or when a release step fails partway.
---

# Lamprey Ship & Release

## When to use / when not

- **Use** for any release/ship request, running the packaged app, understanding what lands where, or recovering a failed release step.
- **Don't use** for building/dev environment problems (see `lamprey-build-and-env`) or the docs that must accompany a ship (see `lamprey-docs-and-writing` — the README update is mandatory, not optional).

## Run modes

| Mode | Command | Notes |
|---|---|---|
| Dev | `ELECTRON_EXEC_PATH=… npx electron-vite dev` | see `lamprey-build-and-env` |
| Preview | `npm run preview` | serves the built bundle |
| Packaged | installed `Lamprey-x64.exe` or portable zip | single-instance lock: a second launch focuses the existing window |
| Headless CLI | `--lamprey-headless` argv (`npm run lamprey`) | exempt from the single-instance lock |

## userData layout (`%APPDATA%\Lamprey\` on Windows)

| Item | What | Safe to delete? |
|---|---|---|
| `lamprey.db` (+ `-wal`/`-shm`) | all conversations/messages/loops/audit | **No** — that's the user's data |
| `keys.json` | encrypted API keys | No (keys lost; `.corrupt-*` siblings are forensic copies) |
| `settings.json` | app settings | Deleting resets to defaults |
| `tool-results/` | spilled tool outputs | Yes — GC'd automatically (age > 7 days, then oldest-first to a 256 MB cap) |
| `plugins/`, `skills/`, `slash-commands/`, `snip/filters/` | user + bootstrapped content | Deleting re-bootstraps bundled defaults on next launch |
| `backups/` | DB backups (encryption-aware) | Keep unless space-critical |

## Release artifacts — the contract

`npm run build:win` (from the **primary checkout**, never a worktree) must produce in `dist/`:

1. `Lamprey-x64.exe` — NSIS installer
2. `Lamprey-x64.exe.blockmap` — delta-update manifest
3. `Lamprey-x64.zip` — portable
4. `latest.yml` — updater metadata (version + sha512)

Names are deliberately version-free so the CDN URLs (fronted by `cdn.islandmountain.io`) never change ("evergreen artifacts"). The version lives in the git tag, GitHub release, and `latest.yml`. **Every ship must end with all four present in `dist/` with fresh timestamps and `latest.yml` matching `package.json` version** — verify this explicitly as the final step.

## The Bucket pipeline (the canonical ship path)

When the user says **"Bucket"** (any variant), run from the repo root:

```powershell
pwsh scripts\bucket.ps1          # flags: -NoBuild -NoTag -DryRun
```

What it does, in order:
1. Builds `dist/` if `latest.yml` doesn't match `package.json` version.
2. Tags + pushes `vX.Y.Z` if the tag is missing.
3. Uploads `Lamprey-x64.exe` + `Lamprey-x64.zip` to the R2 bucket.
4. Creates or `--clobber`-updates the GitHub release with all four artifacts.
5. Purges the Cloudflare cache for the two CDN URLs (if `.cf/token` exists).

**Preconditions:**
- **PowerShell 7** (`pwsh`) — the script uses PS7-only syntax; Windows PowerShell 5.1 cannot parse it. If `Get-Command pwsh` fails: `winget install --id Microsoft.PowerShell --silent`.
- One-time setup: `pwsh scripts\bucket-setup.ps1` writes `.bucket.json` (R2 account/bucket/CDN/zone/repo), `~/.aws/credentials` (R2 token), `.cf/token` — all gitignored. **These persist across sessions; read the files, don't re-prompt the user for credentials.**
- **Run from the primary repo, not a worktree.** Worktrees have no `node_modules`; electron-builder fails with "Cannot compute electron version". From a worktree session: push the ship-arc to `origin/main`, fast-forward the primary (`git -C <primary> pull --ff-only origin main`), then Bucket from primary.

**Failure recovery:**
- `gh release create` failing mid-upload with HTTP 404: do **not** rerun the bucket script. Recover manually with one command carrying all four artifacts:
  `gh release create vX.Y.Z dist/Lamprey-x64.exe dist/Lamprey-x64.exe.blockmap dist/Lamprey-x64.zip dist/latest.yml --title … --notes …`
  then delete any orphaned `untagged-<hash>` draft. R2 upload and CF purge are independent of the GH release — check whether they already succeeded before redoing them.

## CI release paths (`.github/workflows/build.yml`)

- **Tag push `v*`** → windows/linux/macos build jobs attach artifacts to a **draft** GitHub release (the Bucket pipeline publishes the real one).
- **Branch push to `main`** → same builds, but artifacts upload only as workflow artifacts (14-day retention), no release.
- All build jobs run both tsc configs + `smoke:bundle` + `smoke:renderer`. macOS builds unsigned (`CSC_IDENTITY_AUTO_DISCOVERY: 'false'`).

## Ship-completion checklist

1. Version bumped in `package.json`; full gate green (`npm run verify:proof`, both smokes, `npm test`).
2. DEVLOG phase/release entry written; CLAUDE.md current-state updated (formats: `lamprey-docs-and-writing`).
3. **README.md updated** — download heading/URLs, "New in vX.Y.Z" paragraph, Quick start link, Roadmap top entry. This is a standing rule on every release, without exception.
4. `pwsh scripts\bucket.ps1` (or tag + `gh release create` for a manual path).
5. Final verification: four artifacts in `dist/` with fresh timestamps; `latest.yml` version matches; GitHub release page shows all four; CDN URLs serve the new build after purge.

Push policy still applies (`lamprey-change-control`): a ship instruction from the user authorizes the pushes it requires; don't ask again mid-flow.

## Code signing status (2026-07-02)

Builds are unsigned; the updater verifies sha512 from `latest.yml` only. When an Authenticode cert is acquired (owner action), setting `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` enables signing with no code changes (`electron-builder.yml` is pre-wired).

## Provenance and maintenance

Based on reads of `scripts/bucket.ps1`, `scripts/bucket-setup.ps1`, `electron-builder.yml`, `.github/workflows/build.yml`, CLAUDE.md ship rules, and release-practice memory notes, at v0.16.0 (2026-07-02).

Re-verify:
- Pipeline steps/flags: `head -60 scripts/bucket.ps1`
- Artifact names: `grep -n "artifactName\|productName" electron-builder.yml`
- CI paths: `grep -n "tags:\|startsWith" .github/workflows/build.yml`
- pwsh present: `pwsh -v`
