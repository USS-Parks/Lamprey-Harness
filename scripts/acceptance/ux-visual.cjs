/* global window, document, getComputedStyle */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
module.exports = async function visualScenario({ page, app, ids, output }) {
  const selectTask = async () => {
    const search = page.getByRole('searchbox', { name: 'Search tasks', exact: true })
    await search.fill('UX baseline task 01')
    await page.locator(`[data-task-id="${ids[1]}"]`).getByRole('button', { name: /^UX baseline task 01/ }).first().click()
    await search.fill('')
  }
  await selectTask()
  const input = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  const snapshots = []
  const presets = ['lamprey-default','arcgis-blue','arcgis-ember','lamprey-mint','lamprey-earth','arcgis-magma','arcgis-viridis','lamprey-drab']
  for (const mode of ['light','dark']) for (const preset of presets) {
    await input.focus(); await page.keyboard.press('Control+,'); await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Appearance', exact: true }).click()
    await dialog.getByRole('button', { name: mode === 'light' ? 'Light' : 'Dark', exact: true }).click()
    const changed = await page.evaluate(async themePreset => window.api.settings.set({ themePreset }), preset); assert(changed.success)
    // Reload through the real settings loader so the persisted preset is the rendered source.
    await page.reload(); await input.waitFor()
    await page.waitForFunction(({mode,preset}) => document.documentElement.dataset.themeMode === mode && document.documentElement.dataset.themePreset === preset, {mode,preset})
    await selectTask()
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return Object.fromEntries(['--app-bg','--panel-bg','--text-primary','--text-secondary','--text-muted','--accent','--accent-foreground','--success','--warning','--error'].map(key => [key, style.getPropertyValue(key).trim()]))
    })
    const file = `${preset}-${mode}.png`
    const bytes = await app.evaluate(async ({ BrowserWindow }) => Array.from((await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG()))
    fs.writeFileSync(path.join(output,file),Buffer.from(bytes))
    snapshots.push({mode,preset,colors,file})
  }
  await page.evaluate(() => window.api.settings.set({ themePreset: 'arcgis-blue', themeMode: 'dark' }))
  await page.reload(); await input.waitFor()
  return { snapshots, realSettingsLoader: true, screenshotMethod: 'Electron webContents capturePage', tokenContrast: 'src/styles/contrast.test.ts checks all 16 preset modes against six surfaces and filled action foregrounds.' }
}
