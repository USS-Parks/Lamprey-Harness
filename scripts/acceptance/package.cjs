/* global window */
const { chromium } = require('playwright')
const { launchIsolated } = require('./package-debugger.cjs')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { hashFile } = require('../bucket.cjs')
const yaml = require('js-yaml')

async function main() {
  const folder = path.resolve(process.argv[2])
  const unpacked = process.argv.includes('--unpacked')
  if (unpacked) assert(/^lamprey-unpacked-build-[^\\/]+[\\/]win-unpacked$/.test(path.relative(os.tmpdir(), folder)))
  const manifest = unpacked
    ? { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), version: require('../../package.json').version, status: 'local-working-tree' }
    : JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'))
  assert(['candidate', 'verified', 'local-working-tree'].includes(manifest.status))
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lamprey-package-'))
  const install = unpacked ? folder : path.join(temp, 'portable')
  const profile = path.join(temp, 'profile')
  await fs.mkdir(profile)
  let app
  let browser
  let installerVersion = null
  try {
    if (!unpacked) {
      for (const name of ['Lamprey-x64.exe', 'Lamprey-x64.zip']) {
        assert.equal(await hashFile(path.join(folder, name)), manifest.assets.find(asset => asset.name === name).sha256)
      }
      const latest = yaml.load(await fs.readFile(path.join(folder, 'latest.yml'), 'utf8'))
      const installerHash = await hashFile(path.join(folder, 'Lamprey-x64.exe'), 'sha512', 'base64')
      const installerSize = (await fs.stat(path.join(folder, 'Lamprey-x64.exe'))).size
      assert.equal(latest.version, manifest.version)
      assert.equal(latest.path, 'Lamprey-x64.exe')
      assert.equal(latest.sha512, installerHash)
      const updateFile = latest.files.find(file => file.url === 'Lamprey-x64.exe')
      assert.equal(updateFile.sha512, installerHash)
      assert.equal(updateFile.size, installerSize)
      installerVersion = JSON.parse(execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:LAMPREY_INSTALLER_PATH) | Select-Object ProductVersion,ProductName | ConvertTo-Json -Compress'], { env: { ...process.env, LAMPREY_INSTALLER_PATH: path.join(folder, 'Lamprey-x64.exe') }, windowsHide: true, encoding: 'utf8' }))
      assert([manifest.version, manifest.version + '.0'].includes(installerVersion.ProductVersion), JSON.stringify(installerVersion))
      assert.match(installerVersion.ProductName, /Lamprey/)
      await fs.mkdir(install)
      execFileSync('tar.exe', ['-xf', path.join(folder, 'Lamprey-x64.zip'), '-C', install], { windowsHide: true, stdio: 'pipe', timeout: 180000 })
    }
    const executable = path.join(install, 'Lamprey.exe')
    const archive = path.join(install, 'resources', 'app.asar')
    const originalHash = await hashFile(archive)
    const probeApp = path.join(install, 'resources', 'app')
    const backup = archive + '.acceptance-original'
    const bootstrap = path.resolve(__dirname, 'package-bootstrap.cjs')
    const env = { ...process.env, LAMPREY_ACCEPTANCE_PROFILE: profile }
    delete env.ELECTRON_RUN_AS_NODE
    // First replace only the disposable copy's entry with an inert probe. If
    // debugger isolation fails, this exits without running Lamprey or its DB.
    await fs.rename(archive, backup)
    await fs.mkdir(probeApp)
    await fs.writeFile(path.join(probeApp, 'package.json'), JSON.stringify({ name: 'lamprey-isolation-probe', version: manifest.version, main: 'index.cjs' }))
    await fs.writeFile(path.join(probeApp, 'index.cjs'), "const { app } = require('electron'); if (!global.__lampreyPackageBootstrap || app.getPath('userData') !== process.env.LAMPREY_ACCEPTANCE_PROFILE) process.exit(42); process.stdout.write('ISOLATION_OK'); app.exit(0)")
    try {
      const probe = await launchIsolated(executable, env, bootstrap)
      const result = await probe.waitForExit()
      assert.equal(result.code, 0, result.stderr)
      assert.match(result.output, /ISOLATION_OK/)
      console.log('Stock executable isolation probe passed')
    } finally {
      await fs.rm(probeApp, { recursive: true, force: true })
      await fs.rename(backup, archive)
    }
    assert.equal(await hashFile(archive), originalHash)
    await fs.writeFile(path.join(profile, 'mcp-servers.json'), JSON.stringify([{ id: 'node-repl', name: 'Node REPL', transport: 'stdio', command: process.execPath, auth: 'none', enabled: false }]))
    const pluginRoot = path.join(install, 'resources', 'plugins')
    const plugins = {}
    for (const entry of await fs.readdir(pluginRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const plugin = JSON.parse(await fs.readFile(path.join(pluginRoot, entry.name, 'plugin.json'), 'utf8'))
        plugins[plugin.id] = false
      }
    }
    await fs.writeFile(path.join(profile, 'plugins.json'), JSON.stringify(plugins))
    app = await launchIsolated(executable, env, bootstrap)
    console.log('Stock packaged entry isolated and resumed')
    const info = await app.evaluate('global.__lampreyPackageInfo()')
    assert.equal(info.version, manifest.version)
    assert.equal(info.packaged, true)
    assert.equal(info.userData, profile)
    assert.equal(info.appPath, archive)
    console.log('Packaged identity and profile verified')
    browser = await chromium.connectOverCDP(await app.browserReady())
    const context = browser.contexts()[0]
    const isRenderer = page => page.url().startsWith('file:') && page.url().includes('/renderer/')
    let page
    const rendererDeadline = Date.now() + 30000
    while (!page && Date.now() < rendererDeadline) {
      page = context.pages().find(isRenderer)
      if (!page) await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert(page, 'Packaged renderer did not open')
    await page.waitForFunction(() => typeof window.api?.rag?.embedder?.setActive === 'function', null, { timeout: 30000 })
    console.log('Packaged renderer IPC ready')
    const embedder = await Promise.race([
      page.evaluate(() => window.api.rag.embedder.setActive('bge-small-en-v1.5')),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Packaged embedder did not load within 180 seconds')), 180000); timer.unref() })
    ])
    assert.equal(embedder.success, true, JSON.stringify(embedder))
    const collection = await page.evaluate(() => window.api.rag.collection.create({ name: 'Installed package fixture', embedderId: 'bge-small-en-v1.5' }))
    assert(collection.success, JSON.stringify(collection))
    const id = collection.data.id
    const ingest = await page.evaluate(id => window.api.rag.document.ingest(id, [{ name: 'fixture.txt', text: 'The lighthouse keeper stores the brass telescope in the northern tower.' }]), id)
    assert(ingest.success, JSON.stringify(ingest))
    const deadline = Date.now() + 60000
    let ready = false
    while (!ready && Date.now() < deadline) {
      const docs = await page.evaluate(id => window.api.rag.document.list(id), id)
      assert(docs.success, JSON.stringify(docs))
      assert(!docs.data.some(doc => doc.status === 'error'), JSON.stringify(docs.data))
      ready = docs.data.some(doc => doc.status === 'ready' && doc.chunkCount > 0)
      if (!ready) await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert(ready, 'Installed RAG ingest did not finish')
    const query = await page.evaluate(id => window.api.rag.query.run({ query: 'Where is the brass telescope?', collectionIds: [id] }), id)
    assert(query.success && query.data.vecHits > 0, JSON.stringify(query))
    assert(query.data.results.some(chunk => chunk.text.includes('northern tower')))
    const result = { source: manifest.source, version: info.version, artifactStage: manifest.status, portableInstall: !unpacked, nsisVersionMetadata: installerVersion, stockExecutableAndAsar: true, isolatedProfile: true, rendererIPC: true, packagedEmbeddingWorker: true, vectorRetrieval: true, asarSha256: originalHash, updaterMetadata: unpacked ? 'Not exercised by unpacked working-tree build' : 'Validated against actual installer SHA-512', limitation: 'NSIS wizard installation and platform GUI launches on macOS/Linux were not performed.' }
    const receipt = unpacked ? 'sr36a-unpacked.json' : `sr37-${manifest.status === 'candidate' ? 'candidate-' : ''}package.json`
    await fs.writeFile(path.resolve('PLANNING/evidence', receipt), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result))
  } finally {
    if (app) await app.close()
    if (browser) await browser.close()
    await fs.rm(temp, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
// Authored and reviewed by Basho Parks, copyright 2026
