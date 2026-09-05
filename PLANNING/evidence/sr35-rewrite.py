"""Replace obsolete Bucket orchestration and generated release instructions."""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
(root / 'scripts/bucket.ps1').write_text('''# Bucket: completed tag producer, followed by final GitHub/CDN byte verification.
# -NoBuild is retained for compatibility; CI production is always required.
# -NoCrossPlatform is rejected because it cannot complete the full ship gate.
[CmdletBinding()]
param([switch]$NoBuild, [switch]$NoTag, [switch]$NoCrossPlatform, [switch]$DryRun)
$ErrorActionPreference = "Stop"
$bucketArgs = @()
if ($NoBuild) { $bucketArgs += "--no-build" }
if ($NoTag) { $bucketArgs += "--no-tag" }
if ($NoCrossPlatform) { $bucketArgs += "--no-cross-platform" }
if ($DryRun) { $bucketArgs += "--dry-run" }
& node (Join-Path $PSScriptRoot "bucket.cjs") @bucketArgs
exit $LASTEXITCODE
# Authored and reviewed by Basho Parks, copyright 2026
''', encoding='utf-8', newline='\n')
setup = root / 'scripts/bucket-setup.ps1'
text = setup.read_text(encoding='utf-8').replace('USS-Parks/lamprey', 'USS-Parks/Lamprey-Harness')
text = text.replace('$json = [ordered]@{', '$json = [ordered]@{\n    aws = [ordered]@{ profile = "r2" }', 1)
setup.write_text(text, encoding='utf-8', newline='\n')
for name in ['AGENTS.md', 'CLAUDE.md']:
    p = root / name
    text = p.read_text(encoding='utf-8')
    old = 'It builds the canonical Windows artifacts when needed, tags and pushes `vX.Y.Z`, uploads the EXE and ZIP to R2, writes the GitHub release from `RELEASE_NOTES/vX.Y.Z.md`, waits for the tag workflow, mirrors the macOS DMG and Linux AppImage to R2, and purges each CDN URL.'
    new = 'It requires committed source matching main, tags and pushes `vX.Y.Z`, waits for the exact successful tag workflow to finish all platform builds, downloads its six final assets, validates installer metadata, mirrors those bytes to R2, updates release notes, purges configured CDN URLs, and hashes final GitHub/CDN downloads. A mismatch or inaccessible download fails Bucket and records a partial receipt in `dist/bucket-vX.Y.Z-<source>/manifest.json`.'
    assert old in text, name
    p.write_text(text.replace(old, new), encoding='utf-8', newline='\n')
(root / 'openwiki/operations/ship-and-bucket.md').write_text('''---
title: Ship and release
tags: [release, ship, bucket]
resource: repo://scripts/bucket.ps1
---

# Ship and release

Run `pwsh scripts/bucket.ps1` from the canonical checkout after the release candidate is committed, pushed and verified. The wrapper delegates to `scripts/bucket.cjs`. Publication requires the user's STS/Bucket authorization.

## Prerequisites

- Windows, Node 22.12 or later, installed project dependencies, Git, authenticated GitHub CLI, curl and AWS CLI v2.
- `.bucket.json` names the canonical `USS-Parks/Lamprey-Harness` repository, R2 account/bucket and CDN hostname.
- AWS credentials come from project-local `.aws/credentials` when present, otherwise the user's AWS configuration. The configured `aws.profile` is used, defaulting to `default` for existing configurations.
- `scripts/bucket-setup.ps1` creates new configurations with profile `r2`, matching the credentials it writes. It does not authenticate GitHub or configure Git signing.
- Optional `.cf/token` and the configured zone ID enable cache purging. Without them, final CDN hashes must still match.
- Update both package files and author `RELEASE_NOTES/vX.Y.Z.md`. Download links are authored in those notes; Bucket does not invent or fill a table.

## Ordered pipeline

1. Require tracked source to be clean and HEAD to match remote main. Reject an existing release tag pointing to different source.
2. Create/push the tag if needed. The `build.yml` tag workflow is the sole artifact producer: Windows builds NSIS/ZIP, macOS builds its DMG, and Linux builds its AppImage.
3. Wait for the workflow matching both tag and source SHA to finish successfully. Existing release assets never bypass this wait.
4. Download all six final assets into `dist/bucket-vX.Y.Z-<source>/`. Capture source, version, producer and SHA-256/size for each file. Check `latest.yml` version, installer name, size and SHA-512 against the EXE.
5. Update GitHub release notes and mirror all six files to R2. Purge the configured cache.
6. Hash the final GitHub and CDN downloads against the captured bytes. Recheck the producer. Only then write a `verified` manifest and report success.

The six assets are `Lamprey-x64.exe`, `Lamprey-x64.exe.blockmap`, `Lamprey-x64.zip`, `latest.yml`, `Lamprey-arm64.dmg`, and `Lamprey-x86_64.AppImage`. The DMG is a macOS artifact, not iOS. Auto-update follows the GitHub provider configured in `electron-builder.yml`; CDN downloads are a separate distribution route.

`-DryRun` performs read-only planning and reports tag conflicts without tagging or uploading. `-NoTag` requires an existing matching remote tag. `-NoBuild` is a compatibility flag: there is no local artifact producer, and successful CI production remains mandatory. `-NoCrossPlatform` fails because a partial platform set cannot satisfy Bucket.

## Failure and recovery

A failed step returns nonzero and records `status: partial` when the publication folder has been established. Already-published files are not rolled back. Inspect the receipt, repair the cause, and rerun from the same source/tag; never move a published tag to hide a failure. Stale or inaccessible CDN bytes block completion even when GitHub release creation succeeded.

Keep the final manifest and installer launch/update-metadata smoke evidence with the release ledger. A successful build alone does not prove installation or runtime behavior. Builds remain unsigned under the project's existing non-goal; no signing claim is made.

Authored and reviewed by Basho Parks, copyright 2026
''', encoding='utf-8', newline='\n')
p = root / 'openwiki/quickstart.md'
text = p.read_text(encoding='utf-8').replace('(Windows only; builds all platforms, tags, uploads to CDN)', '(Windows orchestrator; waits for native platform CI builds and verifies final downloads)')
p.write_text(text, encoding='utf-8', newline='\n')
