/* global window, document */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
module.exports = async function commandsScenario({ page, app, ids, repo }) {
  const [a, b, archived] = ids.slice(35, 38)
  const other = path.join(path.dirname(repo), 'command-project')
  fs.mkdirSync(other, { recursive: true }); fs.writeFileSync(path.join(other, 'command-only.txt'), 'UX25 second project file')
  await page.evaluate(async ({ a, b, archived, repo, other }) => {
    for (const [id, title] of [[a, 'UX25 Project Alpha'], [b, 'UX25 Project Beta'], [archived, 'UX25 Archived Alpha']]) await window.api.conversation.updateTitle(id, title)
    for (const [name, folder, tasks] of [['UX25 Alpha', repo, [a, archived]], ['UX25 Beta', other, [b]]]) {
      const result = await window.api.projects.create({ name, path: folder })
      if (!result.success) throw new Error(result.error)
      for (const id of tasks) await window.api.projects.assignConversation(id, result.data.id)
    }
    await window.api.sessions.archive(archived, true)
    const saved = await window.api.workflows.save({ script: "export const meta = { name: 'ux25-safe-workflow', description: 'Command menu fixture', phases: [] }\nlog('UX25 executed'); return { verified: true }" })
    if (!saved.success) throw new Error(saved.error)
  }, { a, b, archived, repo, other })
  await page.reload()
  const primary = page.getByRole('complementary', { name: 'Task sidebar' })
  await primary.getByRole('button', { name: 'Recent', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search tasks', exact: true }).fill('')
  await page.getByRole('combobox', { name: 'Filter tasks by project' }).selectOption('__all__')
  const select = async id => { await page.locator(`[data-task-id="${id}"]`).getByRole('button', { name: /^UX25/ }).first().click() }
  await select(a)
  const menu = page.getByRole('dialog', { name: 'Command menu', exact: true })
  const search = menu.getByRole('combobox', { name: 'Search commands, tasks and files' })
  const open = async () => { await page.keyboard.press('Control+k'); await menu.waitFor(); await search.fill('') }
  await open()
  await menu.getByRole('button', { name: 'Settings', exact: true }).click()
  assert.equal(await menu.locator('[data-command-id^="settings."]').count(), 24)
  await menu.getByRole('button', { name: 'Commands', exact: true }).click()
  assert.equal(await menu.locator('[data-command-id^="tool."]').count(), 13)
  await menu.getByRole('button', { name: 'All', exact: true }).click()
  await search.fill('Permissions'); await search.press('Enter')
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.waitFor(); assert.equal(await settings.getByRole('tab', { name: 'Permissions', exact: true }).getAttribute('aria-selected'), 'true')
  assert.equal(await menu.count(), 0); await settings.getByRole('button', { name: 'Close settings' }).click()
  await open(); await menu.getByRole('button', { name: 'Files', exact: true }).click(); await search.fill('first/example.ts')
  await menu.getByRole('option', { name: /first.*example.ts/ }).waitFor()
  await search.press('ArrowDown'); await search.press('Enter')
  await page.getByRole('tab', { name: /example.ts/ }).first().waitFor()
  await open(); await menu.getByRole('button', { name: 'Tasks', exact: true }).click(); await search.fill('UX25')
  await menu.locator(`[data-command-id="task.${archived}"]`).waitFor()
  assert.equal(await menu.locator(`[data-command-id="task.${b}"]`).count(), 0)
  await search.press('Escape'); assert.equal(await menu.count(), 0)
  await select(b); await open(); await menu.getByRole('button', { name: 'Files', exact: true }).click()
  await menu.locator('[data-command-id="file.command-only.txt"]').waitFor()
  assert.equal(await menu.getByRole('option', { name: /first.*example.ts/ }).count(), 0)
  await search.fill('no-such-command-ux25'); await menu.getByText('No matching commands, tasks or files.', { exact: true }).waitFor()
  await search.press('Escape')
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('files:getWorkdir')
    ipcMain.removeHandler('files:getWorkdir'); ipcMain.handle('files:getWorkdir', () => {
      ipcMain.removeHandler('files:getWorkdir'); ipcMain.handle('files:getWorkdir', original)
      return { success: false, error: 'UX25 controlled index failure' }
    })
  })
  await open(); await menu.getByRole('alert').filter({ hasText: 'UX25 controlled index failure' }).waitFor()
  await menu.getByRole('button', { name: 'Retry command sources' }).click()
  await menu.locator('[data-command-id="file.command-only.txt"]').waitFor()
  await menu.getByRole('button', { name: 'New workflow', exact: true }).click()
  await menu.getByRole('button', { name: 'Back to commands', exact: true }).click()
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('workflows:run')
    globalThis.ux25WorkflowRuns = []
    ipcMain.removeHandler('workflows:run'); ipcMain.handle('workflows:run', async (...args) => {
      const result = await original(...args); globalThis.ux25WorkflowRuns.push({ input: args[1], result }); return result
    })
  })
  await search.fill('ux25-safe-workflow'); await menu.locator('[data-command-id^="workflow."]').waitFor(); await search.press('Enter')
  for (let i = 0; i < 100 && !(await app.evaluate(() => globalThis.ux25WorkflowRuns.length)); i++) await page.waitForTimeout(50)
  const runs = await app.evaluate(() => globalThis.ux25WorkflowRuns)
  assert.equal(runs.length, 1); assert(runs[0].result.success); assert.equal(runs[0].input.name, 'ux25-safe-workflow')
  await open(); await search.fill('Review'); await menu.locator('[data-command-id="tool.review"]').click()
  await page.getByRole('tab', { name: 'Review', exact: true }).waitFor()
  await page.keyboard.press('Control+p')
  await page.getByPlaceholder(/^Type a filename/).waitFor(); await page.keyboard.press('Escape')
  return { allSettings: 24, allTools: 13, keyboardSelectionAndEscape: true, realFileOpen: true, projectScopedTasksAndFiles: true, emptyResults: true, sourceFailureAndRetry: true, workflowEditorPreserved: true, realNamedWorkflowStartedOnce: true, directFileShortcut: true }
}
