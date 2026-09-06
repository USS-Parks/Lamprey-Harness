/* global window, document */
const assert = require('node:assert/strict')
module.exports = async function attentionScenario({ page, app, ids, providerBodies, finishStreams }) {
  const input = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  const send = page.getByRole('button', { name: 'Send', exact: true })
  const attention = page.getByRole('region', { name: 'Task attention', exact: true })
  const select = async id => {
    const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true })
    if (await expand.isVisible()) await expand.click()
    const title = await page.evaluate(async id => (await window.api.conversation.list()).data.find(task => task.id === id).title, id)
    await page.getByText(title, { exact: true }).last().click()
    await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Message Lamprey"]').disabled)
  }
  const start = async text => {
    const before = providerBodies.length
    await input.fill(text); await send.click()
    for (let i = 0; i < 100 && providerBodies.length === before; i++) await new Promise(resolve => setTimeout(resolve, 50))
    assert(providerBodies.length > before)
  }
  await select(ids[21]); await start('UX17 provider failure for UX19')
  await page.locator('[data-task-status="Failed"]').waitFor()
  const failed = (await page.evaluate(async id => (await window.api.turn.getState(id)).data, ids[21])).lastOutcome.turnId
  await select(ids[22]); await start('UX19 completed work'); finishStreams()
  await page.locator('[data-task-status="Completed"]').waitFor()
  const completed = (await page.evaluate(async id => (await window.api.turn.getState(id)).data, ids[22])).lastOutcome.turnId
  await attention.getByRole('button', { name: /Needs attention/ }).click()
  await attention.locator(`[data-attention-id="turn:${failed}"]`).waitFor()
  await attention.locator(`[data-attention-id="turn:${completed}"]`).waitFor()
  await attention.getByRole('button', { name: 'Failures', exact: true }).click()
  await attention.locator(`[data-attention-id="turn:${failed}"]`).click()
  await page.locator('[data-task-status="Failed"]').waitFor()
  assert.equal(await attention.locator(`[data-attention-id="turn:${failed}"]`).count(), 1)
  await attention.getByRole('button', { name: 'Unread', exact: true }).click()
  await attention.locator(`[data-attention-id="turn:${completed}"]`).click()
  await page.locator('[data-task-status="Completed"]').waitFor()
  await page.waitForFunction(id => !document.querySelector(`[data-attention-id="turn:${id}"]`), completed)
  await select(ids[23])
  await page.getByTitle('Switch model', { exact: true }).click()
  const models = page.getByRole('menu', { name: 'Models', exact: true })
  await models.getByRole('searchbox', { name: 'Search models', exact: true }).fill('fixture-vision')
  await models.locator('[data-model-id="fixture-vision"]').click()
  const firstToolRequests = providerBodies.length
  await start('UX16 approval fixture UX18 success for UX19')
  const approval = page.getByRole('dialog', { name: 'Allow this action?', exact: true }).or(page.locator('[data-inline-approval]'))
  await approval.waitFor()
  await approval.getByRole('button', { name: /^(Allow|1 Approve)$/ }).click()
  await page.waitForFunction(async id => (await window.api.tools.getCallsForConversation(id)).data.some(row => row.status === 'done'), ids[23])
  for (let i = 0; i < 100 && providerBodies.length < firstToolRequests + 2; i++) await new Promise(resolve => setTimeout(resolve, 50))
  finishStreams(); await page.locator('[data-task-status="Completed"]').waitFor()
  const secondToolRequests = providerBodies.length
  await start('UX16 approval fixture UX18 failure for UX19 acknowledgement retry')
  const chip = page.locator('[data-inline-approval]'); await chip.waitFor()
  const callId = await chip.getAttribute('data-inline-approval')
  await select(ids[21])
  assert.equal(await chip.count(), 0)
  await attention.getByRole('button', { name: 'Approvals', exact: true }).click()
  await attention.locator(`[data-attention-id="approval:${callId}"]`).click()
  await chip.waitFor()
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('tools:respondToApproval')
    ipcMain.removeHandler('tools:respondToApproval')
    ipcMain.handle('tools:respondToApproval', (...args) => {
      ipcMain.removeHandler('tools:respondToApproval'); ipcMain.handle('tools:respondToApproval', original)
      return { success: false, error: 'UX19 controlled acknowledgement failure' }
    })
  })
  await chip.getByRole('button', { name: '1 Approve', exact: true }).click()
  await chip.getByRole('alert').waitFor()
  assert.equal(await attention.locator(`[data-attention-id="approval:${callId}"]`).count(), 1)
  await chip.getByRole('button', { name: '1 Approve', exact: true }).click()
  await page.waitForFunction(id => !document.querySelector(`[data-attention-id="approval:${id}"]`), callId)
  for (let i = 0; i < 100 && providerBodies.length < secondToolRequests + 2; i++) await new Promise(resolve => setTimeout(resolve, 50))
  finishStreams(); await page.locator('[data-task-status="Completed"]').waitFor()
  await attention.getByRole('button', { name: 'All', exact: true }).click()
  assert.equal(Number(await attention.locator('[data-attention-count]').textContent()), await attention.locator('[data-attention-id]').count())
  for (const name of ['Background', 'Loops', 'Agents']) await attention.getByRole('button', { name, exact: true }).waitFor()
  return { actualFailedAndCompletedTurns: true, failureRemainsAfterReading: true, completionBecomesRead: true, approvalOnlyInOwningTranscript: true, ownerNavigation: true, rejectedAcknowledgementRetainedAndRetried: true, countsAgree: true, operationalLinksPresent: true }
}
