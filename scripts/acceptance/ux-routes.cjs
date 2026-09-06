/* global window, document */
const assert = require('node:assert/strict')

module.exports = async function routeScenario({ page, app, ids, trackPid }) {
  const routes = ['Files', 'Side chat', 'Browser', 'Review', 'Terminal', 'Environment', 'Sources', 'Artifacts', 'Plan', 'Background tasks', 'After action', 'Loops', 'Agents']
  const errors = []
  const onError = error => errors.push(error.message)
  page.on('pageerror', onError)
  const add = page.getByRole('button', { name: 'Add workspace tab', exact: true })
  const menu = page.getByRole('group', { name: 'Add workspace resource' })
  const visited = []
  try {
    for (const label of routes) {
      await add.click()
      assert.deepEqual((await menu.getByRole('button').allTextContents()).filter(text => text !== 'Open in VS Code').sort(), routes.slice().sort())
      await menu.getByRole('button', { name: label, exact: true }).click()
      if (label === 'Terminal') {
        const dock = page.getByRole('region', { name: 'Terminal dock', exact: true })
        await dock.getByRole('status').getByText('Running', { exact: true }).waitFor()
        const id = `lamprey-task:${encodeURIComponent(ids[1])}:powershell`
        const snapshot = await page.evaluate(async id => (await window.api.terminal.snapshot({ id })).data, id)
        trackPid(snapshot.pid)
        assert.equal(snapshot.conversationId, ids[1])
        assert.deepEqual(await dock.getByRole('combobox', { name: 'Terminal shell' }).locator('option').allTextContents(), ['PowerShell', 'Command Prompt', 'Git Bash', 'WSL'])
        await dock.getByRole('button', { name: 'Hide terminal', exact: true }).click()
      } else {
        const tab = page.getByRole('tab', { name: label, exact: true })
        await tab.waitFor()
        assert.equal(await tab.getAttribute('aria-selected'), 'true')
        const body = page.locator('#workspace-content')
        if (label === 'Browser') await body.getByPlaceholder('Search Google or type a URL').waitFor()
        else if (label === 'Side chat') await body.getByPlaceholder('Side message (Enter to send, Shift+Enter for newline)').waitFor()
        else await page.waitForFunction(() => document.querySelector('#workspace-content')?.textContent.trim().length > 0)
      }
      visited.push(label)
    }
    await app.evaluate(({ ipcMain }) => {
      globalThis.uxEditorCalls = []
      ipcMain.removeHandler('files:openInVSCode')
      ipcMain.handle('files:openInVSCode', (_event, args) => { globalThis.uxEditorCalls.push(args); return { success: true, data: true } })
    })
    await add.click()
    await menu.getByRole('button', { name: 'Open in VS Code', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('button[aria-label="Add workspace tab"]')?.getAttribute('aria-expanded') === 'false')
    assert.equal((await app.evaluate(() => globalThis.uxEditorCalls)).length, 1)
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('tab', { name: 'Appearance', exact: true }).click()
    await settings.getByRole('button', { name: 'Light', exact: true }).waitFor()
    await settings.getByRole('button', { name: 'Dark', exact: true }).waitFor()
    await settings.getByRole('button', { name: 'Close settings', exact: true }).click()
    assert.equal(await page.getByTitle('Open tool', { exact: true }).count(), 0)
    assert.deepEqual(errors, [])
    return { visited, routeCount: visited.length, editorAction: 'real renderer/preload with controlled launch IPC; no external window opened', settingsAndThemeReachable: true, duplicateLauncherRemoved: true }
  } finally { page.off('pageerror', onError) }
}
