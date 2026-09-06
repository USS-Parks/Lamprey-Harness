/* global window, document */
const assert = require('node:assert/strict')
const LEAVES = [
 ['general','general'], ['automations','general'], ['appearance','appearance'],
 ['models','connections'], ['api','connections'], ['github','connections'],
 ['webTools','extensions'], ['currentInfo','extensions'], ['imageGen','extensions'], ['tools','extensions'], ['library','extensions'], ['rag','extensions'],
 ['permissions','permissions'], ['agenticCoding','advanced'], ['planGoal','advanced'], ['hooks','advanced'], ['loops','advanced'], ['orchestration','advanced'], ['snip','advanced'], ['timeouts','advanced'], ['seedBudget','advanced'], ['reasoning','advanced'], ['persistence','advanced'], ['activity','advanced']
]
const preferences = value => { const copy = { ...value }; delete copy.windowBounds; return copy }
module.exports = async function settingsScenario({ page, app }) {
  const before = await page.evaluate(async () => (await window.api.settings.get()).data)
  const input = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  const menu = page.getByRole('dialog', { name: 'Command menu', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
  const openLeaf = async id => {
    await input.focus(); await page.keyboard.press('Control+k'); await menu.waitFor()
    await menu.getByRole('button', { name: 'Settings', exact: true }).click()
    await menu.locator(`[data-command-id="settings.${id}"]`).click()
    await dialog.waitFor()
  }
  const visited = []
  for (const [id, group] of LEAVES) {
    await openLeaf(id)
    assert.equal(await dialog.locator('[data-settings-group]').count(), 6)
    assert.equal(await dialog.locator(`[data-settings-group="${group}"]`).getAttribute('aria-expanded'), 'true')
    assert.equal(await dialog.locator(`#settings-tab-${id}`).getAttribute('aria-selected'), 'true')
    await page.waitForFunction(() => document.querySelector('#settings-panel')?.textContent.trim().length > 0)
    await page.keyboard.press('Escape'); visited.push(id)
  }
  assert.deepEqual(preferences(await page.evaluate(async () => (await window.api.settings.get()).data)), preferences(before))
  await openLeaf('general')
  const titles = dialog.getByRole('checkbox', { name: /AI-generated titles/ })
  const was = await titles.isChecked(); await titles.setChecked(!was)
  await page.waitForFunction(async expected => (await window.api.settings.get()).data.aiGeneratedTitles === expected, !was)
  await dialog.getByRole('button', { name: 'Advanced', exact: true }).click()
  await dialog.getByRole('button', { name: 'General', exact: true }).click()
  assert.equal(await titles.isChecked(), !was); await titles.setChecked(was)
  await page.waitForFunction(async expected => (await window.api.settings.get()).data.aiGeneratedTitles === expected, was)
  await page.keyboard.press('Escape')
  for (const column of ['skills','connectors','plugins']) {
    await openLeaf('tools'); await dialog.getByRole('button', { name: `Manage ${column}`, exact: true }).click()
    await page.getByRole('heading', { name: 'Customize Lamprey', exact: true }).waitFor()
    const label = column[0].toUpperCase() + column.slice(1)
    assert((await page.getByRole('region', { name: label, exact: true }).getAttribute('class')).includes('border-[var(--accent)]'))
    assert.equal(await dialog.count(), 0)
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click()
  }
  assert.deepEqual(preferences(await page.evaluate(async () => (await window.api.settings.get()).data)), preferences(before))
  const fixtureConfig = { ...(before.modelConfig ?? {}), 'fixture-stream': { temperature: 0.7, maxTokens: null, topP: 1, systemPromptOverride: 'UX28-private-setting-value' } }
  const saved = await page.evaluate(modelConfig => window.api.settings.set({ modelConfig }), fixtureConfig); assert(saved.success)
  await openLeaf('general')
  const search = dialog.getByRole('combobox', { name: 'Search settings', exact: true })
  const oldNames = ['General','Automations','Appearance','Models','API Keys','GitHub','Web Tools','Current Info','Image Gen','Tools','Library','RAG','Permissions','Coding Mode','Plans & Goals','Hooks','Loops','Orchestration','Snip','Timeouts','Seed Budget','Reasoning Audit','Persistence','Activity']
  for (let i = 0; i < LEAVES.length; i++) {
    await search.fill(oldNames[i]); await dialog.locator(`[data-settings-result="${LEAVES[i][0]}"]`).waitFor()
  }
  await search.fill('UX28-private-setting-value'); await dialog.getByText('No matching settings.', { exact: true }).waitFor()
  await search.press('Escape'); assert.equal(await search.inputValue(), ''); assert.equal(await dialog.count(), 1)
  await search.fill('Seed Budget'); await search.press('Enter')
  assert.equal(await dialog.locator('#settings-tab-seedBudget').getAttribute('aria-selected'), 'true')
  await page.waitForFunction(() => document.activeElement?.id === 'settings-panel')
  await dialog.getByRole('button', { name: 'Back to search results', exact: true }).click()
  assert.equal(await search.inputValue(), 'Seed Budget'); await dialog.locator('[data-settings-result="seedBudget"]').waitFor()
  await dialog.getByRole('button', { name: 'Clear settings search', exact: true }).click(); assert.equal(await search.inputValue(), '')
  await search.fill('Activity'); await dialog.locator('[data-settings-result="activity"]').getByText(/Current task attention stays in the sidebar/).waitFor()
  await search.fill('Advanced')
  const resultCount = await dialog.locator('[data-settings-result]').count()
  for (let i = 1; i < resultCount; i++) await search.press('ArrowDown')
  assert(await search.evaluate(element => { const rect = element.getBoundingClientRect(); const parent = element.closest('nav').getBoundingClientRect(); return rect.top >= parent.top && rect.bottom <= parent.bottom }))
  const responsive = []
  for (const theme of ['Light', 'Dark']) {
  await search.press('Escape'); await dialog.getByRole('button', { name: 'Appearance', exact: true }).click(); await dialog.getByRole('button', { name: theme, exact: true }).click()
  for (const [width, height] of [[1440,900],[1024,768],[800,600],[1920,1080]]) for (const zoom of [1,1.5,2]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(width,height); win.webContents.setZoomFactor(zoom) }, { width,height,zoom })
    await search.fill('RAG'); await search.press('Enter'); await page.waitForFunction(() => document.activeElement?.id === 'settings-panel')
    assert.equal(await dialog.locator('#settings-tab-rag').getAttribute('aria-selected'), 'true')
    await dialog.getByRole('button', { name: 'Back to search results', exact: true }).click()
    responsive.push({theme,width,height,zoom})
  }
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setZoomFactor(1); win.setContentSize(1440,900) })
  }
  await search.press('Escape'); await search.press('Escape'); await dialog.waitFor({ state: 'hidden' })
  await page.evaluate(modelConfig => window.api.settings.set({ modelConfig }), before.modelConfig ?? {})
  return { searchAliases: oldNames, privateValuesNotIndexed: true, searchFocusBackReset: true, activityDistinguished: true, responsive, visited, groups: 6, allLegacySectionIds: true, correctActiveGroup: true, navigationDoesNotSaveOrReset: true, existingSaveAndSwitchBehavior: true, existingCustomizeRoutes: true }
}
