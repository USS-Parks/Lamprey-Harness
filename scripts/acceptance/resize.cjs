/* global window, document, MouseEvent */ // Browser callbacks.
const { build } = require('esbuild')
const { createServer } = require('node:http')
const { chromium } = require('playwright')
const assert = require('node:assert/strict')

async function main() {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {useResizeDrag} from './src/hooks/useResizeDrag';
    function Fixture(){const [width,setWidth]=useState(200);const {dragging,onResizeStart}=useResizeDrag(width,(value)=>{window.moves++;setWidth(value)},{min:100,max:400});return <button onMouseDown={onResizeStart} data-width={width} data-dragging={dragging}>Resize</button>}
    window.moves=0;const root=createRoot(document.getElementById('root'));flushSync(()=>root.render(<Fixture/>));window.unmount=()=>flushSync(()=>root.unmount());
  ` }, bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"' } })
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/fixture.js"></script>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const end of ['mouseup', 'blur', 'pointercancel', 'unmount']) {
      const page = await browser.newPage()
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await page.evaluate(() => { document.body.style.cursor = 'crosshair' })
      await page.getByRole('button', { name: 'Resize' }).dispatchEvent('mousedown', { clientX: 100 })
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 })))
      await page.waitForFunction(() => document.querySelector('button').dataset.width === '250')
      assert.equal(await page.evaluate(() => document.body.style.cursor), 'col-resize')
      await page.evaluate((end) => {
        if (end === 'unmount') window.unmount()
        else (end === 'blur' ? window : document).dispatchEvent(new Event(end))
      }, end)
      assert.equal(await page.evaluate(() => document.body.style.cursor), 'crosshair')
      const before = await page.evaluate(() => window.moves)
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 })))
      assert.equal(await page.evaluate(() => window.moves), before)
      if (end !== 'unmount') {
        await page.waitForFunction(() => document.querySelector('button').dataset.dragging === 'false')
        await page.getByRole('button', { name: 'Resize' }).dispatchEvent('mousedown', { clientX: 100 })
        await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { clientX: 1000 })))
        await page.waitForFunction(() => document.querySelector('button').dataset.width === '400')
        await page.evaluate(() => document.dispatchEvent(new Event('mouseup')))
      }
      console.log(`Resize ${end}: cursor restored, listener detached, width clamped`)
      await page.close()
    }
  } finally {
    await browser.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
