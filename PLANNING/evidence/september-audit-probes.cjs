// Audit-only probes of actual source with inert dependency fixtures. No app data or network.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const ref = process.argv[2]
function load(rel, mocks = {}) {
  const file = path.join(root, rel)
  const source = ref ? execFileSync('git',['show',`${ref}:${rel}`],{cwd:root,encoding:'utf8'}) : fs.readFileSync(file,'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const module = { exports: {} }
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('.')) throw new Error(`Unmocked dependency ${name} in ${rel}`)
    return require(name)
  }
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(localRequire, module, module.exports)
  return module.exports
}
async function main() {
  const results = []
  const controller = new AbortController()
  const calls = []
  const descriptor = { id:'fixture__write', name:'fixture__write', inputSchema:{type:'object'}, risks:[], mutates:true }
  let unknown = false
  let plan = false
  const dispatch = load('electron/services/chat-tool-dispatch.ts', {
    './conversation-store': {isPlanModeActive:()=>plan},
    './hooks-runner': {fireHooks:async()=>({blocked:false})},
    './mcp-manager': {mcpManager:{callTool:async(...args)=>{calls.push({args,aborted:controller.signal.aborted}); controller.abort(); return 'ok'}}},
    './tool-registry': {toolRegistry:{getById:()=>unknown?undefined:descriptor,recordCallStart(){},recordCallEnd(){},hasHandler:()=>false},isMutatingDescriptor:d=>d?d.mutates:false},
    './model-tool-surface': {TOOL_SEARCH_TOOL_NAME:'tool_search'},
    './tool-unlock-state': {},
    './tool-call-windowing': {partitionToolCallWindows:xs=>xs.map((_,index)=>({kind:'serial',index}))},
    './permissions-store': {descriptorNeedsApproval:()=>false},
    './agent-run-phase': {inferPhaseFromDescriptor:()=> 'tools'},
    './tool-result-status': {classifyToolResult:()=> 'done'},
    './tool-schema-validator': {validateToolArguments:(_n,args)=>({valid:true,parsed:args})},
    './empty-params-guard': {detectEmptyParams:()=>({isEmpty:false})},
    './dangerous-command-policy': {}, './native-dispatch': {},
    './chat-events': {emitChatEvent(){}}, './debug-trace': {trace(){}}
  })
  const call = id => ({id,function:{name:'fixture__write',arguments:'{}'}})
  await dispatch.resolveToolCallWindows([call('a'),call('b')],'fixture-conversation','model','fixture-workspace',controller.signal)
  results.push({finding:'SA-01',probe:'abort after first serial MCP operation',operations:calls.map(c=>({startedAfterAbort:c.aborted})),observed: calls.length===2 && calls[1].aborted})
  calls.length=0; unknown=true; plan=true
  await dispatch.resolveSingleToolCall(call('unknown'),'fixture-conversation','model','fixture-workspace',new AbortController().signal)
  results.push({finding:'SA-02',probe:'unknown descriptor in plan mode',forwardedToMcp:calls.length,observed:calls.length===1})
  try {
    await dispatch.resolveSingleToolCall({id:'null',function:{name:'tool_search',arguments:'null'}},'fixture','model','fixture',new AbortController().signal)
    results.push({finding:'SA-15',probe:'null tool_search',observed:false})
  } catch(e) { results.push({finding:'SA-15',probe:'null tool_search',error:e.message,observed:true}) }
  const rows = [
    {id:'assistant',role:'assistant',content:'a'.repeat(100),tool_calls:'[{"id":"one"},{"id":"two"}]'},
    {id:'one',role:'tool',content:'one'}, {id:'two',role:'tool',content:'two'}
  ].map((r,i)=>({...r,conversation_id:'fixture',created_at:i,compressed_into:null,reasoning:null}))
  const compressor = load('electron/services/context-compressor.ts', {
    './database':{getDb:()=>({prepare:()=>({all:()=>rows})})}, './event-log':{recordEvent(){}}
  })
  const selection = compressor.selectMessagesToCompress('fixture',10,0.4)
  results.push({finding:'SA-07',probe:'compression boundary with two tool results',selected:selection.map(r=>r.id),surviving:rows.filter(r=>!selection.includes(r)).map(r=>r.id),observed:selection.length===2})
  const normalize = load('electron/services/providers/schema-normalizer.ts', {'../core-tool-names':{CORE_NORMALIZE_NAMES:[]}})
  const normalized=normalize.normalizeToolsForProvider([{name:'fixture',description:'fixture',inputSchema:{type:'object',properties:{if:{type:'string'},not:{type:'string'},normal:{type:'string'}},required:['if']}}],'fixture')
  const properties=Object.keys(normalized.tools[0].function.parameters.properties)
  results.push({finding:'SA-09',probe:'legal property names matching schema keywords',properties,required:normalized.tools[0].function.parameters.required,observed:!properties.includes('if')})
  const moves=[]
  const backup=load('electron/services/backup-runner.ts', {
    'better-sqlite3': class { constructor(){throw new Error('fixture: invalid SQLite file')} },
    electron:{app:{}}, fs:{existsSync:()=>true,renameSync:(a,b)=>moves.push([a,b])},
    './database':{}, './event-log':{recordEvent(){}}
  })
  try {await backup.restoreFromBackup('fixture/lamprey.db','outside/lamprey-2026-09-05.db')}
  catch(e){ results.push({finding:'SA-06',probe:'invalid restore source',movesBeforeValidationFailure:moves.length,error:e.message,observed:moves.length===3}) }
  const synth=load('electron/services/research/synthesizer.ts', {
    '../providers/registry':{}, './adapter-cascade':{readDeepResearchSettings:()=>({})}, './slugify':{slugify:()=> 'fixture'}
  })
  const report=await synth.synthesizeReport({question:'fixture',claimSet:{accepted:[],singleSource:[],disputed:[]},sources:[{n:1,title:'Fixture',registrableDomain:'example.test',url:'https://example.test'}],accessedAt:'2026-09-05'}, {callLlm:async()=> 'Unsupported assertion without any citation.'})
  results.push({finding:'SA-24',probe:'uncited research output',citedSources:report.citedSources.length,accepted:!!report.markdown,observed:report.citedSources.length===0})
  if(ref) {
    const ipc = load('electron/services/shell-ipc.ts')
    let fail
    const pending=new Promise((_,reject)=>{fail=reject})
    pending.catch(()=>{})
    const reply=ipc.openExternalReply('https://example.test',()=>{void pending})
    fail(new Error('fixture OS open failure'))
    results.push({finding:'SA-25',probe:'OS open rejects after immediate IPC success',reply,observed:reply.success===true})
    let forwarded=0
    const handlers={}
    const files=load('electron/ipc/files.ts',{
      electron:{ipcMain:{handle:(name,handler)=>{handlers[name]=handler}}},
      '../services/file-handler':{processFiles:async()=>{forwarded++;return[]}},
      '../services/workspace-state':{getActiveWorkspace:()=>path.resolve(root,'fixture-project')}
    })
    files.registerFilesHandlers()
    const drop=await handlers['files:process']({},[path.resolve(root,'fixture-outside','example.txt')])
    results.push({finding:'SA-26',probe:'outside workspace dropped path',reply:drop,forwarded,observed:!drop.success && forwarded===0})
  }
  fs.writeFileSync(path.join(__dirname,ref?'september-audit-probes-upstream.json':'september-audit-probes.json'),JSON.stringify(results,null,2)+'\n')
  console.log(JSON.stringify(results,null,2))
  if(results.some(r=>!r.observed)) process.exitCode=1
}
main().catch(e=>{console.error(e);process.exitCode=1})
