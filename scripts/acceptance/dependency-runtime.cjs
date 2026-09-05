const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

async function main() {
  const sharp = require('sharp')
  const { RawImage } = await import('@huggingface/transformers')
  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#aabbcc' } }).png().toBuffer()
  const image = await RawImage.fromBlob(new Blob([png], { type: 'image/png' }))
  assert.equal(image.width, 4)
  assert.equal(image.height, 3)
  const resized = await image.resize(2, 2)
  assert.equal(resized.data.length, 12)
  const ortRequire = createRequire(require.resolve('onnxruntime-node'))
  const AdmZip = ortRequire('adm-zip')
  const fixture = mkdtempSync(join(tmpdir(), 'lamprey-dependencies-'))
  try {
    const archive = new AdmZip()
    archive.addFile('runtimes/test/native/fixture.dll', Buffer.from('fixture bytes'))
    const zipPath = join(fixture, 'fixture.nupkg')
    archive.writeZip(zipPath)
    const loaded = new AdmZip(zipPath)
    const entry = loaded.getEntry('runtimes/test/native/fixture.dll')
    assert(entry)
    loaded.extractEntryTo(entry, fixture, false, true)
    assert.equal(readFileSync(join(fixture, 'fixture.dll'), 'utf8'), 'fixture bytes')
    console.log(JSON.stringify({ transformerImageDecodeResize: true, onnxInstallerArchiveApi: true, sharp: sharp.versions.sharp, libvips: sharp.versions.vips }))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
