/* global window, document, getComputedStyle, requestAnimationFrame */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
module.exports = async function accessibilityScenario({ page, app, ids, profile, output }) {
  const input = page.getByRole('textbox', { name: 'Message Lamprey', exact: true })
  const search = page.getByRole('searchbox', { name: 'Search tasks', exact: true })
  await search.fill('UX baseline task 39')
  await page.locator(`[data-task-id="${ids[39]}"]`).getByRole('button', { name: /^UX baseline/ }).first().click()
  await search.fill(''); await input.fill('UX32 preserved draft')
  const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const trap = async dialog => {
    const controls = await dialog.locator('button, input, select, textarea, [href], [tabindex]').evaluateAll(nodes => nodes.filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length).map(node => node.outerHTML.slice(0,120)))
    assert(controls.length > 0)
    await dialog.evaluate(root => { const nodes = [...root.querySelectorAll('button,input,select,textarea,[href],[tabindex]')].filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length); nodes[0].focus() })
    await page.keyboard.press('Shift+Tab')
    assert(await dialog.evaluate(root => { const nodes = [...root.querySelectorAll('button,input,select,textarea,[href],[tabindex]')].filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length); return document.activeElement === nodes.at(-1) }))
    await page.keyboard.press('Tab')
    assert(await dialog.evaluate(root => { const nodes = [...root.querySelectorAll('button,input,select,textarea,[href],[tabindex]')].filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && node.getClientRects().length); return document.activeElement === nodes[0] }))
    return controls.length
  }
  const injectFailure = channel => app.evaluate(({ ipcMain }, channel) => {
    const original = ipcMain._invokeHandlers.get(channel)
    ipcMain.removeHandler(channel); ipcMain.handle(channel, async () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, original); throw new Error(`UX32 rejected ${channel}`) })
  }, channel)
  const worktrees = page.getByRole('dialog', { name: 'Worktrees', exact: true })
  const openWorktrees = async () => {
    await page.getByRole('button', { name: 'Task context', exact: true }).click()
    await page.getByRole('button', { name: 'Worktree manager', exact: true }).click(); await worktrees.waitFor()
  }
  await injectFailure('worktree:list'); await openWorktrees()
  await worktrees.getByRole('alert').getByText(/UX32 rejected/).waitFor()
  await worktrees.getByRole('button', { name: 'Retry worktree list' }).click()
  const create = worktrees.getByRole('button', { name: 'Create worktree', exact: true })
  await create.waitFor(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Create worktree')?.disabled)
  const worktreeFocusCount = await trap(worktrees)
  const worktreePath = path.join(profile, 'ux32-worktree')
  await worktrees.getByRole('textbox', { name: 'Worktree branch' }).fill('ux32-branch')
  await worktrees.getByRole('textbox', { name: 'Worktree path' }).fill(worktreePath)
  await injectFailure('worktree:create'); await create.click()
  await worktrees.getByRole('alert').getByText(/UX32 rejected/).waitFor(); assert(await create.isEnabled())
  // No real worktree mutation: expose a nonexistent row only to exercise a rejected IPC response.
  assert(!fs.existsSync(worktreePath))
  await app.evaluate(({ ipcMain }, fakePath) => {
    const original = ipcMain._invokeHandlers.get('worktree:list')
    ipcMain.removeHandler('worktree:list'); ipcMain.handle('worktree:list', async (...args) => {
      ipcMain.removeHandler('worktree:list'); ipcMain.handle('worktree:list', original)
      const result = await original(...args)
      return { ...result, data: [...result.data, { path: fakePath, branch: 'unavailable', head: null }] }
    })
  }, worktreePath)
  await worktrees.getByRole('button', { name: 'Retry worktree list' }).click()
  await worktrees.getByText(worktreePath, { exact: true }).waitFor()
  await injectFailure('worktree:remove'); page.once('dialog', dialog => dialog.accept())
  await worktrees.getByRole('button', { name: 'Remove', exact: true }).click()
  await worktrees.getByRole('alert').getByText(/UX32 rejected/).waitFor()
  assert(await worktrees.getByRole('button', { name: 'Remove', exact: true }).isEnabled())
  assert(!fs.existsSync(worktreePath))
  await page.keyboard.press('Escape'); await worktrees.waitFor({ state: 'detached' })
  // A closed/reopened dialog must reject an earlier list response, even for the same owner.
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('worktree:list'); let first = true
    ipcMain.removeHandler('worktree:list'); ipcMain.handle('worktree:list', async (...args) => {
      if (!first) return original(...args)
      first = false; const result = await original(...args)
      await new Promise(resolve => { globalThis.ux32ReleaseList = resolve })
      return { ...result, data: [...result.data, { path: 'UX32 stale response', branch: 'stale', head: null }] }
    }); globalThis.ux32OriginalList = original
  })
  await openWorktrees()
  await app.evaluate(async () => { for (let n=0; n<100 && !globalThis.ux32ReleaseList; n++) await new Promise(resolve => setTimeout(resolve,20)); if (!globalThis.ux32ReleaseList) throw new Error('List was not held') })
  await page.keyboard.press('Escape'); await openWorktrees(); await create.waitFor()
  await app.evaluate(({ ipcMain }) => { globalThis.ux32ReleaseList(); ipcMain.removeHandler('worktree:list'); ipcMain.handle('worktree:list',globalThis.ux32OriginalList); delete globalThis.ux32OriginalList; delete globalThis.ux32ReleaseList })
  await frames(); assert.equal(await worktrees.getByText('UX32 stale response').count(),0)
  await page.keyboard.press('Escape'); assert(await input.evaluate(node => document.activeElement === node || document.activeElement?.getAttribute('aria-label') === 'Task context'))
  // Exercise successful UI responses only; no worktree filesystem operation runs.
  await app.evaluate(({ ipcMain }, fakePath) => {
    const originals = Object.fromEntries(['worktree:list', 'worktree:create', 'worktree:remove'].map(channel => [channel, ipcMain._invokeHandlers.get(channel)]))
    let created = false
    for (const channel of Object.keys(originals)) ipcMain.removeHandler(channel)
    ipcMain.handle('worktree:list', async (...args) => {
      const result = await originals['worktree:list'](...args)
      return { ...result, data: created ? [...result.data, { path: fakePath, branch: 'ux32-ui-only', head: null }] : result.data }
    })
    ipcMain.handle('worktree:create', async () => { created = true; return { success: true, data: { path: fakePath, branch: 'ux32-ui-only' } } })
    ipcMain.handle('worktree:remove', async () => { created = false; return { success: true } })
    globalThis.ux32WorktreeHandlers = originals
  }, worktreePath)
  await openWorktrees()
  await worktrees.getByRole('textbox', { name: 'Worktree branch' }).fill('ux32-ui-only')
  await worktrees.getByRole('textbox', { name: 'Worktree path' }).fill(worktreePath)
  await injectFailure('conversation:create'); page.once('dialog', dialog => dialog.accept())
  await create.click()
  await worktrees.getByRole('alert').getByText(/UX32 rejected conversation:create/).waitFor()
  await worktrees.getByText(worktreePath, { exact: true }).waitFor()
  assert(await create.isEnabled()); assert.equal(await worktrees.getByRole('textbox', { name: 'Worktree branch' }).inputValue(), '')
  assert(!fs.existsSync(worktreePath))
  page.once('dialog', dialog => dialog.accept())
  await worktrees.getByRole('button', { name: 'Remove', exact: true }).click()
  await worktrees.getByText(worktreePath, { exact: true }).waitFor({ state: 'detached' })
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Create worktree')?.disabled)
  assert(!fs.existsSync(worktreePath))
  await page.keyboard.press('Escape')
  await app.evaluate(({ ipcMain }) => {
    for (const [channel, handler] of Object.entries(globalThis.ux32WorktreeHandlers)) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler) }
    delete globalThis.ux32WorktreeHandlers
  })
  // Real browser address editing must not cancel the owning local provider stream.
  const tab = await page.evaluate(async ownerId => (await window.api.browser.newTab({ ownerId, url: 'about:blank' })).data.id, ids[39])
  await input.fill('UX32 browser Escape ownership'); await page.getByRole('button', { name: 'Send', exact: true }).click()
  const stop = page.getByRole('button', { name: 'Stop current turn', exact: true }); await stop.waitFor()
  await input.focus(); await page.keyboard.press('Control+t')
  const address = page.getByPlaceholder('Search Google or type a URL'); await address.fill('unsent.invalid/draft'); await address.press('Escape')
  assert(await stop.isVisible()); assert.notEqual(await address.inputValue(),'unsent.invalid/draft')
  await page.getByRole('button', { name: 'Collapse panel', exact: true }).click()
  await input.focus(); await page.keyboard.press('Escape'); await stop.waitFor({ state: 'detached' })
  await page.evaluate(id => window.api.browser.closeTab({ id }), tab)
  const layouts = []
  const geometry = async (locator, name) => {
    const result = await locator.evaluate(node => {
      const box = node.getBoundingClientRect(); let clipped = false
      for (let parent=node.parentElement; parent; parent=parent.parentElement) {
        const style=getComputedStyle(parent), bounds=parent.getBoundingClientRect()
        if (['auto','scroll','hidden','clip'].includes(style.overflowY) && (box.top<bounds.top-1 || box.bottom>bounds.bottom+1)) clipped=true
      }
      return { x:box.x,y:box.y,right:box.right,bottom:box.bottom,width:box.width,height:box.height,viewWidth:window.innerWidth,viewHeight:window.innerHeight,clipped }
    })
    assert(result.x>=0 && result.y>=0 && result.right<=result.viewWidth+1 && result.bottom<=result.viewHeight+1 && !result.clipped, `${name} ${JSON.stringify(result)}`)
    return result
  }
  const resize = async (width,height,zoom) => {
    await app.evaluate(({ BrowserWindow }, data) => { const win=BrowserWindow.getAllWindows()[0]; win.setMinimumSize(400,300); win.setContentSize(data.width,data.height); win.webContents.setZoomFactor(data.zoom) }, {width,height,zoom})
    await frames()
    for (const [name,close] of [['Workspace panel','Collapse panel'],['Navigation','Collapse sidebar']]) { const dialog=page.getByRole('dialog',{name,exact:true}); if(await dialog.isVisible()) { await trap(dialog); await dialog.getByRole('button',{name:close,exact:true}).click() } }
  }
  for (const theme of ['Light','Dark']) {
    await resize(1440,900,1); await input.focus(); await page.keyboard.press('Control+,')
    const settings=page.getByRole('dialog',{name:'Settings',exact:true})
    await settings.getByRole('button',{name:'Appearance',exact:true}).click(); await settings.getByRole('button',{name:theme,exact:true}).click(); await page.keyboard.press('Escape')
    for (const [width,height] of [[1440,900],[1024,768],[800,600],[1920,1080]]) for(const zoom of [1,1.5,2]) {
      await resize(width,height,zoom); await input.fill('UX32 matrix draft')
      const idle=await geometry(input,'idle composer')
      const compact=page.getByRole('button',{name:'Menu',exact:true})
      if(await compact.isVisible()) { await geometry(compact,'title menu'); await compact.focus(); await page.keyboard.press('ArrowDown'); const menu=page.getByRole('menu',{name:'Menu menu',exact:true}); await menu.waitFor(); await page.keyboard.press('Escape'); assert(await compact.evaluate(node=>document.activeElement===node)) }
      await input.focus(); await page.keyboard.press('Control+Shift+g')
      const drawer=page.getByRole('dialog',{name:'Workspace panel',exact:true})
      if(await drawer.isVisible()) { await trap(drawer); await page.keyboard.press('Escape'); await drawer.waitFor({state:'detached'}) }
      else await page.getByRole('button',{name:'Collapse panel',exact:true}).click()
      await geometry(input,'post-review composer')
      await page.getByRole('button',{name:'Send',exact:true}).click(); await stop.waitFor()
      assert.equal(await page.locator('[role="status"][data-task-status]').count(),1)
      assert.equal(await page.locator('[role="status"][aria-label="Lamprey status line"]').count(),0)
      const running=await geometry(stop,'Stop'); assert(running.width>=32 && running.height>=32)
      await stop.click(); await stop.waitFor({state:'detached'})
      layouts.push({theme,width,height,zoom,idle,running})
    }
  }
  await resize(800,600,2); await input.focus(); await page.keyboard.press('Control+,')
  const settings=page.getByRole('dialog',{name:'Settings',exact:true})
  const sections=await settings.getByRole('combobox',{name:'Settings section',exact:true}).locator('option').evaluateAll(nodes=>nodes.map(node=>({id:node.value,label:node.textContent})))
  assert.equal(sections.length,24)
  const settingsChecks=[]
  for(const section of sections) {
    await settings.getByRole('combobox',{name:'Settings section',exact:true}).selectOption(section.id)
    await settings.getByRole('tabpanel',{name:section.label,exact:true}).waitFor()
    await geometry(settings.getByRole('button',{name:'Close settings',exact:true}),'settings close')
    const dimensions=await settings.getByRole('tabpanel').evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}))
    assert(dimensions.scroll <= dimensions.client + 1, `${section.label} overflow: ${JSON.stringify(dimensions)}`)
    if (['hooks','models','api','appearance','permissions','library','persistence'].includes(section.id)) {
      const bytes=await app.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG()))
      fs.writeFileSync(path.join(output,`compact-${section.id}.png`),Buffer.from(bytes))
    }
    settingsChecks.push({...section,...dimensions})
  }
  await trap(settings)
  const bytes=await app.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG()))
  fs.writeFileSync(path.join(output,'compact-settings.png'),Buffer.from(bytes))
  await page.keyboard.press('Escape'); await resize(1440,900,1)
  return { worktreeFocusCount, worktreeMutationsNotRun: 'Automatic approval review rejected temporary worktree create/remove. This run uses actual read-only listing and controlled rejected IPC calls; no worktree is created or removed.', worktreeUiOnlySuccess: { createSuccessTaskFailureRefresh: true, removeSuccessRefresh: true, filesystemMutation: false }, worktreeRejectedOperations:true, staleListRejected:true, browserEscapeOwnership:true, layouts, settingsChecks, manualAssistiveTechnology:'Not performed; automated focus, DOM semantics and actual-app geometry are not a screen-reader listening test.' }
}
