/* global window, document, requestAnimationFrame, MutationObserver, getComputedStyle */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const quantile = (values, p) => [...values].sort((a,b) => a-b)[Math.max(0,Math.ceil(values.length*p)-1)]
const distribution = samples => ({samples,p50:quantile(samples,.5),p95:quantile(samples,.95)})
module.exports = async function performanceScenario({page,app,ids,repo,root,output,seeded,trackPid}) {
  const search = page.getByRole('searchbox',{name:'Search tasks',exact:true})
  await search.fill('UX baseline task 00')
  const primary = page.locator(`[data-task-id="${ids[0]}"]`).getByRole('button',{name:/^UX baseline/}).first()
  await primary.click()
  await page.getByText('Baseline message 999: inspect the fixture and explain its changes.',{exact:true}).waitFor()
  const input = page.getByRole('textbox',{name:'Message Lamprey',exact:true})
  const expand = page.getByRole('button',{name:'Expand artifacts panel',exact:true})
  const collapse = page.getByRole('button',{name:'Collapse panel',exact:true})
  const resourceNames = ['Files','Side chat','Browser','Review','Environment','Sources','Artifacts','Plan','Background tasks','After action']
  if(await expand.isVisible()) await expand.click()
  for(const name of resourceNames) {
    await page.getByRole('button',{name:'Add workspace tab',exact:true}).click()
    await page.getByRole('group',{name:'Add workspace resource',exact:true}).getByRole('button',{name,exact:true}).click()
  }
  assert.equal(await page.locator('#workspace-content').locator('..').getByRole('tab').count(),10)
  await page.getByRole('tab',{name:'Review',exact:true}).click()
  await page.getByText('example.txt',{exact:true}).first().click()
  await page.getByText('+After review',{exact:true}).waitFor()
  await collapse.click()
  await page.evaluate(() => {
    window.uxTimings=[];window.uxLongTasks=[]
    document.addEventListener('input',event=>{if(event.target.tagName!=='TEXTAREA')return;const start=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.uxTimings.push(performance.now()-start)))},true)
    new PerformanceObserver(list=>window.uxLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:false})
  })
  const switchTask = async index => {
    await search.fill(`UX baseline task 0${index}`)
    await page.locator(`[data-task-id="${ids[index]}"]`).waitFor()
    return page.evaluate(({id,content})=>new Promise((resolve,reject)=>{
    const button=document.querySelector(`[data-task-id="${id}"] > button[aria-current]`) ?? [...document.querySelectorAll(`[data-task-id="${id}"] button`)].find(node=>node.textContent.includes('UX baseline'))
    if(!button){reject(new Error('Task selector missing'));return}
    const start=performance.now();let feedback=null
    const observer=new MutationObserver(()=>{
      if(feedback===null && ([...document.querySelectorAll('[role="status"]')].some(node=>node.textContent==='Loading task…') || [...document.querySelectorAll('p')].some(node=>node.textContent===content))) {
        feedback='pending';requestAnimationFrame(()=>requestAnimationFrame(()=>{feedback=performance.now()-start}))
      }
      if(![...document.querySelectorAll('p')].some(node=>node.textContent===content))return
      observer.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timeout);resolve({complete:performance.now()-start,feedback:typeof feedback==='number'?feedback:performance.now()-start})}))
    })
    const timeout=setTimeout(()=>{observer.disconnect();reject(new Error('Task render timeout'))},15000)
    observer.observe(document.body,{childList:true,subtree:true});button.click()
  }),{id:ids[index],content:index===0?'Baseline message 999: inspect the fixture and explain its changes.':'Baseline alternate task ready.'})
  }
  await input.pressSequentially('warmup',{delay:40});await input.fill('')
  await switchTask(1);await switchTask(0)
  const runs=[]
  for(let run=0;run<5;run++) {
    await page.evaluate(()=>{window.uxTimings=[]})
    await input.pressSequentially('Measure composer response now.',{delay:50})
    await page.waitForFunction(()=>window.uxTimings.length>=29)
    const typing=distribution(await page.evaluate(()=>window.uxTimings));await input.fill('')
    const switching=[];for(let repeat=0;repeat<2;repeat++){switching.push(await switchTask(1));switching.push(await switchTask(0))}
    runs.push({run:run+1,typing,taskSwitch:distribution(switching.map(x=>x.complete)),taskFeedback:distribution(switching.map(x=>x.feedback))})
    fs.writeFileSync(path.join(output,'PROGRESS.json'),JSON.stringify({status:'incomplete',runs},null,2)+'\n')
  }
  await input.fill('Respond with a local streaming fixture.');await input.press('Enter')
  const stop=page.getByRole('button',{name:'Stop current turn',exact:true});await stop.waitFor()
  const streamingStart=await page.evaluate(()=>performance.now());const streamingRuns=[]
  for(let run=0;run<5;run++) {
    await page.evaluate(()=>{window.uxTimings=[]})
    await input.pressSequentially('Steering draft.',{delay:50});await page.waitForFunction(()=>window.uxTimings.length>=15)
    streamingRuns.push({run:run+1,...distribution(await page.evaluate(()=>window.uxTimings))});await input.fill('')
  }
  const scrollAnchor=await page.evaluate(async()=>{
    const message=[...document.querySelectorAll('p')].find(node=>node.textContent.includes('Baseline message 999:'))
    let scroller=message?.parentElement
    while(scroller && !(scroller.scrollHeight>scroller.clientHeight+1000 && /auto|scroll/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement
    if(!scroller)throw new Error('History scroller missing')
    scroller.scrollTop=Math.floor(scroller.scrollHeight/2);const before=scroller.scrollTop
    await new Promise(resolve=>setTimeout(resolve,1200));return{before,after:scroller.scrollTop,stable:Math.abs(scroller.scrollTop-before)<=2}
  })
  const streamingEnd=await page.evaluate(()=>performance.now());await stop.click();await stop.waitFor({state:'detached'})
  if(await expand.isVisible())await expand.click()
  await page.getByRole('tab',{name:'Review',exact:true}).click()
  for(let run=0;run<5;run++){
    const samples=[]
    for(let repeat=0;repeat<3;repeat++){
      await collapse.click()
      samples.push(await page.evaluate(()=>new Promise((resolve,reject)=>{
        const button=document.querySelector('button[aria-label="Expand artifacts panel"]');if(!button){reject(new Error('Expand missing'));return}
        const start=performance.now();button.click();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)))
      })))
    }
    runs[run].cachedPanelShell=distribution(samples)
  }
  // Profile a separate repetition so sampling overhead cannot change the five timed runs.
  await app.evaluate(async({BrowserWindow})=>{const debug=BrowserWindow.getAllWindows()[0].webContents.debugger;debug.attach('1.3');await debug.sendCommand('Profiler.enable');await debug.sendCommand('Profiler.start')})
  for(let repeat=0;repeat<3;repeat++){await switchTask(1);await switchTask(0)}
  const profile=await app.evaluate(async({BrowserWindow})=>{const debug=BrowserWindow.getAllWindows()[0].webContents.debugger;const data=await debug.sendCommand('Profiler.stop');await debug.sendCommand('Profiler.disable');debug.detach();return data.profile})
  fs.writeFileSync(path.join(output,'TASK_SWITCH.cpuprofile'),JSON.stringify(profile))
  await app.evaluate(async({BrowserWindow})=>{const debug=BrowserWindow.getAllWindows()[0].webContents.debugger;debug.attach('1.3');await debug.sendCommand('Profiler.enable');await debug.sendCommand('Profiler.start')})
  for(let repeat=0;repeat<8;repeat++){await collapse.click();await expand.click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
  const panelProfile=await app.evaluate(async({BrowserWindow})=>{const debug=BrowserWindow.getAllWindows()[0].webContents.debugger;const data=await debug.sendCommand('Profiler.stop');await debug.sendCommand('Profiler.disable');debug.detach();return data.profile})
  fs.writeFileSync(path.join(output,'PANEL_OPEN.cpuprofile'),JSON.stringify(panelProfile))
  await collapse.click();await input.fill('Respond with a local streaming trace fixture.');await input.press('Enter');await stop.waitFor()
  await app.evaluate(async({BrowserWindow})=>{const debug=BrowserWindow.getAllWindows()[0].webContents.debugger;debug.attach('1.3');await debug.sendCommand('Profiler.enable');await debug.sendCommand('Profiler.start')})
  await input.pressSequentially('Separate streaming trace.',{delay:50});await input.fill('')
  const streamProfile=await app.evaluate(async({BrowserWindow})=>{const debug=BrowserWindow.getAllWindows()[0].webContents.debugger;const data=await debug.sendCommand('Profiler.stop');await debug.sendCommand('Profiler.disable');debug.detach();return data.profile})
  fs.writeFileSync(path.join(output,'STREAM_TYPING.cpuprofile'),JSON.stringify(streamProfile))
  await stop.click();await stop.waitFor({state:'detached'});await expand.click()
  const browser=await page.evaluate(async ownerId=>(await window.api.browser.newTab({ownerId,url:'about:blank'})).data.id,ids[0])
  await page.getByRole('tab',{name:'Browser',exact:true}).click()
  await input.focus();await page.keyboard.press('Control+j')
  const dock=page.getByRole('region',{name:'Terminal dock',exact:true})
  await dock.getByRole('status').getByText('Running',{exact:true}).waitFor()
  const terminalId=`lamprey-task:${encodeURIComponent(ids[0])}:powershell`
  const terminal=await page.evaluate(async id=>(await window.api.terminal.snapshot({id})).data,terminalId);trackPid(terminal.pid)
  const nativeViews=()=>app.evaluate(({BrowserWindow,webContents})=>({children:BrowserWindow.getAllWindows()[0].contentView.children.length,contents:webContents.getAllWebContents().length}))
  const before=await nativeViews();const listenerCounts=await page.evaluate(()=>window.uxListenerCounts());const cycles=[]
  for(let cycle=0;cycle<10;cycle++){
    await collapse.click();await expand.click();await dock.getByRole('button',{name:'Hide terminal',exact:true}).click()
    await switchTask(1);await switchTask(0)
    await page.getByRole('tab',{name:'Browser',exact:true}).click();await input.focus();await page.keyboard.press('Control+j')
    const current=await page.evaluate(async id=>(await window.api.terminal.snapshot({id})).data,terminalId)
    const views=await nativeViews();const nativeStable=current.pid===terminal.pid && views.children===before.children && views.contents===before.contents
    const listeners=await page.evaluate(()=>window.uxListenerCounts());const listenersStable=JSON.stringify(listeners)===JSON.stringify(listenerCounts)
    cycles.push({cycle:cycle+1,pid:current.pid,...views,listeners,nativeStable,listenersStable})
  }
  await dock.getByRole('button',{name:'Terminate shell',exact:true}).click();await dock.getByRole('button',{name:'Hide terminal',exact:true}).click()
  await page.evaluate(id=>window.api.browser.closeTab({id}),browser)
  const longTasks=await page.evaluate(()=>window.uxLongTasks)
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'PLANNING/evidence/ux-simplification/UX00_RUNTIME.json'),'utf8'))
  const metrics={typing:runs.map(r=>r.typing.p95),taskSwitch:runs.map(r=>r.taskSwitch.p95),cachedPanelShell:runs.map(r=>r.cachedPanelShell.p95),streamingTyping:streamingRuns.map(r=>r.p95),taskFeedback:runs.map(r=>r.taskFeedback.p95)}
  const limits={typing:100,taskSwitch:250,cachedPanelShell:300,streamingTyping:100,taskFeedback:100}
  const comparison=Object.fromEntries(Object.entries(metrics).map(([key,values])=>{
    const old=key==='taskFeedback'?null:key==='streamingTyping'?baseline.streamingRuns.map(r=>r.p95):baseline.runs.map(r=>r[key].p95)
    const p95Median=quantile(values,.5),baselineMedian=old?quantile(old,.5):null
    return[key,{perRunP95:values,p95Median,absoluteLimit:limits[key],absolutePass:values.every(v=>v<=limits[key]),baselineMedian,relativeChange:baselineMedian===null?null:p95Median/baselineMedian-1,relativePass:baselineMedian===null?null:p95Median<=baselineMedian*1.1}]
  }))
  return{capturedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:await app.evaluate(()=>process.versions),platform:{release:os.release(),cpu:os.cpus()[0].model},viewport:await page.evaluate(()=>({width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio})),seeded,taskCount:ids.length,resourceNames,runs,streamingRuns,scrollAnchor,streamingWindow:{start:streamingStart,end:streamingEnd},streamLongTasks:longTasks.filter(x=>x.start>=streamingStart && x.start<=streamingEnd && x.duration>100),longTasks,listenerCounts,cycles,comparison,traces:['TASK_SWITCH.cpuprofile','PANEL_OPEN.cpuprofile','STREAM_TYPING.cpuprofile'],limitations:['Two animation frames measure renderer scheduling, not physical display latency.','Cached panel timings exclude asynchronous content loading.','Baseline had no simultaneous resource tabs; ten existing resources are open in this integrated candidate.','Task search exposes the older fixture tasks in the paged sidebar; its queries run outside timing.','An isolated fixture-only session preload counts IPC listeners without wrapping callbacks or changing production preload code; counts are compared across all ten cycles.','Manual screen-reader listening is not a performance measurement.']}
}
