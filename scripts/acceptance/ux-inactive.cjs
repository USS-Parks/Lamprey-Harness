/* global document */
const assert = require('node:assert/strict')
module.exports = async function inactiveScenario({ page }) {
  assert.equal(await page.getByRole('button', { name: 'Voice input', exact: true }).count(), 0)
  assert.equal(await page.locator('[data-mode-slot]').count(), 0)
  const add = page.getByRole('button', { name: 'Add', exact: true })
  const menu = page.getByRole('menu', { name: 'Add to prompt', exact: true })
  await add.click()
  assert.deepEqual(await menu.getByRole('button').allTextContents(), ['Add files or photosCtrl/Cmd+U', 'Slash commands', 'Connectors', 'Plugins', 'Keyboard help'])
  await menu.getByRole('button', { name: 'Keyboard help', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'Composer keyboard help', exact: true })
  await help.getByText('Shift+Enter', { exact: true }).waitFor()
  await help.press('Escape')
  assert.equal(await add.evaluate(node => document.activeElement === node), true)
  for (const column of ['Connectors', 'Plugins']) {
    await add.click()
    await menu.getByRole('button', { name: column, exact: true }).click()
    await page.getByRole('heading', { name: 'Customize Lamprey', exact: true }).waitFor()
    const section = page.getByRole('region', { name: column, exact: true })
    assert.match(await section.getAttribute('class'), /border-\[var\(--accent\)\]/)
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click()
  }
  const input = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  await input.fill('draft for slash command')
  await add.click()
  await menu.getByRole('button', { name: 'Slash commands', exact: true }).click()
  assert.equal(await input.inputValue(), '/draft for slash command')
  await input.fill('')
  return { inactiveVoiceAndActionsAbsent: true, customizationRoutesReal: true, keyboardHelpAccessible: true, menuEscapeFocus: true, slashActionPreservesDraft: true, attachmentAndRunningLayouts: 'Covered by preceding COMPOSER/FOLLOW_UP cases and idle/running captures in the same build.' }
}
