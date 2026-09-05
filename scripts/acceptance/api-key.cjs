/* global window */ // Browser fixture callbacks.
const { chromium } = require('playwright')
const { resolve } = require('node:path')
const assert = require('node:assert/strict')

async function main() {
  const { createServer } = await import('vite')
  const server = await createServer({ configFile: false, root: resolve('.'), resolve: { alias: { '@': resolve('src') } }, server: { port: 0, host: '127.0.0.1' }, esbuild: { jsx: 'automatic' },
    optimizeDeps: { entries: ['src/components/settings/ApiKeyModal.tsx'], include: ['react', 'react-dom/client'] },
    plugins: [{ name: 'api-key-fixture', configureServer(server) {
      server.middlewares.use('/api-key-fixture', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html')
        response.end(await server.transformIndexHtml('/api-key-fixture', '<div id="root"></div><script type="module">import React from "react"; import {createRoot} from "react-dom/client"; import {ApiKeyModal} from "/src/components/settings/ApiKeyModal.tsx"; createRoot(document.getElementById("root")).render(React.createElement(ApiKeyModal,{onComplete:()=>window.completed=true}));</script>'))
      })
    } }]
  })
  await server.listen()
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const mode of ['missing', 'reject', 'failure', 'consent-reject', 'success']) {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript((mode) => {
        if (mode === 'missing') return
        let checks = 0
        window.api = { settings: {
          listProviderKeys: async () => {
            if (mode === 'reject') throw new Error('Fixture IPC rejected')
            if (mode === 'failure') return { success: false, error: 'Fixture provider list failed' }
            return { success: true, data: [{ id: 'deepseek', label: 'DeepSeek', hasKey: false }] }
          },
          isEncryptionAvailable: async () => {
            if (++checks > 1 && mode === 'consent-reject') throw new Error('Fixture consent rejected')
            return { success: true, data: true }
          },
          saveProviderKey: async () => ({ success: true }),
          testProviderKey: async () => ({ success: true, data: { ok: true } })
        } }
      }, mode)
      await page.goto(`${server.resolvedUrls.local[0]}api-key-fixture`)
      const connect = page.getByRole('button', { name: 'Connect', exact: true })
      await page.locator('input[type="password"]').fill('fixture-key')
      if (['missing', 'reject', 'failure'].includes(mode)) {
        await page.getByRole('alert').waitFor()
        assert(await connect.isDisabled())
        await page.getByRole('button', { name: 'Retry loading providers' }).click()
        await page.getByRole('alert').waitFor()
      } else {
        await connect.click()
        if (mode === 'success') await page.waitForFunction(() => window.completed === true)
        else {
          await page.getByRole('alert').waitFor()
          assert(await connect.isEnabled())
        }
      }
      assert.deepEqual(errors, [], mode)
      console.log(`API key modal ${mode}: passed`)
      await page.close()
    }
  } finally {
    await browser.close()
    await server.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
