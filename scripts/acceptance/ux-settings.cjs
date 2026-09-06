/* global window, document */
const assert = require('node:assert/strict')
const LEAVES = [
 ['general','general'], ['automations','general'], ['appearance','appearance'],
 ['models','connections'], ['api','connections'], ['github','connections'],
 ['webTools','extensions'], ['currentInfo','extensions'], ['imageGen','extensions'], ['tools','extensions'], ['library','extensions'], ['rag','extensions'],
 ['permissions','permissions'], ['agenticCoding','advanced'], ['planGoal','advanced'], ['hooks','advanced'], ['loops','advanced'], ['orchestration','advanced'], ['snip','advanced'], ['timeouts','advanced'], ['seedBudget','advanced'], ['reasoning','advanced'], ['persistence','advanced'], ['activity','advanced']
]
const preferences = value => { const copy = { ...value }; delete copy.windowBounds; return copy }
module.exports = async function settingsScenario({ page }) {
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
  return { visited, groups: 6, allLegacySectionIds: true, correctActiveGroup: true, navigationDoesNotSaveOrReset: true, existingSaveAndSwitchBehavior: true, existingCustomizeRoutes: true }
}
