---
type: Operations
title: Ship and Release — The Bucket Pipeline
description: Versioning, building, tagging, and publishing releases to GitHub and CDN (v0.30.0).
tags: [release, ship, ci-cd, bucket]
resource: repo://scripts/bucket.ps1
sources:
  - id: openwiki-source-7a80b79a6fb3618cbfab08a2
    resource: repo://.github/workflows/build.yml
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: {by: "openwiki/0.3.3", at: "2026-08-23T18:40:37.531Z"}
verified:
  - by: openwiki/0.3.3
    at: 2026-08-23T18:40:37.531Z
---

# Ship and Release — The Bucket Pipeline

**Version:** v0.30.0  
**Author:** Basho Parks  
**Platform:** Windows (build machine requirement)

---

## What Bucket Is

**"Bucket" = the full ship pipeline.** When the user says "Bucket" or "ship," the entire sequence runs end-to-end:

```
Version bump (package.json, RELEASE_NOTES)
  ↓
Build Windows artifacts (npm run build:win)
  ↓
Git tag + push (git push origin vX.Y.Z)
  ↓
GitHub Actions CI builds all platforms (Linux, macOS)
  ↓
GitHub release create (with RELEASE_NOTES body)
  ↓
Upload to CDN (R2)
  ↓
DNS purge
  ↓
Done
```

**Run command:** `pwsh scripts\bucket.ps1` from the repo root.

---

## Prerequisites

### One-Time Setup

```powershell
pwsh scripts\bucket-setup.ps1
```

Sets up:
- Cloudflare R2 credentials (`~/.config/bucket.env`)
- GitHub CLI authentication (gh auth)
- Git signing (if desired)

### Per-Release Requirements

- **Windows machine** (build requires Windows; Linux CI handles Linux/macOS)
- **Electron 43** installed locally
- **Node 22+** in PATH
- **Git** with upstream access
- **GitHub CLI** (`gh`) authenticated
- **npm** with dev dependencies installed
- **PowerShell 7+** (or Windows PowerShell 5.1 with some caveats)

---

## Step-by-Step Release Flow

### 1. Prepare Version

Update `package.json`:
```json
{
  "version": "0.30.1"
}
```

Create `RELEASE_NOTES/v0.30.1.md`:
```markdown
# Lamprey v0.30.1

## Changes
- Fix: Settlement status cap on failed turns
- Feat: Add X provider support
- Chore: Update dependencies

## Downloads
| Platform | Format |
|---|---|
<!-- openwiki: broken internal link [...] file "..." does not exist. Fix the href or restore the target, then delete this comment. -->
| **Windows** | [Lamprey-x64.exe](...)  |
<!-- openwiki: broken internal link [...] file "..." does not exist. Fix the href or restore the target, then delete this comment. -->
| **macOS** | [Lamprey-arm64.dmg](...)  |
<!-- openwiki: broken internal link [...] file "..." does not exist. Fix the href or restore the target, then delete this comment. -->
| **Linux** | [Lamprey-x86_64.AppImage](...)  |
```

**Note:** The Downloads table is auto-populated by bucket.ps1 after artifacts are ready; seed it with placeholder links.

### 2. Build Windows Distributable

```powershell
npm run build:win
```

This:
- Runs `electron-vite build` (outputs to `out/`)
- Runs `electron-builder --win --publish never` (outputs to `dist/`)
- Produces `dist/Lamprey-x64.exe` (NSIS installer) and `dist/Lamprey-x64.zip` (portable)

**Output artifacts (dist/):**
- `Lamprey-x64.exe` — Windows installer
- `Lamprey-x64.zip` — Portable Windows package

### 3. Git Tag and Push

```bash
git tag v0.30.1
git push origin v0.30.1
```

**Tag push triggers GitHub Actions:**
- Workflow: `.github/workflows/build.yml` on `ref: refs/tags/v*`
- Runners: ubuntu-latest, windows-latest, macos-latest
- Builds: All three platforms (Windows rebuilds, Linux + macOS built in CI)

