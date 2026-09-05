const readline = require('node:readline')
const calls = []
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result })+'\n')
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line)
  if (request.method === 'initialize') {
    setTimeout(() => reply(request.id, { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }), Number(process.env.FIXTURE_INIT_DELAY || 0))
  } else if (request.method === 'tools/list') {
    reply(request.id, { tools: ['first','second','stats'].map(name => ({ name, inputSchema: { type: 'object' } })) })
  } else if (request.method === 'tools/call') {
    const name = request.params.name
    if (name === 'stats') return reply(request.id, { content: [{ type: 'text', text: JSON.stringify(calls) }] })
    calls.push(name)
    if (name === 'first') setTimeout(() => reply(request.id, { content: [{ type: 'text', text: 'first completed' }] }), 150)
    else reply(request.id, { content: [{ type: 'text', text: 'second completed' }] })
  }
})
