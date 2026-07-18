# Bucket — one-command ship pipeline for Lamprey.
#
# What it does (in order):
#   1. Reads version from package.json.
#   2. If dist/latest.yml's version doesn't match, runs `npm run build:win`.
#   3. Tags + pushes vX.Y.Z if the tag doesn't already exist on origin.
#   4. In parallel:
#        - Uploads Lamprey-x64.exe + Lamprey-x64.zip to R2 (overwrites).
#        - Creates/updates the GitHub release with all four Windows artifacts.
#   5. Waits for the tag workflow, then mirrors the DMG and AppImage to R2.
#   6. Purges Cloudflare cache for every published download (if .cf/token exists).
#
# Setup once: `pwsh scripts/bucket-setup.ps1`. After that this script is the
# entire ship-arc — no env vars to remember, no credential dance.
#
# Run from repo root (or anywhere; the script resolves $repoRoot itself):
#   pwsh scripts/bucket.ps1
#
# Optional flags:
#   -NoBuild        Skip the build step (use whatever's in dist/ now).
#   -NoTag          Skip git tag creation/push (use existing tag).
#   -NoCrossPlatform  Skip waiting for CI and mirroring DMG/AppImage.
#   -DryRun         Print what would happen; don't actually upload.

[CmdletBinding()]
param(
  [switch]$NoBuild,
  [switch]$NoTag,
  [switch]$NoCrossPlatform,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# === Resolve paths ===
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir

$configPath  = Join-Path $repoRoot ".bucket.json"
$awsCreds    = Join-Path $repoRoot ".aws\credentials"
$awsConf     = Join-Path $repoRoot ".aws\config"
$cfTokenPath = Join-Path $repoRoot ".cf\token"
$dist        = Join-Path $repoRoot "dist"

# === Preflight ===
if (-not (Test-Path $configPath)) {
  Write-Host "ERROR: $configPath not found." -ForegroundColor Red
  Write-Host "Run: pwsh scripts\bucket-setup.ps1" -ForegroundColor Yellow
  exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json

# AWS creds resolution: prefer project-local `.aws/credentials` if present;
# else fall back to the user-global `~/.aws/credentials`. The profile name
# comes from .bucket.json (`aws.profile`, default = "default").
$awsProfile = if ($config.aws -and $config.aws.profile) { $config.aws.profile } else { "default" }

if (Test-Path $awsCreds) {
  $env:AWS_SHARED_CREDENTIALS_FILE = $awsCreds
  if (Test-Path $awsConf) { $env:AWS_CONFIG_FILE = $awsConf }
  Write-Host "  Using project-local AWS creds (.aws\credentials) profile [$awsProfile]" -ForegroundColor Green
} else {
  Write-Host "  Using user-global AWS creds (~/.aws/credentials) profile [$awsProfile]" -ForegroundColor Green
}

# Locate aws.exe — it's installed but often not on PATH in non-PS shells.
$awsExe = (Get-Command aws.exe -ErrorAction SilentlyContinue)?.Source
if (-not $awsExe) { $awsExe = "C:\Program Files\Amazon\AWSCLIV2\aws.exe" }
if (-not (Test-Path $awsExe)) {
  Write-Host "ERROR: aws.exe not found. Install AWS CLI v2." -ForegroundColor Red
  exit 1
}

# === Read version ===
$pkg = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = $pkg.version
$tag = "v$version"
$releaseNotes = Join-Path $repoRoot "RELEASE_NOTES\$tag.md"

Write-Host ""
Write-Host "=== Bucket: ship v$version ===" -ForegroundColor Cyan
Write-Host ""

# === Build (if needed) ===
$needsBuild = $true
$latestYml = Join-Path $dist "latest.yml"
if (Test-Path $latestYml) {
  $latestContent = Get-Content $latestYml -Raw
  if ($latestContent -match "version:\s*$([regex]::Escape($version))\b") {
    $needsBuild = $false
    Write-Host "  dist/ already at v$version — skipping build" -ForegroundColor Green
  }
}
if ($NoBuild) {
  Write-Host "  -NoBuild flag set — skipping build" -ForegroundColor Yellow
  $needsBuild = $false
}
if ($needsBuild) {
  Write-Host "  Building (npm run build:win)..." -ForegroundColor White
  if (-not $DryRun) {
    Push-Location $repoRoot
    try {
      npm run build:win
      if ($LASTEXITCODE -ne 0) { throw "npm run build:win failed (exit $LASTEXITCODE)" }
    } finally {
      Pop-Location
    }
  }
}

# === Verify dist/ artifacts ===
$artifacts = @("Lamprey-x64.exe", "Lamprey-x64.exe.blockmap", "Lamprey-x64.zip", "latest.yml")
foreach ($f in $artifacts) {
  $p = Join-Path $dist $f
  if (-not (Test-Path $p)) {
    Write-Host "ERROR: missing artifact: $p" -ForegroundColor Red
    exit 1
  }
}
Write-Host "  dist/ artifacts verified" -ForegroundColor Green

# === Tag (if needed) ===
if (-not $NoTag) {
  Push-Location $repoRoot
  try {
    $tagExists = $false
    git rev-parse "refs/tags/$tag" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $tagExists = $true }

    if (-not $tagExists) {
      Write-Host "  Creating + pushing tag $tag" -ForegroundColor White
      if (-not $DryRun) {
        git tag -a $tag -m $tag
        if ($LASTEXITCODE -ne 0) { throw "git tag failed" }
        git push origin $tag
        if ($LASTEXITCODE -ne 0) { throw "git push tag failed" }
      }
    } else {
      Write-Host "  Tag $tag already exists — skipping" -ForegroundColor Green
    }
  } finally {
    Pop-Location
  }
}

# === Parallel: R2 upload + GH release ===
$artifactPaths = $artifacts | ForEach-Object { Join-Path $dist $_ }

if ($DryRun) {
  Write-Host ""
  Write-Host "[DRY-RUN] Would upload to R2:" -ForegroundColor Yellow
  Write-Host "  s3://$($config.r2.bucket)/Lamprey-x64.exe"
  Write-Host "  s3://$($config.r2.bucket)/Lamprey-x64.zip"
  if (-not $NoCrossPlatform) {
    Write-Host "  s3://$($config.r2.bucket)/Lamprey-arm64.dmg"
    Write-Host "  s3://$($config.r2.bucket)/Lamprey-x86_64.AppImage"
  }
  Write-Host "[DRY-RUN] Would create/update GH release: $tag" -ForegroundColor Yellow
  Write-Host "[DRY-RUN] Would purge CF cache for cdn.islandmountain.io URLs" -ForegroundColor Yellow
  exit 0
}

# Per-step outcome flags. The GH-release step has flaked at `gh release create`
# on three consecutive ships, which used to `throw` and abandon the R2 wait + CF
# purge. We now CAPTURE step failures and run every step to completion, then
# surface a non-zero exit at the very end. R2 + CF never get stranded by GH.
$ghError = $null
$r2Failed = $false
$crossPlatformError = $null

# Kick off R2 upload in a background job (multipart for the big zip)
$endpoint = "https://$($config.r2.accountId).r2.cloudflarestorage.com"
Write-Host ""
Write-Host "  Starting R2 upload (background)..." -ForegroundColor White
$useProjectCreds = (Test-Path $awsCreds)
$r2Job = Start-Job -Name "bucket-r2" -ScriptBlock {
  param($bucket, $endpoint, $dist, $awsCreds, $awsConf, $useProjectCreds, $awsProfile, $awsExe)
  if ($useProjectCreds) {
    $env:AWS_SHARED_CREDENTIALS_FILE = $awsCreds
    if (Test-Path $awsConf) { $env:AWS_CONFIG_FILE = $awsConf }
  }
  foreach ($f in "Lamprey-x64.exe", "Lamprey-x64.zip") {
    $src = Join-Path $dist $f
    & $awsExe s3 cp $src "s3://$bucket/$f" `
      --endpoint-url $endpoint --profile $awsProfile --checksum-algorithm CRC32
    if ($LASTEXITCODE -ne 0) { throw "aws s3 cp $f failed (exit $LASTEXITCODE)" }
  }
} -ArgumentList $config.r2.bucket, $endpoint, $dist, $awsCreds, $awsConf, $useProjectCreds, $awsProfile, $awsExe

# GitHub release. The create-WITH-assets path flakes reliably (HTTP 404 on the
# uploads endpoint — three ships running), so DECOUPLE the two operations:
#   1. ensure the release ROW exists (create with NO assets — fast + reliable,
#      retried a few times for transient API hiccups), then
#   2. attach the four files via the reliable `gh release upload --clobber`.
# Any failure is captured into $ghError (not thrown) so the R2 wait + CF purge
# below still run and a partial ship is reported honestly at the end.
Write-Host "  Creating/updating GH release $tag..." -ForegroundColor White
Push-Location $repoRoot
try {
  gh release view $tag --repo $config.github.repo 2>$null | Out-Null
  $releaseExists = ($LASTEXITCODE -eq 0)

  if (-not $releaseExists) {
    for ($attempt = 1; $attempt -le 3 -and -not $releaseExists; $attempt++) {
      if (Test-Path $releaseNotes) {
        gh release create $tag --repo $config.github.repo --title $tag --notes-file $releaseNotes
      } else {
        gh release create $tag --repo $config.github.repo --title $tag --notes "Release $tag"
      }
      if ($LASTEXITCODE -eq 0) {
        $releaseExists = $true
      } else {
        Write-Host "  gh release create attempt $attempt/3 failed (exit $LASTEXITCODE)" -ForegroundColor Yellow
        if ($attempt -lt 3) { Start-Sleep -Seconds 3 }
      }
    }
    if (-not $releaseExists) { $ghError = "gh release create failed after 3 attempts" }
  }

  if (-not $ghError) {
    gh release upload $tag --repo $config.github.repo --clobber @artifactPaths
    if ($LASTEXITCODE -ne 0) {
      $uploadExit = $LASTEXITCODE
      # The tag workflow may finish its own Windows upload while this command is
      # running. GitHub then returns 404/422 for the colliding asset even though
      # the release is complete. Reconcile the live inventory before calling the
      # ship partial; names are sufficient because both producers build this tag.
      $assetJson = gh release view $tag --repo $config.github.repo --json assets 2>$null
      if ($LASTEXITCODE -eq 0) {
        try {
          $uploadedNames = @(($assetJson | ConvertFrom-Json).assets |
            Where-Object { $_.state -eq "uploaded" } |
            ForEach-Object { $_.name })
          $expectedNames = @($artifactPaths | ForEach-Object { Split-Path -Leaf $_ })
          $missingNames = @($expectedNames | Where-Object { $_ -notin $uploadedNames })
          if ($missingNames.Count -eq 0) {
            Write-Host "  GH upload raced the tag workflow; live release inventory is complete" -ForegroundColor Green
          } else {
            $ghError = "gh release upload failed (exit $uploadExit); missing: $($missingNames -join ', ')"
          }
        } catch {
          $ghError = "gh release upload failed (exit $uploadExit); release inventory could not be parsed"
        }
      } else {
        $ghError = "gh release upload failed (exit $uploadExit); release inventory check failed"
      }
    }
  }

  if (-not $ghError -and (Test-Path $releaseNotes)) {
    gh release edit $tag --repo $config.github.repo --title $tag --notes-file $releaseNotes
    if ($LASTEXITCODE -ne 0) { $ghError = "gh release notes update failed (exit $LASTEXITCODE)" }
  }

  if (-not $ghError) {
    Write-Host "  GH release done" -ForegroundColor Green
  } else {
    Write-Host "  WARNING: $ghError — continuing so R2 + CF still complete." -ForegroundColor Yellow
  }
} finally {
  Pop-Location
}

# Wait for R2 job
Write-Host "  Waiting for R2 upload..." -ForegroundColor White
Wait-Job -Job $r2Job | Out-Null
$r2Output = Receive-Job -Job $r2Job 2>&1
# After Wait-Job returns, the job object's State property is the final
# verdict — re-fetching via `Get-Job $r2Job` would pass the job object
# as a positional -Name argument and fail with
# "The command cannot find the job because the job name
# System.Management.Automation.PSRemotingJob was not found."
$r2State = $r2Job.State
Remove-Job -Job $r2Job
if ($r2State -ne "Completed") {
  # Capture (don't exit) so the CF purge below still fires for whatever DID
  # upload, and the final summary reports the partial ship.
  $r2Failed = $true
  Write-Host "  WARNING: R2 upload did not complete (state: $r2State). Output:" -ForegroundColor Red
  $r2Output | Write-Host
} else {
  Write-Host "  R2 upload done" -ForegroundColor Green
}

# === Cross-platform release assets ===
# Windows cannot build the macOS DMG or Linux AppImage. The tag workflow does,
# attaches both to the same release, and this step mirrors them to R2 so GitHub
# and the CDN expose the same existing platform set. Lamprey has no iOS target.
$publishedFiles = @("Lamprey-x64.exe", "Lamprey-x64.zip")
if (-not $NoCrossPlatform) {
  Write-Host "  Waiting for macOS/Linux tag artifacts..." -ForegroundColor White
  $crossDir = Join-Path $dist "bucket-cross-$version"
  New-Item -ItemType Directory -Path $crossDir -Force | Out-Null
  $crossNames = @("Lamprey-arm64.dmg", "Lamprey-x86_64.AppImage")

  $downloadCrossAssets = {
    gh release download $tag --repo $config.github.repo --clobber --dir $crossDir `
      --pattern "*.dmg" --pattern "*.AppImage" 2>$null
    return ($crossNames | ForEach-Object { Test-Path (Join-Path $crossDir $_) }) -notcontains $false
  }

  $crossReady = & $downloadCrossAssets
  if (-not $crossReady) {
    $tagSha = (git -C $repoRoot rev-list -n 1 $tag).Trim()
    $workflowRun = $null
    for ($attempt = 1; $attempt -le 12 -and -not $workflowRun; $attempt++) {
      $runsJson = gh run list --repo $config.github.repo --workflow build.yml --event push `
        --limit 20 --json databaseId,headBranch,headSha,status,conclusion,url
      if ($LASTEXITCODE -eq 0 -and $runsJson) {
        $workflowRun = @($runsJson | ConvertFrom-Json) |
          Where-Object { $_.headBranch -eq $tag -or $_.headSha -eq $tagSha } |
          Select-Object -First 1
      }
      if (-not $workflowRun) { Start-Sleep -Seconds 5 }
    }

    if (-not $workflowRun) {
      $crossPlatformError = "tag workflow was not found for $tag"
    } else {
      Write-Host "  Watching workflow run $($workflowRun.databaseId)..." -ForegroundColor White
      gh run watch $workflowRun.databaseId --repo $config.github.repo --exit-status
      if ($LASTEXITCODE -ne 0) {
        $crossPlatformError = "tag workflow failed (run $($workflowRun.databaseId))"
      } else {
        for ($attempt = 1; $attempt -le 6 -and -not $crossReady; $attempt++) {
          $crossReady = & $downloadCrossAssets
          if (-not $crossReady) { Start-Sleep -Seconds 5 }
        }
        if (-not $crossReady) {
          $crossPlatformError = "DMG/AppImage were not attached after workflow completion"
        }
      }
    }
  }

  if (-not $crossPlatformError) {
    foreach ($f in $crossNames) {
      $src = Join-Path $crossDir $f
      & $awsExe s3 cp $src "s3://$($config.r2.bucket)/$f" `
        --endpoint-url $endpoint --profile $awsProfile --checksum-algorithm CRC32
      if ($LASTEXITCODE -ne 0) {
        $crossPlatformError = "R2 upload failed for $f (exit $LASTEXITCODE)"
        break
      }
      $publishedFiles += $f
    }
  }

  if ($crossPlatformError) {
    Write-Host "  WARNING: $crossPlatformError" -ForegroundColor Yellow
  } else {
    Write-Host "  macOS/Linux release assets mirrored to R2" -ForegroundColor Green
  }
}

# === Cloudflare cache purge ===
if (Test-Path $cfTokenPath) {
  Write-Host "  Purging Cloudflare cache..." -ForegroundColor White
  $token = (Get-Content $cfTokenPath -Raw).Trim()
  $purgeBody = @{
    files = @($publishedFiles | ForEach-Object {
      "https://$($config.cloudflare.cdnHost)/$_"
    })
  } | ConvertTo-Json
  try {
    Invoke-RestMethod -Method Post `
      -Uri "https://api.cloudflare.com/client/v4/zones/$($config.cloudflare.zoneId)/purge_cache" `
      -Headers @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" } `
      -Body $purgeBody | Out-Null
    Write-Host "  CF cache purged" -ForegroundColor Green
  } catch {
    Write-Host "  WARNING: CF cache purge failed: $_" -ForegroundColor Yellow
    Write-Host "  Purge manually: CF dashboard > Caching > Configuration > Purge Cache" -ForegroundColor Yellow
  }
} else {
  Write-Host "  (no .cf/token — skipping cache purge; do it manually in CF dashboard)" -ForegroundColor Yellow
}

# === Done ===
Write-Host ""
if ($ghError -or $r2Failed -or $crossPlatformError) {
  Write-Host "=== Ship PARTIAL: $tag ===" -ForegroundColor Yellow
  if ($ghError) {
    Write-Host "  GitHub release step FAILED: $ghError" -ForegroundColor Red
    Write-Host "  Recover: gh release create $tag <dist artifacts> (or gh release upload --clobber if the row exists)." -ForegroundColor Yellow
  }
  if ($r2Failed) {
    Write-Host "  R2 upload FAILED — the CDN .exe/.zip may be stale. Re-run the aws s3 cp." -ForegroundColor Red
  }
  if ($crossPlatformError) {
    Write-Host "  Cross-platform publish FAILED: $crossPlatformError" -ForegroundColor Red
  }
  Write-Host "  Steps that succeeded are NOT rolled back — fix the failed step and re-run." -ForegroundColor Yellow
} else {
  Write-Host "=== Ship complete: $tag ===" -ForegroundColor Cyan
}
Write-Host "  GitHub: https://github.com/$($config.github.repo)/releases/tag/$tag"
Write-Host "  CDN:    https://$($config.cloudflare.cdnHost)/Lamprey-x64.exe"
Write-Host "  CDN:    https://$($config.cloudflare.cdnHost)/Lamprey-x64.zip"
if (-not $NoCrossPlatform) {
  Write-Host "  CDN:    https://$($config.cloudflare.cdnHost)/Lamprey-arm64.dmg"
  Write-Host "  CDN:    https://$($config.cloudflare.cdnHost)/Lamprey-x86_64.AppImage"
}
Write-Host ""

# Non-zero exit at the very end if any step failed — but only AFTER every step
# has run, so a GH flake never strands the R2 upload or CF purge again.
if ($ghError -or $r2Failed -or $crossPlatformError) { exit 1 }

# Authored and reviewed by Basho Parks, copyright 2026