### 4. GitHub Actions Build (Automated)

Workflow runs in parallel:
1. **ubuntu-latest**: `npm run build:linux` → Linux AppImage
2. **windows-latest**: `npm run build:win` → Windows installer + ZIP (artifacts only, no publish)
3. **macos-latest**: `npm run build:mac` → macOS DMG

**Outputs attached to tag:** All four artifacts + CHECKSUMS file

### 5. Create GitHub Release

```bash
gh release create v0.30.1 \
  --title "Lamprey v0.30.1" \
  --notes-file RELEASE_NOTES/v0.30.1.md \
  dist/Lamprey-x64.exe \
  dist/Lamprey-x64.zip
```

Bucket.ps1 automates this; it:
- Reads `RELEASE_NOTES/v0.30.1.md` for release body
- Waits for CI artifacts
- Downloads Linux AppImage and macOS DMG from Actions
- Uploads all four artifacts to the release

### 6. Upload to CDN

```bash
wrangler r2 cp dist/Lamprey-x64.exe r2://lamprey/releases/v0.30.1/
wrangler r2 cp dist/Lamprey-arm64.dmg r2://lamprey/releases/v0.30.1/
# ... (all four artifacts)
```

**CDN URL pattern:** `https://releases.example.com/v0.30.1/Lamprey-x64.exe`

### 7. Purge Cache

```bash
wrangler cache purge https://releases.example.com/v0.30.1/Lamprey-x64.exe
# ... (all four artifacts)
```

Users see fresh downloads immediately.

---

## What Gets Built

### Windows (npm run build:win)

```
electron-vite build
  ├─ Compiles electron/ (TypeScript → out/main/index.js)
  ├─ Bundles src/ (React 19 → out/renderer/)
  └─ Outputs to out/

electron-builder --win
  ├─ Reads electron-builder.yml
  ├─ Creates NSIS installer → dist/Lamprey-x64.exe
  ├─ Creates portable ZIP → dist/Lamprey-x64.zip
  └─ Outputs to dist/
```

**NSIS installer:**
- Single-file setup wizard
- Desktop + Start Menu shortcuts
- Auto-update capable (delta updates via electron-updater, not used in Lamprey currently)
- ~150 MB download

### Linux (CI, ubuntu-latest)

```
npm run build:linux
  └─ electron-builder --linux
     ├─ Creates AppImage → Lamprey-x86_64.AppImage
     └─ Outputs to dist/
```

**AppImage:**
- Portable executable (chmod +x + run)
- No installation required
- ~150 MB

### macOS (CI, macos-latest)

```
npm run build:mac
  └─ electron-builder --mac
     ├─ Creates DMG → Lamprey-arm64.dmg (or -x64)
     └─ Outputs to dist/
```

**DMG:**
- Disk image
- Drag-to-Applications install
- ~150 MB
- **Unsigned** (user must right-click → Open on first launch per macOS Gatekeeper)

---

## Continuous Integration

**.github/workflows/build.yml:**

| Trigger | Branch | Action |
|---|---|---|
| `push:` to `main` | main | Build all platforms, upload as workflow artifacts (14-day retention) |
| `push:` of tag `v*` | (tag) | Build all platforms, attach to GitHub release |

**Artifact retention:**
- Branch builds: 14 days (no release)
- Tag builds: Attached to release (permanent)

**Test gate (before build):**
```bash
npm run lint
npm run typecheck
npm run test
npm run verify:proof
```

All must pass; build is skipped if gate fails.

---

## Artifact Locations

| Artifact | Location | Size |
|---|---|---|
| `Lamprey-x64.exe` | GitHub release + R2 | ~150 MB |
| `Lamprey-x64.zip` | GitHub release + R2 | ~100 MB |
| `Lamprey-arm64.dmg` | GitHub release + R2 | ~150 MB |
| `Lamprey-x86_64.AppImage` | GitHub release + R2 | ~150 MB |

