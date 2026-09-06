/* global window, document */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
module.exports = async function noticesScenario({ page, app, ids, repo, providerBodies, finishStreams }) {
  const owners = ids.slice(25, 27)
  await app.evaluate(({ ipcMain }) => {
    globalThis.uxApprovalResponses = []
    for (const name of ['tools:respondToApproval', 'mcp:approveToolCall']) {
      const original = ipcMain._invokeHandlers.get(name)
      ipcMain.removeHandler(name); ipcMain.handle(name, (event, ...args) => { globalThis.uxApprovalResponses.push({ name, args, at: Date.now() }); return original(event, ...args) })
    }
  })
  await page.evaluate(owners => {
    window.uxInputs = []
    document.addEventListener('click', e => window.uxInputs.push({ type: 'click', trusted: e.isTrusted, text: e.target.textContent?.slice(0, 100) }), true)
    document.addEventListener('keydown', e => window.uxInputs.push({ type: 'key', trusted: e.isTrusted, key: e.key }), true)
    window.uxApprovalRequests = []
    window.uxApprovalEvents = []
    window.api.tools.onApprovalResolved(event => window.uxApprovalEvents.push({ kind: 'resolved', ...event }))
    window.api.chat.onTurnSettled(event => window.uxApprovalEvents.push({ kind: 'settled', ...event }))
    window.api.tools.onApprovalRequired(request => window.uxApprovalRequests.push(request))
    window.uxConcurrentTurns = owners.map(conversationId => window.api.chat.send({ conversationId, model: 'fixture-vision', content: 'UX16 approval fixture for UX20 concurrent decisions', activeSkillIds: [] }))
  }, owners)
  await page.waitForFunction(() => window.uxApprovalRequests.length === 2)
  const requests = await page.evaluate(() => window.uxApprovalRequests)
  const first = requests[0]; const second = requests[1]
  const modal = page.locator(`[data-approval-id="${first.callId}"]`)
  await modal.waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
  await page.waitForTimeout(32000)
  await app.evaluate(({ BrowserWindow }) => globalThis.uxShowInactive.call(BrowserWindow.getAllWindows()[0]))
  const holdInputs = await page.evaluate(() => window.uxInputs)
  const holdResponses = await app.evaluate(() => globalThis.uxApprovalResponses)
  assert.equal(holdResponses.length, 0)
  if (await modal.count() !== 1) console.log('Approval responses:', await app.evaluate(() => globalThis.uxApprovalResponses), 'Inputs:', await page.evaluate(() => window.uxInputs))
  if (await modal.count() !== 1) console.log('Approval diagnostic:', await page.evaluate(async requests => ({ requests, events: window.uxApprovalEvents, states: await Promise.all(requests.map(async request => (await window.api.turn.getState(request.conversationId)).data)), text: document.body.innerText.slice(-6000) }), requests))
  assert.equal(await modal.count(), 1)
  assert.equal(await page.getByText(/Auto-deny in/).count(), 0)
  await page.evaluate(id => window.api.chat.cancel(id), first.conversationId)
  await page.waitForFunction(async id => (await window.api.turn.getState(id)).data.lastOutcome?.status === 'cancelled', first.conversationId)
  const next = page.locator(`[data-approval-id="${second.callId}"]`); await next.waitFor()
  const stale = await page.evaluate(callId => window.api.tools.respondToApproval({ callId, decision: 'allow', scope: 'always' }), first.callId)
  assert.equal(stale.success, false)
  await app.evaluate(({ BrowserWindow }, request) => BrowserWindow.getAllWindows()[0].webContents.send('tools:approvalRequired', request), first)
  assert.equal(await modal.count(), 0)
  const before = providerBodies.length
  await next.getByRole('button', { name: 'Deny', exact: true }).focus()
  await page.keyboard.press('Escape')
  for (let i = 0; i < 100 && providerBodies.length === before; i++) await new Promise(resolve => setTimeout(resolve, 50))
  finishStreams()
  await page.waitForFunction(async id => !(await window.api.turn.getState(id)).data.activeTurn, second.conversationId)
  assert.equal(fs.existsSync(path.join(repo, 'ux20-not-approved.txt')), false)
  const event = { id: 'ux20-notice', conversationId: ids[28], kind: 'agent_completed', title: 'UX20 background completed', message: 'Retained notification detail', createdAt: Date.now() }
  const emit = async () => app.evaluate(({ BrowserWindow }, event) => { for (let i = 0; i < 4; i++) BrowserWindow.getAllWindows()[0].webContents.send('async-event:received', event) }, event)
  await emit()
  const toast = page.getByRole('status').filter({ hasText: 'UX20 background completed: Retained notification detail' })
  await toast.waitFor(); assert.equal(await toast.count(), 1)
  await toast.getByTitle('Dismiss', { exact: true }).click(); await emit()
  assert.equal(await toast.count(), 0)
  const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true }); if (await expand.isVisible()) await expand.click()
  const title = await page.evaluate(async id => (await window.api.conversation.list()).data.find(task => task.id === id).title, ids[28])
  await page.getByText(title, { exact: true }).last().click()
  assert.equal(await page.getByText('Retained notification detail', { exact: true }).count(), 1)
  await app.evaluate(({ ipcMain }) => {
    globalThis.uxStatusHandlers = new Map()
    for (const [name, result] of [
      ['settings:isEncryptionAvailable', { success: true, data: false }],
      ['persistence:getStatus', { success: true, data: { lastIntegrity: { ok: false, result: 'UX20 controlled integrity failure', ranAt: Date.now(), durationMs: 1 }, latestBackup: null } }]
    ]) {
      globalThis.uxStatusHandlers.set(name, ipcMain._invokeHandlers.get(name))
      ipcMain.removeHandler(name); ipcMain.handle(name, () => result)
    }
  })
  await page.reload()
  await page.getByText(/OS-level secret storage is unavailable/).waitFor()
  await page.getByText('UX20 controlled integrity failure', { exact: true }).waitFor()
  await app.evaluate(({ ipcMain }) => {
    for (const name of globalThis.uxStatusHandlers.keys()) { ipcMain.removeHandler(name); ipcMain.handle(name, () => ({ success: false, error: `UX20 unavailable ${name}` })) }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Retry secret storage check', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Retry integrity check', exact: true }).waitFor()
  await app.evaluate(({ ipcMain }) => { for (const [name, handler] of globalThis.uxStatusHandlers) { ipcMain.removeHandler(name); ipcMain.handle(name, handler) } })
  await page.getByRole('button', { name: 'Retry secret storage check', exact: true }).click()
  await page.getByRole('button', { name: 'Retry integrity check', exact: true }).click()
  await page.waitForFunction(() => !document.body.textContent.includes('UX20 unavailable'))
  return { holdPresentation: 'Native window hidden during the idle timeout hold; visible before and after. No performance measurement.', holdInputs, holdResponses, twoConcurrentRealApprovals: true, pendingPastOld30SecondTimeout: true, cancellationSettlesOnlyOwner: true, latePersistentGrantRejected: true, staleEventDoesNotRevive: true, escapeDeniesFocusedRequestOnly: true, noWriteExecuted: true, repeatedEventOneToast: true, retainedTaskNotice: true, securityAndIntegrityWarningsRemainVisible: true, failedStatusReadsVisibleAndRetryable: true }
}
