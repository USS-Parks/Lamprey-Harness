/* global window, document */
const assert = require('node:assert/strict')

module.exports = async function browserScenario({ page, app, ids, origin, switchTask }) {
  const urlA = `${origin}/browser/a`
  const urlB = `${origin}/browser/b`
  const create = async (ownerId, url) => page.evaluate(async args => {
    const result = await window.api.browser.newTab(args)
    if (!result.success) throw new Error(result.error)
    return result.data.id
  }, { ownerId, url })
  const tabA = await create(ids[3], urlA)
  const tabB = await create(ids[4], urlB)
  const openBrowser = async () => {
    const expand = page.getByRole('button', { name: 'Expand artifacts panel', exact: true })
    if (await expand.count()) await expand.click()
    await page.getByRole('button', { name: 'Add workspace tab', exact: true }).click()
    await page.getByRole('group', { name: 'Add workspace resource' }).getByRole('button', { name: 'Browser', exact: true }).click()
    await page.getByPlaceholder('Search Google or type a URL').waitFor()
  }
  const waitUrl = async (ownerId, id, url) => page.waitForFunction(async ({ ownerId, id, url }) => {
    const result = await window.api.browser.listTabs({ ownerId })
    return result.success && result.data.tabs.some(tab => tab.id === id && tab.url === url && !tab.loading)
  }, { ownerId, id, url })
  const nativeViews = async () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.map(view => ({ url: view.webContents?.getURL() ?? '', visible: view.getVisible() })))

  await switchTask('UX baseline task 03', 'UX browser task A ready.')
  await openBrowser()
  await waitUrl(ids[3], tabA, urlA)
  await page.waitForFunction(url => document.querySelector('input[placeholder="Search Google or type a URL"]')?.value === url, urlA)
  const address = page.getByPlaceholder('Search Google or type a URL')
  await address.fill(urlB)
  await address.press('Enter')
  await waitUrl(ids[3], tabA, urlB)
  const content = page.locator('#workspace-content')
  await content.getByTitle('Back', { exact: true }).click()
  await waitUrl(ids[3], tabA, urlA)
  await content.getByTitle('Forward', { exact: true }).click()
  await waitUrl(ids[3], tabA, urlB)
  await content.getByTitle('Reload', { exact: true }).click()
  await waitUrl(ids[3], tabA, urlB)
  await content.getByTitle('Back', { exact: true }).click()
  await waitUrl(ids[3], tabA, urlA)
  await address.fill('Preserve this address draft')
  const countBefore = (await nativeViews()).length
  for (let cycle = 0; cycle < 10; cycle++) {
    await page.getByRole('button', { name: 'Collapse panel', exact: true }).click()
    await page.getByRole('button', { name: 'Expand artifacts panel', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('input[placeholder="Search Google or type a URL"]')?.value === 'Preserve this address draft')
  }
  assert.equal((await nativeViews()).length, countBefore)
  await page.getByRole('button', { name: 'Close Browser tab', exact: true }).click()
  const hidden = await nativeViews()
  assert(hidden.filter(view => view.url.startsWith(`${origin}/browser/`)).every(view => !view.visible))
  await openBrowser()
  assert.equal((await nativeViews()).length, countBefore)
  await page.waitForFunction(() => document.querySelector('input[placeholder="Search Google or type a URL"]')?.value === 'Preserve this address draft')

  await switchTask('UX baseline task 04', 'UX browser task B ready.')
  await openBrowser()
  await page.waitForFunction(url => document.querySelector('input[placeholder="Search Google or type a URL"]')?.value === url, urlB)
  const owned = await page.evaluate(async ownerId => (await window.api.browser.listTabs({ ownerId })).data.tabs, ids[4])
  assert.deepEqual(owned.map(tab => tab.id), [tabB])
  const visibleB = (await nativeViews()).filter(view => view.visible && view.url.startsWith(`${origin}/browser/`))
  assert.equal(visibleB.length, 1)
  assert.equal(visibleB[0].url, urlB)
  await switchTask('UX baseline task 03', 'UX browser task A ready.')
  await page.waitForFunction(() => document.querySelector('input[placeholder="Search Google or type a URL"]')?.value === 'Preserve this address draft')
  await content.getByTitle('Close tab', { exact: true }).click()
  await page.waitForFunction(async ownerId => (await window.api.browser.listTabs({ ownerId })).data.tabs.length === 0, ids[3])
  const remaining = await page.evaluate(async ownerId => (await window.api.browser.listTabs({ ownerId })).data.tabs, ids[4])
  assert.deepEqual(remaining.map(tab => tab.id), [tabB])
  await page.evaluate(async id => { await window.api.browser.closeTab({ id }) }, tabB)
  assert.equal((await nativeViews()).length, countBefore - 2)
  return { cycles: 10, countBefore, countAfterClose: (await nativeViews()).length, tabA, tabB, navigation: 'back-forward-reload passed', addressDraftRetained: true, ownership: 'task-scoped lists and one visible task page', outerClose: 'hidden', innerClose: 'destroyed' }
}