**GitHub Release:** https://github.com/USS-Parks/Lamprey-Harness/releases/latest

**CDN:** https://releases.example.com/v0.30.1/ (user-configured, typically R2)

---

## Bucket.ps1 Manual Usage

If automation is needed or troubleshooting:

```powershell
# Full pipeline (version bump to CDN)
pwsh scripts/bucket.ps1

# Rebuild Windows locally
npm run build:win

# Tag and push (trigger CI)
git tag v0.30.1 && git push origin v0.30.1

# Create release (after CI finishes)
gh release create v0.30.1 \
  --notes-file RELEASE_NOTES/v0.30.1.md \
  dist/Lamprey-x64.exe dist/Lamprey-x64.zip

# Upload to CDN
wrangler r2 cp dist/ r2://lamprey/releases/v0.30.1/

# Purge cache
wrangler cache purge https://releases.example.com/v0.30.1/*
```

---

## Important Notes

### dist/ Is Gitignored

```
dist/
out/
```

Never commit built artifacts. They are:
- Platform-specific (binary)
- Reproducible from source (version-pinned dependencies)
- Generated on every build

### Unsigned Builds Are Permanent Non-Goal

macOS DMG is **unsigned**. Users must:
1. Right-click the app → Open
2. Confirm "Open anyway" in Gatekeeper dialog

This is by design. Code signing requires:
- Apple Developer certificate ($99/year)
- Secure key storage
- CI configuration

Lamprey chooses end-user control over developer authority.

### Version Schema

- **Semantic versioning:** `MAJOR.MINOR.PATCH` (e.g., `0.30.1`)
- Currently: `0.MINOR.PATCH` (never bumping MAJOR toward 1.0.0 yet)
- Each release: new entry in `RELEASE_NOTES/`
- Commit message cap: 72 chars per JM-0 trailer rules

### Release Notes Format

**Required for bucket.ps1 to work:**
- File: `RELEASE_NOTES/v0.30.1.md`
- Syntax: Markdown with h1 title `# Lamprey vX.Y.Z`
- Content: Release highlights (bullets or sections)
- Table: Downloads table with placeholder links (bucket fills in URLs)

```markdown
# Lamprey v0.30.1

## Changes
- Fix: Settlement status cap on failed turns
- Feat: Add new provider X
- Perf: 20% speedup on RAG queries

## Known Issues
- R1–R4 playbooks parked (honest gap)

## Downloads
(table auto-filled by bucket.ps1)
```

---

## Change Navigation

**To ship a release:**
1. Update `package.json` → version
2. Create `RELEASE_NOTES/vX.Y.Z.md`
3. Commit with message: `Release vX.Y.Z`
4. Run `pwsh scripts\bucket.ps1`
5. Wait for GitHub Actions to complete
6. Verify artifacts on GitHub release page

**To troubleshoot a failed build:**
1. Check `.github/workflows/build.yml` Actions run
2. Review test logs (lint, typecheck, vitest, verify:proof)
3. Fix errors locally
4. Re-push (or delete tag + re-tag after fix)

**To ship a hotfix patch:**
1. Merge the fix to `main`
2. Bump `package.json` version (e.g., 0.30.0 → 0.30.1)
3. Create RELEASE_NOTES file
4. Run bucket

---

## Key Files

| File | Purpose |
|---|---|
| `scripts/bucket.ps1` | Full ship pipeline orchestration |
| `scripts/bucket-setup.ps1` | One-time credential setup |
| `.github/workflows/build.yml` | CI/CD trigger for all platforms |
| `electron-builder.yml` | Build configuration (signing, paths, artifact names) |
| `package.json` | Version authority |
| `RELEASE_NOTES/vX.Y.Z.md` | Release notes read by bucket.ps1 |

---

Further reading: [CLAUDE.md](../../CLAUDE.md) (build requirements), [README.md](../../README.md) (download links)

---

Authored and reviewed by Basho Parks, copyright 2026
