/**
 * Generate "Dark View" companion PNGs for any single-variant icon in
 * ASSETS/. The existing artist-made pairs (e.g. Add File Icon vs Add File
 * Icon Dark View) are luminance-inverted: light icons render the artwork
 * near-black (avg RGB ~40) for light backdrops, dark views render it
 * near-white (avg RGB ~244) for dark backdrops.
 *
 * For each input file we invert RGB on every opaque pixel while preserving
 * alpha, so anti-aliased edges remain smooth. Background pixels (already
 * transparent) are left as-is.
 *
 * Usage:  node scripts/make-dark-variants.js "Lamprey Copy Icon.png" ...
 * If no args, processes the hard-coded NEW_ICONS list below.
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ASSETS_DIR = path.join(__dirname, '..', 'ASSETS')

const NEW_ICONS = [
  'Lamprey Copy Icon.png',
  'Lamprey Thumbs Up Icon.png',
  'Lamprey Thumbs Down Icon.png',
  'Lamprey Pin As Chapter Icon.png',
  'Lamprey Work-Fork Icon.png'
]

function darkPathFor(filename) {
  return filename.replace(/ Icon\.png$/i, ' Icon Dark View.png')
}

async function makeDark(srcPath, dstPath) {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i += ch) {
    const a = data[i + 3]
    if (a === 0) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0
      continue
    }
    out[i] = 255 - data[i]
    out[i + 1] = 255 - data[i + 1]
    out[i + 2] = 255 - data[i + 2]
    out[i + 3] = a
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: ch } })
    .png({ compressionLevel: 9 })
    .toFile(dstPath)
}

;(async function main() {
  const args = process.argv.slice(2)
  const list = args.length ? args : NEW_ICONS
  for (const name of list) {
    const src = path.join(ASSETS_DIR, name)
    const dst = path.join(ASSETS_DIR, darkPathFor(name))
    if (!fs.existsSync(src)) {
      console.log(`  skip (missing): ${name}`)
      continue
    }
    if (fs.existsSync(dst)) {
      console.log(`  skip (exists):  ${path.basename(dst)}`)
      continue
    }
    try {
      await makeDark(src, dst)
      console.log(`  baked: ${path.basename(dst)}`)
    } catch (err) {
      console.log(`  FAILED ${name}: ${err.message}`)
    }
  }
})()
