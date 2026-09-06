/* global window, document, KeyboardEvent */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
module.exports = async function setupScenario({ page, app, profile, cloud, providerBodies, finishStreams, fresh = true }) {
  const welcome = page.getByRole('dialog', { name: 'Welcome to the Lamprey Harness', exact: true })
  if (fresh) assert.equal(await page.evaluate(async () => (await window.api.conversation.list()).data.length), 0)
  if (cloud) {
    await welcome.waitFor()
    await app.evaluate(({ ipcMain }) => {
      const original = ipcMain._invokeHandlers.get('settings:isEncryptionAvailable')
      globalThis.ux29Encryption = original
      let first = true
      ipcMain.removeHandler('settings:isEncryptionAvailable'); ipcMain.handle('settings:isEncryptionAvailable', () => { if (first) { first = false; return { success: false, error: 'UX29 storage check unavailable' } } return { success: true, data: false } })
      const save = ipcMain._invokeHandlers.get('settings:saveProviderKey')
      let fail = true
      ipcMain.removeHandler('settings:saveProviderKey'); ipcMain.handle('settings:saveProviderKey', (...args) => { if (fail) { fail = false; return { success: false, error: 'UX29 controlled storage write failure' } } return save(...args) })
    })
    await page.reload(); await welcome.getByRole('alert').filter({ hasText: 'UX29 storage check unavailable' }).waitFor()
    assert(await welcome.getByRole('button', { name: 'Connect', exact: true }).isDisabled())
    await welcome.getByRole('button', { name: 'Retry loading providers' }).click()
    await welcome.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('fixture-keyed')
    const key = welcome.locator('input[type="password"]'); await key.fill('fixture-provider-key')
    assert(await key.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))))
    assert.equal((await page.evaluate(() => window.api.settings.hasProviderKey('fixture-keyed'))).data, false)
    let consent = 0
    page.on('dialog', async dialog => { assert(dialog.message().includes('Encryption is unavailable')); consent++; if (consent === 1) await dialog.dismiss(); else await dialog.accept() })
    await welcome.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.waitForTimeout(100); assert.equal((await page.evaluate(() => window.api.settings.hasProviderKey('fixture-keyed'))).data, false)
    await welcome.getByRole('button', { name: 'Connect', exact: true }).click()
    await welcome.getByRole('alert').filter({ hasText: 'UX29 controlled storage write failure' }).waitFor()
    assert.equal((await page.evaluate(() => window.api.settings.hasProviderKey('fixture-keyed'))).data, false)
    await welcome.getByRole('button', { name: 'Connect', exact: true }).click(); await welcome.waitFor({ state: 'hidden' })
    assert.equal(consent, 2)
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('settings:isEncryptionAvailable'); ipcMain.handle('settings:isEncryptionAvailable', globalThis.ux29Encryption) })
  } else assert.equal(await welcome.count(), 0)
  if (fresh) await page.getByRole('button', { name: 'New task', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  const requestsBefore = providerBodies.length
  await input.fill('UX29 verify local fixture setup'); await input.press('Enter')
  for (let i = 0; i < 100 && providerBodies.length === requestsBefore; i++) await page.waitForTimeout(50)
  assert(providerBodies.length > requestsBefore)
  if (cloud) assert(providerBodies.at(-1)._fixtureKeyAccepted)
  else assert.equal(providerBodies.at(-1).model, 'fixture-stream')
  finishStreams(); await page.getByRole('button', { name: 'Send', exact: true }).waitFor()
  await page.reload(); assert.equal(await welcome.count(), 0)
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  const expectLeaf = async (id, group) => { await settings.waitFor(); assert.equal(await settings.locator(`#settings-tab-${id}`).getAttribute('aria-selected'), 'true'); assert.equal(await settings.locator(`[data-settings-group="${group}"]`).getAttribute('aria-expanded'), 'true'); await settings.getByRole('button', { name: 'Close settings' }).click() }
  await page.getByTitle('Switch model', { exact: true }).click(); await page.getByRole('menu', { name: 'Models', exact: true }).getByRole('button', { name: 'Model settings' }).click(); await expectLeaf('models','connections')
  await page.getByTitle('Permissions mode', { exact: true }).click(); await page.getByRole('button', { name: 'Permission settings', exact: true }).click(); await expectLeaf('permissions','permissions')
  await page.locator('.chat-column summary').filter({ hasText: 'Details' }).click()
  for (const [label,id,group] of [['Context budgets','seedBudget','advanced'],['Tool settings','tools','extensions'],['Automation settings','automations','general'],['Storage and recovery','persistence','advanced']]) {
    await page.locator('.chat-column').getByRole('button', { name: label, exact: true }).click(); await expectLeaf(id,group)
  }
  await input.fill('/models'); await input.press('Escape'); await input.press('Enter'); await expectLeaf('models','connections')
  await page.evaluate(() => window.api.settings.deleteProviderKey('fixture-keyed'))
  await page.getByTitle('Switch model', { exact: true }).click()
  const models = page.getByRole('menu', { name: 'Models', exact: true }); await models.getByRole('searchbox', { name: 'Search models' }).fill('fixture-keyed'); await models.locator('[data-model-id="fixture-keyed-model"]').click()
  await page.getByRole('dialog', { name: 'Add a Fixture Keyed Provider API key', exact: true }).getByRole('button', { name: 'Provider settings' }).click(); await expectLeaf('api','connections')
  const settingsPath = path.join(profile,'settings.json'); const valid = fs.readFileSync(settingsPath)
  fs.writeFileSync(settingsPath, '{"ux29-broken":')
  await page.reload(); await welcome.waitFor()
  const preserved = fs.readdirSync(profile).filter(name => name.startsWith('settings.json.corrupt-'))
  assert(preserved.length > 0); assert.equal(fs.readFileSync(path.join(profile,preserved.at(-1)),'utf8'), '{"ux29-broken":')
  await welcome.getByRole('button', { name: 'Set up a local model', exact: true }).click()
  await settings.waitFor(); assert.equal(await settings.locator('#settings-tab-models').getAttribute('aria-selected'), 'true'); assert.equal(await settings.locator('#settings-tab-persistence').count(), 0)
  fs.writeFileSync(settingsPath,valid)
  // Restore the valid fixture to keyless startup after checking corrupt-file preservation.
  await page.evaluate(() => window.api.settings.set({ defaultModel: 'fixture-stream' }))
  await page.reload(); await input.waitFor(); assert.equal(await welcome.count(),0)
  return { fresh, cloud, realProviderRequest: true, configuredReload: true, unavailableStorageCheckAndWrite: cloud ? 'controlled failures followed by real keychain/provider success' : 'covered by cloud fixture', declinedConsentBlocksWrite: cloud, composedEnterDoesNotSave: cloud, contextualLeafRoutes: true, preservedInvalidSettings: true, localSetupRecovery: true, advancedCollapsedAtStartup: true }
}
