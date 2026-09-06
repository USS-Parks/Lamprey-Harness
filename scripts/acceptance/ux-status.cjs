/* global window, document */
const assert = require('node:assert/strict')
module.exports = async function statusScenario({ page, app, ids, providerBodies, finishStreams }) {
  const input = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  const send = page.getByRole('button', { name: 'Send', exact: true })
  const stop = page.getByRole('button', { name: 'Stop current turn', exact: true })
  const status = page.locator('[data-task-status]')
  const expectStatus = async label => { await page.locator(`[data-task-status="${label}"]`).waitFor(); assert.equal(await status.count(), 1) }
  const select = async id => {
    const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true })
    if (await expand.isVisible()) await expand.click()
    const title = await page.evaluate(async id => (await window.api.conversation.list()).data.find(task => task.id === id).title, id)
    await page.getByText(title, { exact: true }).last().click()
    await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Message Lamprey"]').disabled)
  }
  const start = async text => {
    const count = providerBodies.length
    await input.fill(text); await send.click(); await stop.waitFor()
    for (let i = 0; i < 100 && providerBodies.length === count; i++) await new Promise(resolve => setTimeout(resolve, 50))
    assert(providerBodies.length > count)
  }
  await select(ids[1])
  await page.getByTitle('Switch model', { exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Models', exact: true })
  await menu.getByRole('searchbox', { name: 'Search models', exact: true }).fill('fixture-vision')
  await menu.locator('[data-model-id="fixture-vision"]').click()
  await start('UX17 complete this controlled turn')
  finishStreams()
  await expectStatus('Completed')
  await page.reload(); await select(ids[1]); await expectStatus('Completed')
  await start('UX17 cancelled turn')
  const old = (await page.evaluate(async id => (await window.api.turn.getState(id)).data, ids[1])).activeTurn
  await select(ids[2])
  await expectStatus('Ready')
  assert.equal(await stop.count(), 0)
  await select(ids[1]); await stop.click(); await expectStatus('Cancelled')
  await app.evaluate(({ BrowserWindow }, old) => {
    BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('index.html')).webContents.send('chat:turn-started', { ...old, occurredAt: old.startedAt, revision: 0 })
  }, old)
  await expectStatus('Cancelled')
  assert.equal(await stop.count(), 0)
  await start('UX17 provider failure')
  await expectStatus('Failed')
  await page.reload(); await select(ids[1]); await expectStatus('Failed')
  await start('UX16 approval fixture for UX17 status')
  const approval = page.getByRole('dialog', { name: 'Allow this action?', exact: true })
  await approval.waitFor(); await expectStatus('Waiting for approval')
  await approval.getByRole('button', { name: 'Deny', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-task-status]')?.getAttribute('data-task-status') !== 'Waiting for approval')
  await stop.click(); await expectStatus('Cancelled')
  await select(ids[2])
  await app.evaluate(({ ipcMain }, owner) => {
    const original = ipcMain._invokeHandlers.get('turn:getState')
    ipcMain.removeHandler('turn:getState')
    ipcMain.handle('turn:getState', (...args) => {
      if (args[1] !== owner) return original(...args)
      ipcMain.removeHandler('turn:getState'); ipcMain.handle('turn:getState', original)
      return { success: false, error: 'UX17 status storage unavailable' }
    })
  }, ids[1])
  await select(ids[1]); await expectStatus('Status unavailable')
  const details = page.locator('details').filter({ has: status })
  await details.locator('summary').click()
  await details.getByRole('button', { name: 'Retry status', exact: true }).click()
  await expectStatus('Cancelled')
  await details.getByRole('button', { name: 'After action', exact: true }).waitFor()
  await details.getByText(/tokens/).first().waitFor()
  assert.equal(await details.getAttribute('open'), '')
  await details.locator('summary').click()
  return { onePrimaryRow: true, completedAndFailedPersistAcrossReload: true, realCancellation: true, staleStartedEventIgnored: true, inactiveOwnerDoesNotShowAnotherTurn: true, realApprovalWaitAndDenial: true, unavailableStatusAndRetry: true, diagnosticsRemainExpandable: true }
}
