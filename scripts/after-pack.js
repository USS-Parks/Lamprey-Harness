// electron-builder afterPack hook.
//
// darwin: ad-hoc re-sign the staged .app. electron-builder's own signing is
// skipped (no Developer ID cert; CI sets CSC_IDENTITY_AUTO_DISCOVERY=false),
// and the pack step edits Info.plist and renames the executable, which breaks
// the upstream Electron ad-hoc seal. macOS then refuses the quarantined app
// outright with "Lamprey is damaged and can't be opened" — the v0.32.0/v0.33.0
// DMG install failures. Re-sealing with the ad-hoc identity ("-") restores the
// standard unidentified-developer open flow (right-click → Open, or approve in
// System Settings → Privacy & Security). A real Developer ID + notarization
// remains an owner action.
//
// win32: we have signAndEditExecutable: false in electron-builder.yml (the
// bundled signing path needs winCodeSign extraction that fails without
// Developer Mode / admin on this host), which ALSO disables electron-builder's
// icon embedding. So we run rcedit ourselves here to write the .ico into the
// .exe's Win32 icon resource. No signing — just the icon + metadata.

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') {
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    if (!fs.existsSync(appPath)) {
      throw new Error(`[after-pack] app bundle not found at ${appPath}`)
    }
    console.log(`[after-pack] ad-hoc signing ${appPath}`)
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
    execFileSync('codesign', ['--verify', '--deep', appPath], { stdio: 'inherit' })
    console.log('[after-pack] codesign verify passed')
    return
  }

  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.resolve(__dirname, '..', 'resources', 'icon.ico')

  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] exe not found at ${exePath}; skipping`)
    return
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[after-pack] icon not found at ${iconPath}; skipping`)
    return
  }

  const { rcedit } = require('rcedit')
  const version = context.packager.appInfo.version
  console.log(`[after-pack] writing ${iconPath} into ${exePath}`)
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: 'Lamprey',
      FileDescription: 'Lamprey Harness',
      CompanyName: 'Lamprey Contributors',
      LegalCopyright: 'Copyright © 2026 Lamprey Contributors'
    },
    'file-version': version,
    'product-version': version
  })
  console.log('[after-pack] done')
}
