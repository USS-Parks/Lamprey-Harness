/* global window, document, DataTransfer, DragEvent, getComputedStyle */ // Renderer callbacks.
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
  let streamClosed = 0
  const server = createServer((request, response) => {
    if (process.argv.includes('--shortcuts') && request.url === '/v1/chat/completions') {
      console.log('Fixture received chat completion request')
      request.resume()
      response.setHeader('Content-Type', 'text/event-stream')
      response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Streaming fixture' }, finish_reason: null }] })}\n\n`)
      response.on('close', () => { streamClosed++ })
      return
    }
    if (request.url === '/lamprey-link-smoke') received = true
    response.setHeader('Content-Type', 'text/html')
    response.end('<title>Lamprey link check</title><p>Lamprey external-link check passed. You can close this tab.</p>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  if (process.argv.includes('--shortcuts')) {
    writeFileSync(join(profile, 'settings.json'), JSON.stringify({
      defaultModel: 'fixture-stream',
      customProviders: [{ id: 'fixture-provider', baseURL: `http://127.0.0.1:${server.address().port}/v1` }],
      customModels: [{ id: 'fixture-stream', name: 'Fixture', provider: 'fixture-provider', contextWindow: 8192, supportsTools: false }]
    }))
  }
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
    page.setDefaultTimeout(10000)
    console.log('Renderer:', page.url())
    await page.waitForFunction(() => !!window.api?.artifact?.openExternal, null, { timeout: 10000 })
    if (process.argv.includes('--attachments') || process.argv.includes('--settings') || process.argv.includes('--shortcuts')) {
      await page.evaluate(async (provider) => {
        await window.api.settings.grantPlaintextConsent()
        const saved = await window.api.settings.saveProviderKey(provider, 'fixture-only-not-a-real-key')
        if (!saved.success) throw new Error(saved.error)
      }, process.argv.includes('--shortcuts') ? 'fixture-provider' : 'deepseek')
      await page.reload()
    }
    if (process.argv.includes('--shortcuts')) {
      await page.getByTitle('Switch model', { exact: true }).click()
      await page.getByRole('menuitemradio', { name: /Fixture/ }).click()
      const input = page.locator('textarea').first()
      await input.fill('Say hello.')
      await input.press('Enter')
      const stop = page.getByRole('button', { name: 'Stop current turn' })
      await stop.waitFor({ state: 'visible' })
      await page.getByText('Streaming fixture', { exact: true }).waitFor({ state: 'visible' }).catch(async (error) => {
        console.log(await page.locator('body').innerText())
        throw error
      })
      await page.keyboard.press('Control+,')
      const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
      await settings.waitFor({ state: 'visible' })
      await page.keyboard.press('Escape')
      await settings.waitFor({ state: 'hidden' })
      assert(await stop.isVisible())
      assert.equal(streamClosed, 0)
      await page.keyboard.press('Control+k')
      const palette = page.getByTestId('workflow-palette')
      await palette.waitFor({ state: 'visible' })
      await page.keyboard.press('Escape')
      await palette.waitFor({ state: 'hidden' })
      assert(await stop.isVisible())
      assert.equal(streamClosed, 0)
      assert.equal(await page.getByTitle('Search (Ctrl+K)', { exact: true }).count(), 0)
      await page.keyboard.press('Escape')
      await stop.waitFor({ state: 'hidden' })
      const deadline = Date.now() + 5000
      while (!streamClosed && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
      assert.equal(streamClosed, 1)
      console.log(JSON.stringify({ productionBundle: true, realProviderStream: true, settingsEscapePreservesTurn: true, paletteEscapePreservesTurn: true, outsideEscapeAbortsRequest: true }))
      return
    }
    if (process.argv.includes('--settings')) {
      const cases = []
      for (const [width, height] of [[800, 600], [1280, 800]]) {
        await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('/renderer/')).setSize(...size), [width, height])
        const opener = page.getByRole('button', { name: 'Settings', exact: true }).first()
        await opener.focus()
        await opener.click()
        const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
        await dialog.waitFor({ state: 'visible' })
        const labels = await dialog.getByRole('tab').allTextContents()
        assert.equal(labels.length, 24)
        for (const label of labels) {
          await page.waitForFunction((label) => document.activeElement?.textContent === label && document.activeElement.getAttribute('aria-selected') === 'true', label, { timeout: 5000 })
          assert(await dialog.evaluate((root) => {
            const tab = root.querySelector('[aria-selected="true"]').getBoundingClientRect()
            const list = root.querySelector('[role="tablist"]').getBoundingClientRect()
            return tab.top >= list.top - 1 && tab.bottom <= list.bottom + 1
          }), `Tab ${label} is clipped at ${width}x${height}`)
          await page.keyboard.press('ArrowDown')
        }
        await page.keyboard.press('End')
        await page.waitForFunction(() => document.activeElement?.textContent === 'Activity')
        await page.keyboard.press('Home')
        await dialog.getByRole('tab', { name: 'Appearance', exact: true }).click()
        const colors = []
        for (const mode of ['Light', 'Dark']) {
          await dialog.getByRole('button', { name: mode, exact: true }).click()
          await page.waitForFunction((mode) => document.documentElement.dataset.themeMode === mode.toLowerCase(), mode)
          colors.push(await dialog.evaluate((root) => getComputedStyle(root).backgroundColor))
        }
        assert.notEqual(colors[0], colors[1])
        await dialog.getByRole('tab', { name: 'Appearance', exact: true }).focus()
        await page.keyboard.press('Shift+Tab')
        assert(await dialog.evaluate((root) => root.contains(document.activeElement)))
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'tab')
        await dialog.getByRole('button', { name: 'Close settings' }).click()
        assert(await opener.evaluate((element) => document.activeElement === element))
        cases.push({ width, height, tabsReached: labels.length, lightDark: true, focusContainedAndReturned: true })
      }
      console.log(JSON.stringify({ productionBundle: true, settings: cases }))
      return
    }
    if (process.argv.includes('--attachments')) {
      const externalPath = join(profile, 'outside-project.txt')
      writeFileSync(externalPath, 'External attachment acceptance fixture.')
      const picker = page.getByTitle('Attach a file to your prompt')
      await picker.waitFor({ state: 'visible' })
      const denied = await page.evaluate((path) => window.api.files.process([path]), externalPath)
      assert.equal(denied.success, false)
      assert.match(denied.error, /outside the active workspace/)
      await page.evaluate(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.id = 'acceptance-drop-source'
        document.body.append(input)
      })
      await page.locator('#acceptance-drop-source').setInputFiles(externalPath)
      await page.evaluate(() => {
        const input = document.querySelector('#acceptance-drop-source')
        const transfer = new DataTransfer()
        transfer.items.add(input.files[0])
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }))
        input.remove()
      })
      await page.getByText(/Use Add file to select files outside this project/).waitFor({ state: 'visible', timeout: 10000 })
      // The native chooser response is the controlled fixture boundary;
      // renderer, preload, picker handler and file processing are real.
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      }, externalPath)
      await picker.click()
      await page.getByText('outside-project.txt', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
      console.log(JSON.stringify({ productionBundle: true, realElectronIpc: true, externalDropFallback: true, forgedPathDenied: true, pickerAttachmentVisible: true, nativeChooserResponse: 'controlled fixture path' }))
      return
    }
    if (process.argv.includes('--plugins')) {
      const result = await page.evaluate(async () => {
        const id = 'lamprey-git-tools'
        const snapshot = async () => ({
          skills: (await window.api.skills.list()).data.filter((skill) => skill.pluginId === id).map((skill) => skill.id),
          commands: (await window.api.slash.listAll()).data.filter((command) => command.pluginId === id).map((command) => command.name)
        })
        const before = await snapshot()
        const enabled = await window.api.plugins.enable(id)
        const afterEnable = await snapshot()
        const disabled = await window.api.plugins.disable(id)
        const afterDisable = await snapshot()
        return { before, enabled, afterEnable, disabled, afterDisable }
      })
      assert.deepEqual(result.before, { skills: [], commands: [] })
      assert.equal(result.enabled.success, true)
      assert.deepEqual(result.afterEnable, { skills: ['lamprey-git-tools:git-status-recap'], commands: ['lamprey-git-tools:branch-ready'] })
      assert.equal(result.disabled.success, true)
      assert.deepEqual(result.afterDisable, { skills: [], commands: [] })
      console.log(JSON.stringify({ productionBundle: true, realElectronIpc: true, plugins: result }))
      return
    }
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
