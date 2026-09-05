/* global window */
const { build } = require('esbuild')
const { createServer } = require('node:http')
const { chromium } = require('playwright')
const assert = require('node:assert/strict')

async function main() {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {useEnvironment} from './src/hooks/useEnvironment';
    window.requests=[];window.removed=0;window.cleared=0;
    window.setInterval=callback=>{window.poll=callback;return 123};window.clearInterval=id=>{if(id===123)window.cleared++};
    window.api={review:{status:()=>new Promise((resolve,reject)=>window.requests.push({resolve,reject})),summary:async()=>({success:true,data:{additions:5,deletions:2}}),onChanged:cb=>{window.changed=cb;return()=>window.removed++}}};
    function Probe(){const state=useEnvironment();window.state=state;return <pre>{JSON.stringify(state)}</pre>}
    const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(<Probe/>));window.unmount=()=>flushSync(()=>root.unmount());
  ` }, bundle: true, write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/fixture.js"></script>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.waitForFunction(() => window.requests.length === 1)
    await page.evaluate(() => window.requests[0].reject(Error('mount failure')))
    await page.waitForFunction(() => window.state.error === 'mount failure' && !window.state.loading)
    await page.evaluate(() => {
      window.good = branch => ({ success: true, data: { branch, files: [{ path: 'a' }], ahead: 1, behind: 0, cwd: '/fixture' } })
      void window.state.refresh()
      window.requests[1].resolve(window.good('main'))
    })
    await page.waitForFunction(() => window.state.snapshot.branch === 'main' && !window.state.error)
    await page.evaluate(() => { window.changed(); window.changed(); window.requests[3].resolve(window.good('new')); window.requests[2].resolve(window.good('old')) })
    await page.waitForFunction(() => window.state.snapshot.branch === 'new' && !window.state.loading)
    await page.evaluate(() => { window.poll(); window.requests[4].resolve({ success: false, error: 'poll failure' }) })
    await page.waitForFunction(() => window.state.error === 'poll failure')
    assert.equal(await page.evaluate(() => window.state.snapshot.branch), 'new')
    await page.evaluate(() => { void window.state.refresh(); window.requests[5].resolve(window.good('recovered')) })
    await page.waitForFunction(() => window.state.snapshot.branch === 'recovered' && !window.state.error)
    await page.evaluate(() => { window.changed(); window.unmount(); window.requests[6].reject(Error('late failure')) })
    await page.waitForTimeout(50)
    assert.deepEqual(await page.evaluate(() => [window.removed, window.cleared]), [1, 1])
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ mountRejectionHandled: true, pollFailurePreservesSnapshot: true, retryRecovers: true, staleResponseIgnored: true, unmountCleanup: true, unhandledErrors: 0 }))
  } finally {
    await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
