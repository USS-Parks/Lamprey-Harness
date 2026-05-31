/* One-off diagnostic: compare a light/dark ASSETS pair pixel-wise to see
   the transformation used by the artist. Not meant to ship. */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

async function inspect(p) {
  const buf = fs.readFileSync(p)
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let opaque = 0, sumR = 0, sumG = 0, sumB = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > 128) {
      opaque++
      sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]
    }
  }
  return {
    file: path.basename(p),
    w: info.width, h: info.height,
    opaquePx: opaque,
    avgR: Math.round(sumR / opaque),
    avgG: Math.round(sumG / opaque),
    avgB: Math.round(sumB / opaque)
  }
}

;(async () => {
  const dir = path.join(__dirname, '..', 'ASSETS')
  const pairs = [
    ['Lamprey Add File Icon.png', 'Lamprey Add File Icon Dark View.png'],
    ['Lamprey Folder 1 Icon.png', 'Lamprey Folder 1 Dark View.png'],
    ['Lamprey Work Location Icon.png', 'Lamprey Work Location Icon Dark View.png'],
  ]
  for (const [light, dark] of pairs) {
    const l = await inspect(path.join(dir, light))
    const d = await inspect(path.join(dir, dark))
    console.log('LIGHT:', l)
    console.log('DARK :', d)
    console.log('---')
  }
})()
