const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { createHash } = require('node:crypto')
const { ARTIFACTS, hashFile, hashUrl, assertMatch, selectProducer, captureManifest, publishFinal, main } = require('./bucket.cjs')

test('requires both tag and source when selecting the producer', () => {
  const exact = { headBranch: 'v1.2.3', headSha: 'abc', databaseId: 3 }
  assert.equal(selectProducer([{ headBranch: 'main', headSha: 'abc' }, { headBranch: 'v1.2.3', headSha: 'old' }, exact], 'v1.2.3', 'abc'), exact)
  assert.equal(selectProducer([{ headBranch: 'main', headSha: 'abc' }], 'v1.2.3', 'abc'), undefined)
})

test('waits for the last producer before capture and verifies actual downloaded bytes', async () => {
  let published = Buffer.from('old bytes'), producerDone = false
  const server = http.createServer((_req, res) => res.end(published))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/asset`
  try {
    await publishFinal({
      waitForProducer: async () => { await new Promise(resolve => setTimeout(resolve, 20)); published = Buffer.from('final bytes'); producerDone = true },
      capture: async () => { assert.equal(producerDone, true); return { name: 'fixture', ...await hashUrl(url) } },
      mirror: async () => {},
      verify: async expected => assertMatch(expected, await hashUrl(url), 'final')
    })
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('rejects a late overwrite that would pass an early hash check', async () => {
  let published = Buffer.from('good')
  const server = http.createServer((_req, res) => res.end(published))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/asset`
  try {
    await assert.rejects(publishFinal({
      waitForProducer: async () => {},
      capture: async () => ({ name: 'fixture', ...await hashUrl(url) }),
      mirror: async manifest => { assertMatch(manifest, await hashUrl(url), 'early'); published = Buffer.from('evil') },
      verify: async manifest => assertMatch(manifest, await hashUrl(url), 'final')
    }), /final bytes differ/)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('does not publish when the producer fails', async () => {
  await assert.rejects(publishFinal({ waitForProducer: async () => { throw new Error('producer failed') }, capture: () => assert.fail('captured'), mirror: () => assert.fail('mirrored'), verify: () => assert.fail('verified') }), /producer failed/)
})

test('binds all six artifacts and updater metadata to source and version', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'lamprey-bucket-test-'))
  try {
    for (const name of ARTIFACTS) await fs.writeFile(path.join(folder, name), 'fixture')
    const sha512 = createHash('sha512').update('fixture').digest('base64')
    const latest = `version: 1.2.3\nfiles:\n  - url: Lamprey-x64.exe\n    sha512: ${sha512}\n    size: 7\npath: Lamprey-x64.exe\nsha512: ${sha512}\n`
    await fs.writeFile(path.join(folder, 'latest.yml'), latest)
    const manifest = await captureManifest(folder, '1.2.3', 'source-sha', { databaseId: 7 })
    assert.equal(manifest.assets.length, 6)
    assert.equal(manifest.source, 'source-sha')
    assert.equal(manifest.assets[0].sha256, await hashFile(path.join(folder, ARTIFACTS[0])))
    await fs.writeFile(path.join(folder, 'latest.yml'), latest.replace('version: 1.2.3', 'version: 1.2.4'))
    await assert.rejects(captureManifest(folder, '1.2.3', 'source-sha', {}), /latest.yml/)
    await fs.writeFile(path.join(folder, 'latest.yml'), latest.replace('size: 7', 'size: 8'))
    await assert.rejects(captureManifest(folder, '1.2.3', 'source-sha', {}), /latest.yml/)
    await fs.writeFile(path.join(folder, 'latest.yml'), latest)
    await fs.writeFile(path.join(folder, 'Lamprey-x64.exe'), 'changed')
    await assert.rejects(captureManifest(folder, '1.2.3', 'source-sha', {}), /latest.yml/)
  } finally { await fs.rm(folder, { recursive: true, force: true }) }
})

test('a CDN HTTP failure cannot produce a successful hash', async () => {
  const server = http.createServer((_req, res) => { res.statusCode = 403; res.end('denied') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await assert.rejects(hashUrl(`http://127.0.0.1:${server.address().port}/asset`), /Download failed/) }
  finally { await new Promise(resolve => server.close(resolve)) }
})

test('rejects partial publication and unknown flags before touching configuration', async () => {
  await assert.rejects(main(['--no-cross-platform']), /Partial-platform/)
  await assert.rejects(main(['--invented']), /Unknown option/)
})
// Authored and reviewed by Basho Parks, copyright 2026
