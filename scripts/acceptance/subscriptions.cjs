/* global window, document */ // Browser measurement callbacks.
const ts = require('typescript')
const { readFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { createServer } = require('node:http')
const { build } = require('esbuild')
const { chromium } = require('playwright')
const assert = require('node:assert/strict')

const cases = [
  ['Sidebar', 'src/components/layout/Sidebar.tsx', 'useChatStore', 'streamingText', 'conversations'],
  ['GitHubSettings', 'src/components/settings/GitHubSettings.tsx', 'useGitHubStore', 'reposError', 'repos'],
  ['RepositoryPickerDialog', 'src/components/workspace/RepositoryPickerDialog.tsx', 'useGitHubStore', 'loadingStatus', 'repos']
]

// Measure the actual source declarations in isolation, excluding parent/child
// rendering and network effects. This is a subscription render counter, not FPS.
function declarations(source, name, hook) {
  const ast = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const component = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert(component)
  return component.body.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => ts.isCallExpression(decl.initializer) && decl.initializer.expression.getText(ast) === hook)).map((node) => node.getText(ast)).join('\n')
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const results = []
  try {
    for (const [name, path, hook, unrelated, selected] of cases) {
      const row = { component: name }
      for (const version of ['before', 'after']) {
        const source = version === 'before' ? execFileSync('git', ['show', `5b685a7a21f98ad6313744627d5b2408689b52a1:${path}`], { encoding: 'utf8' }) : readFileSync(path, 'utf8')
        const code = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom'; import {create} from 'zustand';
          const ${hook}=create(()=>({conversations:[],activeConversationId:null,status:null,repos:[],loadingStatus:false,loadingRepos:false,reposError:null,selectConversation:()=>{},createConversation:()=>{},deleteConversation:()=>{},refreshStatus:()=>{},refreshRepos:()=>{}}));
          window.renders=0; function Component(){${declarations(source, name, hook)};window.renders++;return React.createElement('output',null,JSON.stringify(${selected}));}
          flushSync(()=>createRoot(document.getElementById('root')).render(React.createElement(Component)));
          window.measure=()=>{const start=window.renders;for(let i=0;i<100;i++)flushSync(()=>${hook}.setState({${unrelated}:i}));const unrelatedRenders=window.renders-start;const next=window.renders;flushSync(()=>${hook}.setState({${selected}:[{id:'selected-change'}]}));return {unrelatedRenders,selectedRenders:window.renders-next,text:document.querySelector('output').textContent};};`
        const bundle = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"' } })
        const server = createServer((request, response) => {
          response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html')
          response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/fixture.js"></script>')
        })
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
        const page = await browser.newPage()
        try {
          await page.goto(`http://127.0.0.1:${server.address().port}`)
          row[version] = await page.evaluate(() => window.measure())
          assert.equal(row[version].selectedRenders, 1)
          assert.match(row[version].text, /selected-change/)
          assert.equal(row[version].unrelatedRenders, version === 'before' ? 100 : 0)
        } finally {
          await page.close()
          server.closeAllConnections()
          await new Promise((resolve) => server.close(resolve))
        }
      }
      results.push(row)
    }
    console.log(JSON.stringify({ measurement: 'React production render counters using extracted source subscriptions and real Zustand; isolated from parent/child effects', results }))
  } finally { await browser.close() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
