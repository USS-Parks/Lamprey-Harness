// electron-builder afterPack hook — runs once electron-builder has staged
// the unpacked Windows app at <outDir>/win-unpacked/Lamprey.exe.
//
// We have signAndEditExecutable: false in electron-builder.yml (the bundled
// signing path needs winCodeSign extraction that fails without Developer
// Mode / admin on this host), which ALSO disables electron-builder's icon
// embedding. So we run rcedit ourselves here to write the .ico into the
// .exe's Win32 icon resource. No signing — just the icon + metadata.

const path = require('path')
const fs = require('fs')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.resolve(__dirname, '..', 'resources', 'icon.ico')

  if (!fs.existsSync(exePath)) {
    console.warn(`[embed-win-icon] exe not found at ${exePath}; skipping`)
    return
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[embed-win-icon] icon not found at ${iconPath}; skipping`)
    return
  }

  const { rcedit } = require('rcedit')
  const version = context.packager.appInfo.version
  console.log(`[embed-win-icon] writing ${iconPath} into ${exePath}`)
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
  console.log('[embed-win-icon] done')
}
