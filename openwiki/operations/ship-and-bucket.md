---
title: Ship and release
tags: [release, ship, bucket]
resource: repo://scripts/bucket.ps1
---

# Ship and release

Run `pwsh scripts/bucket.ps1` from the canonical checkout after the release candidate is committed, pushed and verified. The wrapper delegates to `scripts/bucket.cjs`. Publication requires the user's STS/Bucket authorization.

GitHub **v0.33.0** is published at source `0b49c399a45e3aeffc94280b2dcd3e429179f83a`. Do not overwrite v0.32.0. CDN/TL-W4 stays open until all six GitHub/local/CDN hashes match.

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
4. Download the exact run's Windows, macOS and Linux workflow artifacts into `dist/bucket-vX.Y.Z-<source>/`. These build artifacts are authoritative; release assets are verified against them afterward. Capture source, version, producer attempt and SHA-256/size for each file. Check `latest.yml` version, installer name, size and SHA-512 against the EXE.
5. Update GitHub release notes and mirror all six files to R2. Purge the configured cache.
6. Hash the final GitHub and CDN downloads against the captured bytes. Recheck the producer. Only then write a `verified` manifest and report success.

The six assets are `Lamprey-x64.exe`, `Lamprey-x64.exe.blockmap`, `Lamprey-x64.zip`, `latest.yml`, `Lamprey-arm64.dmg`, and `Lamprey-x86_64.AppImage`. The DMG is a macOS artifact, not iOS. Auto-update follows the GitHub provider configured in `electron-builder.yml`; CDN downloads are a separate distribution route.

`-DryRun` performs read-only planning and reports tag conflicts without tagging or uploading. `-NoTag` requires an existing matching remote tag. `-NoBuild` is a compatibility flag: there is no local artifact producer, and successful CI production remains mandatory. `-NoCrossPlatform` fails because a partial platform set cannot satisfy Bucket.

## Failure and recovery

A failed step returns nonzero and records `status: partial` when the publication folder has been established. Already-published files are not rolled back. Inspect the receipt, repair the cause, and rerun from the same source/tag; never move a published tag to hide a failure. Stale or inaccessible CDN bytes block completion even when GitHub release creation succeeded.

Keep the final manifest and installer launch/update-metadata smoke evidence with the release ledger. A successful build alone does not prove installation or runtime behavior. Builds remain unsigned under the project's existing non-goal; no signing claim is made.

Authored and reviewed by Basho Parks, copyright 2026
