/* global window, document */
const { build } = require('esbuild')
const { createServer } = require('node:http')
const { chromium } = require('playwright')
const assert = require('node:assert/strict')

async function main() {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {BrowserPanel} from './src/components/tools/panels/BrowserPanel';
    const listeners={updated:new Set(),closed:new Set(),active:new Set()};window.listeners=listeners;window.visible=[];window.requests=[];window.outside=0;listeners.updated.add(()=>window.outside++);
    const subscribe=name=>cb=>{listeners[name].add(cb);return()=>listeners[name].delete(cb)};
    window.api={browser:{onTabUpdated:subscribe('updated'),onTabClosed:subscribe('closed'),onActiveTab:subscribe('active'),offAll:()=>{throw Error('bulk removal forbidden')},listTabs:()=>new Promise(resolve=>window.finishList=resolve),newTab:async()=>({success:true}),setVisible:async value=>{window.visible.push(value.visible);return{success:true}},setBounds:async()=>({success:true}),developerStatus:args=>new Promise((resolve,reject)=>window.requests.push({id:args?.id,resolve,reject}))}};
    const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(<BrowserPanel/>));window.unmount=()=>flushSync(()=>root.unmount());
  ` }, bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/fixture.js"></script>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const mode of ['unmount', 'polling']) {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await page.waitForFunction(() => !!window.finishList)
      if (mode === 'unmount') await page.evaluate(() => window.unmount())
      await page.evaluate(() => window.finishList({ success: true, data: { tabs: [{ id: 'a', title: 'A', url: 'https://a.example', loading: false }, { id: 'b', title: 'B', url: 'https://b.example', loading: false }], activeTabId: 'a' } }))
      if (mode === 'unmount') {
        assert.deepEqual(await page.evaluate(() => window.visible), [false])
      } else {
        await page.waitForFunction(() => window.visible.includes(true))
        await page.getByRole('button', { name: 'Dev', exact: true }).click()
        await page.waitForFunction(() => window.requests.some(r => r.id === 'a'))
        await page.evaluate(() => window.listeners.active.forEach(cb => cb({ id: 'b' })))
        await page.waitForFunction(() => window.requests.some(r => r.id === 'b'))
        await page.evaluate(() => {
          const status = id => ({ success: true, data: { enabled: false, tabId: id, url: 'https://' + id + '.example', siteDecision: 'ask', session: null, observation: null, evidence: [] } })
          window.requests.find(r => r.id === 'b').resolve(status('b'))
          window.requests.find(r => r.id === 'a').resolve(status('a'))
        })
        await page.getByText('Target: b', { exact: true }).waitFor()
        await page.waitForFunction(() => window.requests.length >= 3)
        await page.evaluate(() => window.requests.at(-1).reject(Error('fixture polling failure')))
        await page.getByText('Error: fixture polling failure', { exact: true }).waitFor()
        await page.evaluate(() => window.unmount())
        assert.equal(await page.evaluate(() => window.visible.at(-1)), false)
      }
      assert.deepEqual(await page.evaluate(() => Object.values(window.listeners).map(set => set.size)), [1, 0, 0])
      await page.evaluate(() => window.listeners.updated.forEach(cb => cb({ id: 'outside' })))
      assert.equal(await page.evaluate(() => window.outside), 1)
      assert.deepEqual(errors, [])
      console.log(`Browser ${mode}: delayed work guarded, owned subscriptions removed, no unhandled rejection`)
      await page.close()
    }
  } finally {
    await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
