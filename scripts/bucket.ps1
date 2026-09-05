# Bucket: completed tag producer, followed by final GitHub/CDN byte verification.
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
