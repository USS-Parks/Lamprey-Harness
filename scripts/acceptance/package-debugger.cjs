const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')

// Pause the stock entry point before its first statement. The inert probe app
// exercises this same path before it is used with the real packaged payload.
async function launchIsolated(executable, env, bootstrap) {
  const child = spawn(executable, ['--inspect-brk=0', '--remote-debugging-port=0'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', stderr = '', socket, nextId = 0
  const pending = new Map(), scripts = new Map()
  let resolveNode, resolveBrowser, rejectNode, rejectBrowser
  const nodeReady = new Promise((resolve, reject) => { resolveNode = resolve; rejectNode = reject })
  const browserReady = new Promise((resolve, reject) => { resolveBrowser = resolve; rejectBrowser = reject })
  // A probe may exit without ever creating a browser.
  browserReady.catch(() => {})
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => {
    stderr += chunk
    process.stderr.write(chunk)
    const node = stderr.match(/Debugger listening on (ws:\/\/[^\s]+)/)
    const browser = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
    if (node) resolveNode(node[1])
    if (browser) resolveBrowser(browser[1])
  })
  let exitCode
  const exited = new Promise(resolve => child.once('exit', code => { exitCode = code; resolve(code); rejectNode(new Error('Application exited before inspector startup')); rejectBrowser(new Error('Application exited before browser startup')) }))
  child.once('error', error => { rejectNode(error); rejectBrowser(error) })
  const timeout = promise => Promise.race([promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Packaged debugger startup timed out')), 30000); timer.unref(); promise.finally(() => clearTimeout(timer)).catch(() => {}) })])
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject, method }); socket.send(JSON.stringify({ id, method, params })) })
  try {
    socket = new WebSocket(await timeout(nodeReady))
    await timeout(new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) }))
    socket.addEventListener('close', () => { for (const request of pending.values()) request.reject(new Error('Inspector closed')); pending.clear() })
    let resolveIsolated, rejectIsolated, isolated = false
    const isolation = new Promise((resolve, reject) => { resolveIsolated = resolve; rejectIsolated = reject })
    socket.addEventListener('message', async event => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const request = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) request?.reject(new Error(`${request.method}: ${message.error.message}`))
        else request?.resolve(message.result)
      } else if (message.method === 'Debugger.scriptParsed') scripts.set(message.params.scriptId, message.params.url)
      else if (message.method === 'Debugger.paused') {
        try {
          const frame = message.params.callFrames.find(frame => /(?:out[\\/]main[\\/]index\.js|resources[\\/]app[\\/]index\.cjs)$/.test(frame.url || scripts.get(frame.location.scriptId) || ''))
          if (!isolated && frame) {
            const result = await send('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: `require(${JSON.stringify(bootstrap)}); require('electron').app.getPath('userData')`, returnByValue: true })
            if (result.exceptionDetails) throw new Error('Could not isolate the paused application')
            assert.equal(result.result.value, env.LAMPREY_ACCEPTANCE_PROFILE)
            isolated = true
            resolveIsolated()
          }
          await send('Debugger.resume')
        } catch (error) { rejectIsolated(error) }
      }
    })
    await send('Runtime.enable')
    await send('Debugger.enable')
    await send('Debugger.setBreakpointByUrl', { lineNumber: 0, urlRegex: '(out[\\/]main[\\/]index\\.js|resources[\\/]app[\\/]index\\.cjs)$' })
    await send('Runtime.runIfWaitingForDebugger')
    await timeout(isolation)
    return {
      browserReady: () => timeout(browserReady),
      evaluate: async expression => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true })
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
        return result.result.value
      },
      waitForExit: async () => { socket.close(); const code = await timeout(exited); return { code, output, stderr } },
      close: async () => {
        if (exitCode === undefined) {
          await timeout(send('Runtime.evaluate', { expression: "global.__lampreyPackageQuit()" })).catch(() => {})
          socket.close()
          await timeout(exited).catch(() => { child.kill() })
        } else socket.close()
      }
    }
  } catch (error) {
    socket?.close()
    child.kill()
    throw new Error(`${error.message}\n${stderr.slice(-2000)}`, { cause: error })
  }
}
module.exports = { launchIsolated }
// Authored and reviewed by Basho Parks, copyright 2026
