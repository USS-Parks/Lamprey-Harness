/* global document, window */
const { chromium } = require('playwright')
const { pathToFileURL } = require('node:url')
const { join } = require('node:path')
const { writeFileSync, readFileSync, existsSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const script = readFileSync(join(__dirname,'app.js'),'utf8')
  const contract = JSON.parse(readFileSync(join(__dirname,'../evidence/ux-simplification/UX01.json'),'utf8'))
  const ids = block => [...block.matchAll(/\['([^']+)','[^']+','[^']+'\]/g)].map(match => match[1]).sort()
  assert.deepEqual(ids(script.split('const settings = [')[1].split('\n]')[0]),[...contract.settingsIds].sort())
  assert.deepEqual(ids(script.split('const tools = [')[1].split('\n]')[0]),[...contract.toolIds].sort())
  const readme = readFileSync(join(__dirname,'README.md'),'utf8')
  for (const match of readme.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1].split(/[?#]/)[0]
    assert(existsSync(join(__dirname,decodeURIComponent(href))),`Missing design link: ${href}`)
  }
  const browser = await chromium.launch({ channel:'chrome', headless:true })
  try {
    const page = await browser.newPage()
    const errors = []
    const requests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()) })
    const observations = []
    for (const width of [1440,800]) {
      await page.setViewportSize({width,height:width===800?600:900})
      for (const state of ['idle','running','review']) {
        await page.goto(pathToFileURL(join(__dirname,'index.html')).href+`?state=${state}`)
        await page.locator('#prompt').waitFor()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>window.innerWidth),false)
        assert(await page.locator('#prompt').isVisible())
        if (state==='running') assert(await page.locator('#stop').isVisible())
        await page.screenshot({path:join(__dirname,`${state}-${width}.png`),fullPage:true})
        observations.push({width,state,promptVisible:true,stopVisible:state==='running',horizontalOverflow:false})
      }
    }
    await page.setViewportSize({width:1440,height:900})
    await page.goto(pathToFileURL(join(__dirname,'index.html')).href+'?state=running')
    await page.locator('.artifact-link[data-action="Open file"]').click()
    assert(await page.locator('#workspace').isVisible())
    assert.equal(await page.locator('#dialog').isVisible(),false)
    await page.locator('#close-workspace').click()
    await page.locator('#send-menu').click()
    await page.screenshot({path:join(__dirname,'queue-menu-1440.png'),fullPage:true})
    await page.getByRole('button',{name:'Queue next',exact:true}).click()
    assert.equal(await page.locator('#send').textContent(),'Queue')
    await page.locator('#prompt').fill('A review-only draft')
    await page.locator('#send').click()
    assert.equal(await page.locator('#prompt').inputValue(),'A review-only draft')
    await page.locator('#changes').click()
    await page.locator('[data-resource="review"]').focus()
    await page.keyboard.press('ArrowLeft')
    assert.equal(await page.locator('[data-resource="file"]').getAttribute('aria-selected'),'true')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.locator('[data-resource="review"]').getAttribute('aria-selected'),'true')
    await page.getByRole('button',{name:'Fix this →',exact:true}).first().click()
    assert((await page.locator('#prompt').inputValue()).includes('ChatInput.tsx'))
    assert(await page.locator('#workspace').isVisible())
    await page.locator('#terminal-toggle').click()
    assert(await page.locator('#terminal').isVisible())
    await page.screenshot({path:join(__dirname,'review-with-terminal-1440.png'),fullPage:true})
    await page.locator('#hide-terminal').click()
    assert.equal(await page.locator('#terminal').isVisible(),false)
    await page.locator('#settings').click()
    assert.equal(await page.locator('[data-group]').count(),6)
    for (let i=0;i<12;i++) {
      await page.keyboard.press('Tab')
      assert(await page.evaluate(() => document.querySelector('#dialog').contains(document.activeElement)))
    }
    await page.screenshot({path:join(__dirname,'settings-1440.png'),fullPage:true})
    for (const alias of ['RAG','Snip','Seed Budget','Reasoning Audit']) {
      await page.locator('#settings-search').fill(alias)
      assert.equal(await page.locator('[data-setting]').count(),1)
    }
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => document.activeElement.id),'settings')
    await page.locator('#commands').click()
    await page.screenshot({path:join(__dirname,'commands-1440.png'),fullPage:true})
    for (const label of ['Files','Side chat','Browser','Review','Terminal','Environment','Sources','Artifacts','Plan','Background tasks','After action','Loops','Agents','Workflow library','Memory']) {
      assert(await page.locator(`[data-command="${label}"]`).count()>=1,label)
    }
    await page.keyboard.press('Escape')
    await page.locator('#theme').click()
    await page.screenshot({path:join(__dirname,'running-light-1440.png'),fullPage:true})
    assert.deepEqual(errors,[])
    assert.deepEqual(requests,[])
    writeFileSync(join(__dirname,'review-check.json'),JSON.stringify({checkedAt:new Date().toISOString(),status:'mockup-checks-passed',productAcceptance:false,observations,checks:['Steer/Queue menu changes visible preference','Submit retains demonstration draft and sends no request','Hunk action seeds draft without closing review','Terminal hide/show','Six settings groups and old-name search aliases','Escape restores opener focus','All 13 tools plus workflows and Memory in commands','No page errors or HTTP requests'],limitations:['Static design fixture only; real Electron behavior is not implemented here.','1440x900 and 800x600 checked here; full G4 product acceptance remains required.','Design approval is still pending.']},null,2)+'\n')
    console.log('Mockup checks passed; design approval remains pending.')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode=1 })
