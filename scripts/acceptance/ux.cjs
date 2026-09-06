/* global window, document, requestAnimationFrame, MutationObserver, getComputedStyle */
const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createServer } = require('node:http')
const { execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')

async function main() {
  const root = path.resolve(__dirname, '../..')
  const outputArgument = process.argv[2]
  if (!outputArgument) throw new Error('Usage: node scripts/acceptance/ux.cjs <new evidence directory> [--fail-after-launch]')
  const output = path.resolve(root, outputArgument)
  const relative = path.relative(root, output)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Evidence must stay inside the checkout')
  fs.mkdirSync(output, { recursive: false })
  const scenarios = require('./ux-scenarios.json')
  const completed = []
  const record = id => { assert(scenarios.some(scenario => scenario.id === id)); completed.push(id) }
  const lifecycle = { profile: null, profileRemoved: false, serverClosed: false, passed: false }
  fs.writeFileSync(path.join(output, 'SCENARIOS.json'), JSON.stringify(scenarios, null, 2) + '\n')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lamprey-ux-acceptance-'))
  lifecycle.profile = profile
  const repo = path.join(profile, 'fixture-repo')
  let app
  let server
  try {
    fs.mkdirSync(repo)
    fs.writeFileSync(path.join(repo, 'example.txt'), 'Before review\n')
    for (const args of [['init'], ['add', '.'], ['-c', 'user.name=UX Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', 'Fixture baseline']]) execFileSync('git', args, { cwd: repo })
    fs.writeFileSync(path.join(repo, 'example.txt'), 'After review\n')
    fs.writeFileSync(path.join(profile, 'mcp-servers.json'), JSON.stringify([{ id: 'node-repl', name: 'Node REPL', transport: 'stdio', command: process.execPath, auth: 'none', enabled: false }]))
    const plugins = Object.fromEntries(fs.readdirSync(path.join(root, 'resources/plugins'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => [JSON.parse(fs.readFileSync(path.join(root, 'resources/plugins', e.name, 'plugin.json'))).id, false]))
    fs.writeFileSync(path.join(profile, 'plugins.json'), JSON.stringify(plugins))
    let requests = 0
    server = createServer((req, res) => {
      if (req.url !== '/v1/chat/completions') { res.writeHead(404); res.end(); return }
      requests++
      req.resume()
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = () => res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Measured local stream. ' }, finish_reason: null }] })}\n\n`)
      send()
      const timer = setInterval(send, 100)
      res.on('close', () => clearInterval(timer))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ defaultModel: 'fixture-stream', toolSurface: 'full', orchestrationEnabled: false, customProviders: [{ id: 'fixture-provider', baseURL: `http://127.0.0.1:${server.address().port}/v1`, requiresKey: false }], customModels: [{ id: 'fixture-stream', name: 'Fixture', provider: 'fixture-provider', contextWindow: 131072, supportsTools: false }] }))
    const env = { ...process.env, LAMPREY_ACCEPTANCE_PROFILE: profile }
    delete env.ELECTRON_RUN_AS_NODE
    const entry = path.join(profile, 'baseline-entry.cjs')
    fs.writeFileSync(entry, `globalThis.uxRequire = require; globalThis.uxShowInactive = require('electron').BrowserWindow.prototype.showInactive; require(${JSON.stringify(path.join(root, 'scripts/acceptance/electron-fixture.cjs'))})`)
    app = await _electron.launch({ args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion', entry], env, cwd: repo })
    if (process.argv.includes('--fail-after-launch')) throw new Error('Intentional fixture failure to verify cleanup and nonzero exit')
    const page = await app.firstWindow()
    page.setDefaultTimeout(15000)
    await page.waitForFunction(() => !!window.api?.conversation)
    await page.getByTitle('Switch model', { exact: true }).waitFor()
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.setBackgroundThrottling(false)
      win.setContentSize(1440, 900)
      globalThis.uxShowInactive.call(win)
    })
    const ids = await page.evaluate(async () => {
      const ids = []
      for (let i = 0; i < 50; i++) {
        const result = await window.api.conversation.create('fixture-stream', { kind: 'local' })
        if (!result.success) throw new Error(result.error)
        const id = result.data.id
        await window.api.conversation.updateTitle(id, `UX baseline task ${String(i).padStart(2, '0')}`)
        ids.push(id)
      }
      return ids
    })
    const seeded = await app.evaluate(({ app }, { root, ids, profile }) => {
      if (app.getPath('userData') !== profile) throw new Error('Profile isolation failed')
      const Database = globalThis.uxRequire(globalThis.uxRequire('node:path').join(root, 'node_modules/better-sqlite3'))
      const db = new Database(globalThis.uxRequire('node:path').join(profile, 'lamprey.db'))
      const now = Date.now() - 1000000
      db.transaction(() => {
        const msg = db.prepare('INSERT INTO messages (id,conversation_id,role,content,model,created_at) VALUES (?,?,?,?,?,?)')
        for (let i = 0; i < 1000; i++) msg.run(`ux-message-${i}`, ids[0], i % 2 ? 'assistant' : 'user', `Baseline message ${i}: inspect the fixture and explain its changes.`, 'fixture-stream', now + i)
        msg.run('ux-alternate-message', ids[1], 'assistant', 'Baseline alternate task ready.', 'fixture-stream', now)
        const tool = db.prepare('INSERT INTO tool_calls (id,tool_id,name,conversation_id,args_json,status,result_preview,started_at,finished_at,duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)')
        for (let i = 0; i < 200; i++) tool.run(`ux-tool-${i}`, 'read_file', 'read_file', ids[0], '{"path":"example.txt"}', 'done', 'Before review', now+i, now+i+1, 1)
        const invocation = db.prepare('UPDATE messages SET role=?,tool_calls=? WHERE id=?')
        const result = db.prepare('UPDATE messages SET role=?,tool_call_id=?,content=? WHERE id=?')
        for (let i = 0; i < 200; i++) {
          invocation.run('assistant', JSON.stringify([{ id:`ux-tool-${i}`, type:'function', function:{name:'read_file', arguments:'{"path":"example.txt"}'} }]), `ux-message-${i*2}`)
          result.run('tool', `ux-tool-${i}`, 'Before review', `ux-message-${i*2+1}`)
        }
      })()
      const counts = { messages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?').get(ids[0]).n, tools: db.prepare('SELECT COUNT(*) AS n FROM tool_calls WHERE conversation_id=?').get(ids[0]).n }
      db.close()
      return counts
    }, { root, ids, profile })
    assert.equal(seeded.messages, 1000)
    assert.equal(seeded.tools, 200)
    await page.reload()
    await page.getByText('UX baseline task 00', { exact: true }).last().click()
    await page.getByText('Baseline message 999: inspect the fixture and explain its changes.', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'IDLE.png') })
    record('idle-history')
    console.log('Idle state captured')
    await page.evaluate(() => {
      window.uxTimings = []
      window.uxLongTasks = []
      document.addEventListener('input', event => {
        if (event.target.tagName !== 'TEXTAREA') return
        const start = performance.now()
        requestAnimationFrame(() => requestAnimationFrame(() => window.uxTimings.push(performance.now() - start)))
      }, true)
      new PerformanceObserver(list => window.uxLongTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: false })
    })
    const input = page.locator('textarea').first()
    await input.pressSequentially('warmup', { delay: 40 })
    await input.fill('')
    console.log('Warm-up complete')
    const runs = []
    const quantile = (values, p) => [...values].sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length*p)-1)]
    const switchTask = async (title, content) => page.evaluate(({ title, content }) => new Promise((resolve, reject) => {
      const matches = [...document.querySelectorAll('span')].filter(e => e.textContent === title)
      const button = matches.at(-1)?.closest('button')
      if (!button) { reject(new Error('Task selector missing')); return }
      const start = performance.now()
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Task rendering timed out')) }, 10000)
      const observer = new MutationObserver(() => {
        if (![...document.querySelectorAll('p')].some(e => e.textContent === content)) return
        observer.disconnect()
        requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(performance.now() - start) }))
      })
      observer.observe(document.body, { childList: true, subtree: true })
      button.click()
    }), { title, content })
    for (let run = 0; run < 5; run++) {
      await page.evaluate(() => { window.uxTimings = [] })
      await input.pressSequentially('Measure composer response now.', { delay: 50 })
      await page.waitForFunction(() => window.uxTimings.length >= 29, undefined, { polling: 50, timeout: 10000 })
      const samples = await page.evaluate(() => window.uxTimings)
      runs.push({ run: run+1, typing: { samples, p50: quantile(samples,.5), p95: quantile(samples,.95) } })
      await input.fill('')
      console.log('Typing run', run+1)
      const switching = []
      for (let repeat = 0; repeat < 2; repeat++) {
        switching.push(await switchTask('UX baseline task 01', 'Baseline alternate task ready.'))
        switching.push(await switchTask('UX baseline task 00', 'Baseline message 999: inspect the fixture and explain its changes.'))
      }
      runs[run].taskSwitch = { samples: switching, p50: quantile(switching,.5), p95: quantile(switching,.95) }
      fs.writeFileSync(path.join(output, 'TIMING_PROGRESS.log'), JSON.stringify({ status: 'incomplete', runs }, null, 2)+'\n')
      console.log('Task switch run', run+1)
    }
    await input.fill('Respond with a local streaming fixture.')
    await input.press('Enter')
    await page.getByRole('button', { name: 'Stop current turn', exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'RUNNING.png') })
    const streamingStart = await page.evaluate(() => performance.now())
    const streamingRuns = []
    for (let run = 0; run < 5; run++) {
      await page.evaluate(() => { window.uxTimings = [] })
      await input.pressSequentially('Steering draft.', { delay: 50 })
      await page.waitForFunction(() => window.uxTimings.length >= 15, undefined, { polling: 50, timeout: 10000 })
      const samples = await page.evaluate(() => window.uxTimings)
      streamingRuns.push({ run:run+1, samples, p50:quantile(samples,.5), p95:quantile(samples,.95) })
      await input.fill('')
    }
    const scrollAnchor = await page.evaluate(async () => {
      const message = [...document.querySelectorAll('p')].find(e => e.textContent.includes('Baseline message 999:'))
      let scroller = message?.parentElement
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1000 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
      if (!scroller) throw new Error('History scroller missing')
      scroller.scrollTop = Math.floor(scroller.scrollHeight / 2)
      const before = scroller.scrollTop
      await new Promise(resolve => setTimeout(resolve, 1200))
      return { before, after:scroller.scrollTop, stable:Math.abs(scroller.scrollTop-before)<=2 }
    })
    const streamingEnd = await page.evaluate(() => performance.now())
    await page.getByRole('button', { name: 'Stop current turn', exact: true }).click()
    assert(requests > 0)
    assert(scrollAnchor.stable)
    record('running-local-stream')
    await page.evaluate(async repo => { const result = await window.api.files.setWorkdir(repo); if (!result.success) throw new Error(result.error) }, repo)
    await page.getByRole('button', { name: 'Expand artifacts panel', exact: true }).click()
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page.getByText('example.txt', { exact: true }).first().click()
    await page.getByText('+After review', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'REVIEW.png') })
    record('review-real-git')
    for (let run = 0; run < 5; run++) {
      const samples = []
      for (let repeat = 0; repeat < 3; repeat++) {
        await page.getByRole('button', { name:'Collapse panel', exact:true }).click()
        samples.push(await page.evaluate(() => new Promise((resolve, reject) => {
          const button = document.querySelector('button[aria-label="Expand artifacts panel"]')
          if (!button) { reject(new Error('Expand control missing')); return }
          const start = performance.now()
          button.click()
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()-start)))
        })))
      }
      runs[run].cachedPanelShell = { samples, p50:quantile(samples,.5), p95:quantile(samples,.95) }
    }
    await page.getByRole('button', { name:'Close tool', exact:true }).click()
    await page.getByRole('button', { name:'Background tasks', exact:true }).click()
    await switchTask('UX baseline task 01', 'Baseline alternate task ready.')
    await switchTask('UX baseline task 00', 'Baseline message 999: inspect the fixture and explain its changes.')
    await page.waitForFunction(() => [...document.querySelectorAll('ul span')].filter(e => e.textContent === 'read_file').length === 200, undefined, {polling:50,timeout:10000})
    const renderedToolEntries = await page.locator('ul').getByText('read_file', { exact:true }).count()
    assert.equal(renderedToolEntries, 200)
    record('task-switch-history')
    record('timing-capture')
    assert.deepEqual(completed.slice().sort(), scenarios.map(scenario => scenario.id).sort())
    console.log('Completed history entries rendered:', renderedToolEntries)
    fs.writeFileSync(path.join(output, 'RUNTIME.json'), JSON.stringify({ capturedAt: new Date().toISOString(), source: execFileSync('git', ['rev-parse','HEAD'], { cwd: root, encoding:'utf8' }).trim(), runtime: await app.evaluate(() => process.versions), platform: { release:os.release(), cpu:os.cpus()[0].model }, viewport: await page.evaluate(() => ({width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio})), presentation:'Visible via showInactive, no keyboard focus requested; background throttling disabled', isolatedProfile: true, seeded, renderedToolEntries, taskCount: ids.length, runs, streamingRuns, scrollAnchor, streamingWindow:{start:streamingStart,end:streamingEnd}, longTasks: await page.evaluate(() => window.uxLongTasks), limitations: ['Typing measures input event to two animation frames, not physical display latency.', 'Cached panel shell opening excludes asynchronous resource loading.', 'Ten simultaneous workspace tabs are unsupported in v0.32.0; measure them after UX-04/05.', 'Browser/terminal lifecycle extensions are tracked by UX-07/08 and UX-33; not claimed by representative cases.'], status: 'representative-cases-passed', completed }, null, 2)+'\n')
    lifecycle.passed = true
    console.log('UX acceptance capture complete.')
  } finally {
    try {
      if (app) {
        const shutdown = setTimeout(() => app.process().kill(), 5000)
        try { await app.close() } finally { clearTimeout(shutdown) }
      }
    } finally {
      if (server) {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
      }
      lifecycle.serverClosed = true
      fs.rmSync(profile, { recursive: true, force: true })
      lifecycle.profileRemoved = !fs.existsSync(profile)
      fs.writeFileSync(path.join(output, 'LIFECYCLE.json'), JSON.stringify(lifecycle, null, 2) + '\n')
      assert(lifecycle.profileRemoved)
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
