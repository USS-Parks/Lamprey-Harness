/* global window */ // page.evaluate callbacks execute in the renderer.
const { _electron: electron } = require('playwright')
const { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { createServer } = require('node:http')
const assert = require('node:assert/strict')

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'lamprey-acceptance-'))
  writeFileSync(join(profile, 'mcp-servers.json'), JSON.stringify([{ id: 'node-repl', name: 'Node REPL', transport: 'stdio', command: process.execPath, auth: 'none', enabled: false }]))
  const plugins = Object.fromEntries(readdirSync(resolve('resources/plugins'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const manifest = JSON.parse(readFileSync(resolve('resources/plugins', entry.name, 'plugin.json'), 'utf8'))
    return [manifest.id, false]
  }))
  writeFileSync(join(profile, 'plugins.json'), JSON.stringify(plugins))
  let received = false
  const server = createServer((request, response) => {
    if (request.url === '/lamprey-link-smoke') received = true
    response.setHeader('Content-Type', 'text/html')
    response.end('<title>Lamprey link check</title><p>Lamprey external-link check passed. You can close this tab.</p>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let app
  try {
    const env = { ...process.env, LAMPREY_ACCEPTANCE_PROFILE: profile }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({ args: [resolve('scripts/acceptance/electron-fixture.cjs')], env, timeout: 30000 })
    console.log('Electron fixture launched')
    app.process().stderr.on('data', (data) => process.stderr.write(data))
    const page = await app.waitForEvent('window', { predicate: (page) => page.url().startsWith('file:') && page.url().includes('/renderer/'), timeout: 30000 }).catch(async () => {
      return app.windows().find((page) => page.url().includes('/renderer/'))
    })
    assert(page, 'Production renderer did not open')
    console.log('Renderer:', page.url())
    await page.waitForFunction(() => !!window.api?.artifact?.openExternal, null, { timeout: 10000 })
    const url = `http://127.0.0.1:${server.address().port}/lamprey-link-smoke`
    const result = await page.evaluate((url) => window.api.artifact.openExternal(url), url)
    assert.deepEqual(result, { success: true, data: null })
    const deadline = Date.now() + 15000
    while (!received && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
    assert(received, 'OS reported success but the local browser receiver was not reached')
    console.log(JSON.stringify({ productionBundle: true, realElectronIpc: true, osOpenExternal: result, localBrowserReceived: received }))
  } finally {
    if (app) {
      console.log('Closing fixture')
      await app.close()
      console.log('Fixture closed')
    }
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    rmSync(profile, { recursive: true, force: true })
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
