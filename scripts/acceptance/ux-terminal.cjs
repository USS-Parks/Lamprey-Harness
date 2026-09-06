/* global window, document */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function terminalScenario({ page, ids, profile, repo, switchTask, trackPid }) {
  const second = path.join(profile, 'terminal-second')
  fs.mkdirSync(second)
  await page.evaluate(async ({ task, folder }) => {
    const project = await window.api.projects.create({ name: 'Terminal fixture project', path: folder })
    if (!project.success) throw new Error(project.error)
    const assigned = await window.api.projects.assignConversation(task, project.data.id)
    if (!assigned.success) throw new Error(assigned.error)
  }, { task: ids[6], folder: second })
  const idFor = task => `lamprey-task:${encodeURIComponent(task)}:powershell`
  const snapshot = async id => page.evaluate(async id => (await window.api.terminal.snapshot({ id })).data, id)
  const dock = page.getByRole('region', { name: 'Terminal dock', exact: true })
  const open = async () => {
    await page.keyboard.press('Control+Backquote')
    await dock.getByRole('status').getByText('Running', { exact: true }).waitFor()
  }
  const command = async text => {
    const input = dock.locator('textarea.xterm-helper-textarea')
    await input.pressSequentially(text, { delay: 5 })
    await input.press('Enter')
  }
  const waitOutput = async (id, marker) => page.waitForFunction(async ({ id, marker }) => {
    const result = await window.api.terminal.snapshot({ id })
    return result.success && new RegExp(`(?:^|[\r\n])${marker}(?:[\r\n]|$)`).test(result.data?.buffer ?? '')
  }, { id, marker }, { timeout: 15000 })

  await switchTask('UX baseline task 05', 'UX terminal task A ready.')
  await open()
  const idA = idFor(ids[5])
  const initial = await snapshot(idA)
  trackPid(initial.pid)
  assert.equal(path.resolve(initial.cwd), path.resolve(repo))
  await command("Write-Output 'UX_KEYBOARD'")
  await waitOutput(idA, 'UX_KEYBOARD')
  await command("Start-Sleep -Milliseconds 900; Write-Output 'UX_HIDDEN'")
  await dock.getByRole('button', { name: 'Hide terminal', exact: true }).click()
  await waitOutput(idA, 'UX_HIDDEN')
  await open()
  assert.equal((await snapshot(idA)).pid, initial.pid)
  await dock.locator('.xterm-rows').getByText('UX_HIDDEN', { exact: false }).waitFor()
  const height = dock.getByRole('separator', { name: 'Terminal height' })
  const before = Number(await height.getAttribute('aria-valuenow'))
  await height.press('ArrowUp')
  assert.equal(Number(await height.getAttribute('aria-valuenow')), before + 20)
  await page.reload()
  await page.getByText('UX baseline task 05', { exact: true }).last().click()
  await dock.getByRole('status').getByText('Running', { exact: true }).waitFor()
  assert.equal((await snapshot(idA)).pid, initial.pid)
  await dock.locator('.xterm-rows').getByText('UX_HIDDEN', { exact: false }).waitFor()

  const projectRow = page.getByRole('button', { name: 'Terminal fixture project', exact: false }).first()
  if (await projectRow.getAttribute('aria-expanded') !== 'true') {
    await projectRow.click()
    await page.getByRole('dialog', { name: 'Terminal fixture project', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  }
  await switchTask('UX baseline task 06', 'UX terminal task B ready.')
  await open()
  const idB = idFor(ids[6])
  const other = await snapshot(idB)
  trackPid(other.pid)
  assert.equal(path.resolve(other.cwd), path.resolve(second))
  assert.notEqual(other.pid, initial.pid)
  assert(!other.buffer.includes('UX_HIDDEN'))
  await switchTask('UX baseline task 05', 'UX terminal task A ready.')
  await dock.getByRole('button', { name: 'Terminate shell', exact: true }).click()
  await dock.getByRole('status').getByText('Exited', { exact: true }).waitFor()
  assert.equal((await snapshot(idA)).running, false)
  await dock.getByRole('button', { name: 'Restart', exact: true }).click()
  await dock.getByRole('status').getByText('Running', { exact: true }).waitFor()
  const restarted = await snapshot(idA)
  trackPid(restarted.pid)
  assert.notEqual(restarted.pid, initial.pid)
  return { keyboardInput: true, hiddenOutput: true, rendererReloadRetainedPid: true, taskPaths: [initial.cwd, other.cwd], terminated: initial.pid, fixturePids: [initial.pid, other.pid, restarted.pid], restartCreatedNewPid: true }
}
