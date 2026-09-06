/* global window, document */
const assert = require('node:assert/strict')
module.exports = async function navigationScenario({ page, app, ids, repo, providerBodies, finishStreams }) {
  const [a, b, c] = ids.slice(31, 34)
  const before = providerBodies.length
  await page.evaluate(a => { window.uxSearchTurn = window.api.chat.send({ conversationId: a, model: 'fixture-stream', content: 'UX23 bodyneedle archival evidence', activeSkillIds: [] }) }, a)
  for (let i = 0; i < 100 && providerBodies.length === before; i++) await page.waitForTimeout(50)
  assert(providerBodies.length > before); finishStreams()
  await page.evaluate(() => window.uxSearchTurn)
  const project = await page.evaluate(async ({ a, b, c, repo }) => {
    for (const [id, title] of [[a, 'UX23 Alpha'], [b, 'UX23 Beta'], [c, 'UX23 Gamma']]) await window.api.conversation.updateTitle(id, title)
    const project = await window.api.projects.create({ name: 'UX23 filtered project', path: repo })
    if (!project.success) throw new Error(project.error)
    await window.api.projects.assignConversation(a, project.data.id)
    await window.api.projects.assignConversation(b, project.data.id)
    return project.data.id
  }, { a, b, c, repo })
  await page.reload()
  const primary = page.getByRole('complementary', { name: 'Task sidebar' })
  const input = page.getByRole('searchbox', { name: 'Search tasks', exact: true })
  const row = id => page.locator(`[data-task-id="${id}"]`)
  const select = async id => { await row(id).getByRole('button', { name: /^UX23/ }).first().click(); await page.waitForFunction(id => document.querySelector(`[data-task-id="${id}"] [aria-current="page"]`), id) }
  await input.fill('bodyneedle')
  await row(a).waitFor()
  await page.getByRole('combobox', { name: 'Filter tasks by project' }).selectOption(project)
  await row(a).waitFor(); assert.equal(await row(c).count(), 0)
  await row(a).getByRole('button', { name: /^Task actions:/ }).click()
  await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()
  await primary.getByRole('button', { name: 'Archived', exact: true }).click()
  await row(a).waitFor()
  assert((await page.getByTestId('sessions-sidebar').innerText()).includes('bodyneedle'))
  await row(a).getByRole('button', { name: /^Task actions:/ }).click()
  await page.getByRole('menuitem', { name: 'Unarchive', exact: true }).click()
  await primary.getByRole('button', { name: 'Recent', exact: true }).click()
  await input.fill('')
  await page.getByRole('combobox', { name: 'Filter tasks by project' }).selectOption('__all__')
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('sessions:list')
    globalThis.uxSearchCalls = []
    ipcMain.removeHandler('sessions:list'); ipcMain.handle('sessions:list', async (...args) => {
      globalThis.uxSearchCalls.push(args[1]?.query)
      const response = await original(...args)
      if (args[1]?.query === 'Alpha') await new Promise(resolve => setTimeout(resolve, 400))
      return response
    })
  })
  await input.fill('Alpha')
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.uxSearchCalls.includes('Alpha'))); i++) await page.waitForTimeout(20)
  await input.fill('Beta'); await row(b).waitFor(); await page.waitForTimeout(500)
  assert.equal(await row(a).count(), 0)
  await input.fill(''); await row(a).waitFor()
  await select(a)
  const composer = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  await composer.fill('UX23 saved Alpha draft')
  await select(b); await composer.fill('UX23 saved Beta draft')
  await app.evaluate(({ ipcMain }, owner) => {
    const original = ipcMain._invokeHandlers.get('conversation:getMessages')
    let first = true
    ipcMain.removeHandler('conversation:getMessages'); ipcMain.handle('conversation:getMessages', async (...args) => {
      const response = await original(...args)
      if (args[1] === owner && first) { first = false; await new Promise(resolve => setTimeout(resolve, 400)); return { ...response, data: response.data.map(row => ({ ...row, content: 'UX23 STALE FIRST READ' })) } }
      return response
    })
  }, a)
  await select(a); await select(b); await select(a)
  await page.waitForTimeout(500)
  assert.equal(await composer.inputValue(), 'UX23 saved Alpha draft')
  assert.equal(await page.getByText('UX23 STALE FIRST READ', { exact: true }).count(), 0)
  assert((await page.locator('.chat-column').innerText()).includes('bodyneedle'))
  await select(b); await select(c)
  await page.evaluate(b => window.api.conversation.delete(b), b)
  await primary.getByRole('button', { name: 'Back', exact: true }).click()
  await page.waitForFunction(a => document.querySelector(`[data-task-id="${a}"] [aria-current="page"]`), a)
  await page.getByRole('button', { name: 'Forward in task history', exact: true }).click()
  await page.waitForFunction(c => document.querySelector(`[data-task-id="${c}"] [aria-current="page"]`), c)
  await app.evaluate(({ ipcMain }, owner) => {
    const original = ipcMain._invokeHandlers.get('conversation:getMessages')
    ipcMain.removeHandler('conversation:getMessages'); ipcMain.handle('conversation:getMessages', (...args) => {
      if (args[1] !== owner) return original(...args)
      ipcMain.removeHandler('conversation:getMessages'); ipcMain.handle('conversation:getMessages', original)
      return { success: false, error: 'UX23 controlled read failure' }
    })
  }, a)
  await select(a)
  await page.getByRole('alert').filter({ hasText: 'UX23 controlled read failure' }).waitFor()
  assert.equal(await page.locator('.chat-column').getByText('UX23 bodyneedle archival evidence', { exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Retry task', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.chat-column [role="alert"]'))
  assert((await page.locator('.chat-column').innerText()).includes('bodyneedle'))
  for (const id of [a, c]) await row(id).getByTitle('Pin', { exact: true }).click()
  await primary.getByRole('button', { name: 'Pinned', exact: true }).click()
  const previous = await page.locator('[data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId))
  await row(previous[0]).getByRole('button', { name: /^Task actions:/ }).click()
  await page.getByRole('menuitem', { name: 'Move pin down', exact: true }).click()
  const order = await page.locator('[data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId))
  assert.notDeepEqual(order, previous)
  await page.reload()
  await primary.getByRole('button', { name: 'Pinned', exact: true }).click()
  await row(a).waitFor()
  assert.deepEqual(await page.locator('[data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId)), order)
  return { realHistoricalSearch: true, projectAndArchiveFilters: true, staleQueryRejected: true, rapidSameTaskReturnRejectsOldRead: true, separateDraftsRetained: true, deletedHistoryTargetSkipped: true, backForward: true, failedReadEmptyAndRetry: true, keyboardPinOrderSurvivesReload: true }
}
