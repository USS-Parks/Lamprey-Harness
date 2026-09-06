/* global document, location */
/* This prototype contains only static demonstration data and local view state. */
const app = document.querySelector('#app')
const dialog = document.querySelector('#dialog')
const body = document.querySelector('#dialog-body')
const note = document.querySelector('#review-note')
let state = 'idle'
let preferredAction = 'Steer'
let resource = 'file'
let opener
const logo = '<img src="brand.png" alt="">'

const settings = [
  ['general','General','General'], ['automations','Automations','General'],
  ['appearance','Appearance','Appearance'], ['models','Models','Models & Connections'],
  ['api','API Keys','Models & Connections'], ['github','GitHub','Models & Connections'],
  ['webTools','Web Tools','Tools & Extensions'], ['currentInfo','Current Info','Tools & Extensions'],
  ['imageGen','Image Gen','Tools & Extensions'], ['tools','Tools','Tools & Extensions'],
  ['library','Library','Tools & Extensions'], ['rag','RAG','Tools & Extensions'],
  ['permissions','Permissions','Permissions'], ['agenticCoding','Coding Mode','Advanced'],
  ['planGoal','Plans & Goals','Advanced'], ['hooks','Hooks','Advanced'], ['loops','Loops','Advanced'],
  ['orchestration','Orchestration','Advanced'], ['snip','Snip','Advanced'], ['timeouts','Timeouts','Advanced'],
  ['seedBudget','Seed Budget','Advanced'], ['reasoning','Reasoning Audit','Advanced'],
  ['persistence','Persistence','Advanced'], ['activity','Activity','Advanced']
]
const groups = ['General','Appearance','Models & Connections','Tools & Extensions','Permissions','Advanced']
const tools = [
  ['files','Files','Workspace'],['sidechat','Side chat','Message actions'],['browser','Browser','Workspace'],
  ['review','Review','Workspace'],['terminal','Terminal','Bottom panel'],['environment','Environment','Project context'],
  ['sources','Sources','Workspace'],['artifacts','Artifacts','Workspace'],['plan','Plan','Task progress'],
  ['background','Background tasks','Activity details'],['afterAction','After action','Diagnostics'],
  ['loop','Loops','Activity details'],['agents','Agents','Activity details']
]
const details = {
  'Environment':['Project and branch context has one home. All existing Git actions remain available here.',['Project details','Change project','Work mode','Switch branch','Review','Commit','Push','Create pull request','Open pull requests']],
  'Task actions':['Actions apply to this task. Archiving preserves it for later.',['Rename task','Pin task','Archive task','Fork task','Delete task']],
  'Task filters':['Find work without a second copy of the task list.',['Recent activity','Created date','Title A–Z','Title Z–A','Group by date','Group by model','Current project','All projects','Archived tasks']],
  'Queued follow-ups':['Queued for the next turn: “Check the narrow layout next.”',['Edit queued message','Move up','Move down','Send now','Remove from queue','Restore draft']],
  'Plan':['2 of 4 steps complete. A plan requiring approval retains its own decision.',['View steps','Accept plan','Request revision']],
  'Background tasks':['Open a task’s live processes and its full tool history here.',['Completed tool history','Running processes','Wakeups','Cancel selected job']],
  'After action':['Detailed evidence stays available without filling every conversation turn.',['Reasoning history','Search trace','Filter stages','Export markdown','Export CSV','Full error details']],
  'Loops':['Loop controls retain their current behavior. Hiding this view does not stop a loop.',['Pause loop','Resume loop','Stop loop','View backlog','Add backlog item','Remove backlog item','Delete loop']],
  'Agents':['Inspect the active task’s agents, grants and spending.',['Agent details','View grants','View spending','Revoke grant','Stop agent']],
  'Sources':['Sources belong to the task that produced them.',['Open citation','Source details','Show all sources']],
  'Artifacts':['Generated work opens directly from conversation links. The list remains available.',['Design notes.md','Preview image','Export artifact']],
  'Side chat':['Start with the selected message or code block while retaining its source.',['From this message','From selected block','Custom context']],
  'Customize':['The existing extension views remain together.',['Skills','Connectors','Plugins','Import from Codex']],
  'Automations':['Scheduled work stays accessible without its own permanent dashboard.',['Existing automations','New automation','Loops']],
  'Workflow library':['Existing workflow commands remain in the command menu.',['Run workflow','Dry run','Edit workflow','Create workflow','Meta scaffolder']],
  'All tasks and archives':['Search the current project or all tasks, including archived work.',['Search messages','Current project','All projects','Archived tasks','Unarchive task']],
  'Attach':['Add context in its original order.',['Choose files','Add image','Mention file','Memory reference']],
  'Memory':['Keep Ctrl+Shift+M for Memory. Model selection remains in the composer and commands.',['Search memory','Open memory entry']],
  'Context usage':['13% used in this illustrative task. Detailed budgets are available on demand.',['Context details','Seed Budget','Timeouts']],
  'Shell selection':['Use the existing installed shell choices.',['PowerShell','Command Prompt','Git Bash','WSL']],
  'Keyboard help':['Proposed Windows defaults, with the existing Memory binding retained.',['Ctrl+K / Ctrl+Shift+P · Commands','Ctrl+P · Files','Ctrl+B · Sidebar','Ctrl+J · Bottom panel','Ctrl+backtick · Terminal','Ctrl+Shift+G · Review','Ctrl+Shift+M · Memory','Ctrl+, · Settings']]
}
const message = (content, user = false) => `<article class="message${user ? ' user' : ''}">${user ? '' : `<div class="byline">${logo} Lamprey</div>`}${content}</article>`

function renderState(next) {
  state = next
  document.querySelectorAll('[data-state]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.state === state)))
  app.dataset.workspace = state === 'review' ? 'open' : 'closed'
  document.querySelector('#terminal').hidden = true
  document.querySelector('#queue-preview').hidden = state !== 'running'
  document.querySelector('#stop').hidden = state !== 'running'
  document.querySelector('#send-menu').hidden = state !== 'running'
  document.querySelector('#send').textContent = state === 'running' ? preferredAction : 'Send ↑'
  document.querySelector('#prompt').placeholder = state === 'running' ? 'Add a direction, or queue what comes next…' : 'What would you like to work on?'
  const messages = document.querySelector('#messages')
  const status = document.querySelector('#status')
  if (state === 'idle') {
    messages.innerHTML = '<div class="intro"><h2>What are we working on?</h2><p>Start a task in Lamprey Harness, or return to one in the sidebar.</p><div class="suggestions"><button data-action="Review">Review changes</button><button data-action="Files">Explore the project</button><button data-action="Plan">Plan an update</button></div></div>'
    status.innerHTML = '<span>Ready · Lamprey Harness</span><button data-action="Plan">Plan a task</button>'
  } else if (state === 'running') {
messages.innerHTML = message('<p>Simplify the composer and keep every existing control reachable.</p>', true) + message('<p>I’m bringing the routine controls into one compact row. Steering, queued follow-ups and permissions will keep their current behavior.</p><div class="tool-line"><span class="check">✓</span><button data-action="Completed tool history">Read ChatInput.tsx and the follow-up controls · 3 steps</button></div><p>The model selector and permission state stay visible. Less frequent actions move into the command menu.</p><button class="artifact-link" data-action="Open file"><span>▤</span><span>ChatInput.tsx<small>Open the file being reviewed</small></span><span>↗</span></button>')
    status.innerHTML = '<span><span class="pulse">●</span>Working · Updating the composer</span><button data-action="Plan">2 of 4 steps ⌄</button>'
  } else {
    messages.innerHTML = message('<p>Simplify the composer and keep every existing control reachable.</p>', true) + message('<p>The composer is ready for your review. Model, coding mode and permission state are grouped beside attachments. While work is running, the visible send action switches between Steer and Queue.</p><div class="tool-line"><span class="check">✓</span><button data-action="Completed tool history">View the work · 8 steps</button></div><button class="artifact-link" data-action="Review"><span>±</span><span>Review 2 changed files<small>Keep reviewing while you write the next instruction</small></span><span>↗</span></button><p class="resource-summary" style="margin-top:15px">The diff and sample result shown here are illustrative.</p>')
    status.innerHTML = '<span>Ready for review · 2 files changed</span><button data-action="After action">View details</button>'
    renderResource('review')
  }
  note.textContent = `${state === 'idle' ? 'Idle' : state === 'running' ? 'Running' : 'Reviewing'} mockup. The same task, composer and workspace controls remain in place.`
}

function renderResource(next) {
  resource = next
  app.dataset.workspace = 'open'
  document.querySelectorAll('[data-resource]').forEach(button => {
    const selected = button.dataset.resource === resource
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
  })
  const content = document.querySelector('#resource-content')
  if (next === 'review') content.innerHTML = '<div class="resource-toolbar"><span>Local changes · main</span><button data-action="Review actions">Review actions ⌄</button></div><p class="resource-summary">2 changed files · +18 −26</p><div class="diff-title"><strong>ChatInput.tsx</strong><button data-action="Fix this hunk">Fix this →</button></div><pre><span class="line"><em>42</em> return (</span><span class="line diff-remove"><em>43</em>−  &lt;ExpandedControls /&gt;</span><span class="line diff-add"><em>43</em>+  &lt;ComposerControls /&gt;</span><span class="line"><em>44</em> )</span></pre><div class="diff-title"><strong>composer.css</strong><button data-action="Fix this hunk">Fix this →</button></div><pre><span class="line diff-remove">− gap: 16px;</span><span class="line diff-add">+ gap: 8px;</span></pre><p class="resource-summary">Fix this adds the selected hunk to your draft. The diff stays open.</p>'
  else content.innerHTML = '<div class="resource-toolbar"><span>src / components / chat</span><button data-action="File actions">File actions ⌄</button></div><h3>ChatInput.tsx</h3><pre><span class="line"><em>38</em>function ChatInput() {</span><span class="line"><em>39</em>  return (</span><span class="line"><em>40</em>    &lt;Composer&gt;</span><span class="line"><em>41</em>      &lt;MessageInput /&gt;</span><span class="line"><em>42</em>      &lt;ComposerControls /&gt;</span><span class="line"><em>43</em>    &lt;/Composer&gt;</span><span class="line"><em>44</em>  )</span><span class="line"><em>45</em>}</span></pre><p class="resource-summary">Illustrative file preview. Selecting another task restores that task’s own resources.</p>'
}

function openDialog(title, html) {
  if (!dialog.open) opener = document.activeElement
  document.querySelector('#dialog-title').textContent = title
  body.innerHTML = html
  if (!dialog.open) dialog.showModal()
  const first = body.querySelector('input,button')
  if (first) first.focus()
}
function closeDialog() { dialog.close(); opener?.focus() }
function demonstrate(action) {
  closeDialog()
  note.textContent = `Mockup selection: ${action}. No command, file change or request was executed.`
}
function openDetails(action) {
  const [copy, actions] = details[action] ?? ['This existing operation remains reachable through the proposed navigation.', ['Return to task']]
  openDialog(action, `<p class="prototype-label">Navigation preview</p><p class="detail-copy">${copy}</p><div class="detail-actions">${actions.map(label => `<button data-demo="${label}">${label}</button>`).join('')}</div>`)
}
function openSettings(group = 'General') {
  openDialog('Settings', `<input class="dialog-search" id="settings-search" placeholder="Search settings…" aria-label="Search settings"><div class="settings-layout"><nav class="settings-groups" aria-label="Settings groups">${groups.map(g => `<button data-group="${g}" class="${g === group ? 'active' : ''}">${g}</button>`).join('')}</nav><div class="settings-leaves" id="settings-leaves"></div></div>`)
  const render = () => {
    const query = document.querySelector('#settings-search').value.toLowerCase()
    const matches = settings.filter(([id,label,g]) => query ? `${id} ${label} ${g}`.toLowerCase().includes(query) : g === group)
    document.querySelector('#settings-leaves').innerHTML = matches.length ? matches.map(([id,label,g]) => `<button data-setting="${id}">${label}<small>${g} · Existing settings retained</small></button>`).join('') : '<p class="detail-copy">No matching settings.</p>'
    if (!query && group === 'Tools & Extensions') document.querySelector('#settings-leaves').innerHTML += '<button data-action="Customize">Skills, Connectors & Plugins<small>Open Customize</small></button>'
  }
  document.querySelector('#settings-search').addEventListener('input', render)
  body.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => { group = button.dataset.group; body.querySelectorAll('[data-group]').forEach(b => b.classList.toggle('active', b === button)); render() }))
  render()
}
function openCommands(resourcesOnly = false) {
  const entries = tools.map(([,label,section]) => [label,section])
  if (!resourcesOnly) entries.push(['Workflow library','Workflows'],['Memory','Context'],['Customize','Extensions'],['Automations','Tasks'],['All tasks and archives','Tasks'],['Model','Composer'],['Permissions','Composer'],...settings.map(([,label,group]) => [label,`Settings · ${group}`]))
  openDialog(resourcesOnly ? 'Open workspace resource' : 'Search & commands', '<input class="dialog-search" id="command-search" placeholder="Find a task, file, command or setting…" aria-label="Search commands"><div class="command-list" id="command-list"></div>')
  const render = () => {
    const q = document.querySelector('#command-search').value.toLowerCase()
    const matches = entries.filter(([label,section]) => `${label} ${section}`.toLowerCase().includes(q))
    document.querySelector('#command-list').innerHTML = matches.length ? matches.map(([label,section]) => `<button data-command="${label}" data-section="${section}"><span>${label}</span><small>${section}</small></button>`).join('') : '<p class="detail-copy">No matching commands.</p>'
  }
  document.querySelector('#command-search').addEventListener('input', render)
  render()
}
function action(name) {
  if (dialog.open) closeDialog()
  if (name === 'Review') return renderResource('review')
  if (name === 'Open file') return renderResource('file')
  if (name === 'Files') return openDialog('Project files', '<input class="dialog-search" aria-label="Filter project files" placeholder="Find a file…"><div class="command-list"><button data-action="Open file">src / components / chat / ChatInput.tsx</button><button data-action="Open file">src / styles / composer.css</button></div>')
  if (name === 'Terminal') { document.querySelector('#terminal').hidden = false; return }
  if (name === 'Needs attention') return openDialog('Needs attention', '<p class="detail-copy">Release checklist · Permission needed</p><div class="approval-scope">Write release-notes.md<br>Scope: this task’s workspace</div><div class="detail-actions"><button data-demo="Open task and review permission">Open task</button><button data-demo="Allow once">Allow once</button><button data-demo="Deny">Deny</button></div>')
  if (name === 'Permissions' || name === 'Working mode') {
    const options = name === 'Permissions' ? ['Default permissions','Auto-review','Full access'] : ['Coding','Plan']
    return openDialog(name, `<p class="detail-copy">${name === 'Permissions' ? 'Permission changes do not change the working mode or resolve pending decisions.' : 'Working mode does not change permission policy.'}</p><div class="detail-actions">${options.map(label => `<button data-choice="${label}" data-choice-kind="${name}">${label}</button>`).join('')}</div>`)
  }
  if (name === 'Model') return openDialog('Choose a model', '<input class="dialog-search" placeholder="Search connected models…" aria-label="Search models"><button class="model-row" data-demo="DeepSeek selected">DeepSeek <small class="muted"> · Connected</small></button><button class="model-row" data-demo="Local model selected">Local model <small class="muted"> · Keyless</small></button><button data-demo="Open Models & Connections">Manage models & connections →</button>')
  if (name === 'Browser') return openDialog('Browser', '<input class="dialog-search" placeholder="Enter an address…" aria-label="Browser address"><p class="detail-copy">The existing browser lives in a workspace tab. This mockup does not load a website.</p><div class="detail-actions"><button data-demo="Back">Back</button><button data-demo="Forward">Forward</button><button data-demo="Reload">Reload</button><button data-demo="New page">New page</button><button data-demo="Close page">Close page</button><button data-demo="Developer policy and evidence">Developer mode</button></div>')
  if (name === 'Fix this hunk') { document.querySelector('#prompt').value = 'Please review this hunk in ChatInput.tsx and keep the current permission behavior.'; document.querySelector('#prompt').focus(); note.textContent = 'The selected hunk is represented in the draft; the review stays open. Nothing was sent.'; return }
  if (name === 'Review actions') details[name] = ['Existing Git actions remain scoped to the current task.',['Refresh','Stage selected file','Unstage selected file','Discard with confirmation','Open pull requests']]
  if (name === 'File actions') details[name] = ['File content stays in the existing preview; this phase does not add an arbitrary source editor.',['Copy path','Open in external editor','Reveal file','Close file tab']]
  if (name === 'New task') { document.querySelector('#task-title').textContent = 'New task'; renderState('idle'); return }
  openDetails(name)
}

document.querySelectorAll('[data-state]').forEach(button => button.addEventListener('click', () => renderState(button.dataset.state)))
document.querySelector('#theme').addEventListener('click', () => document.body.classList.toggle('light'))
document.querySelector('#sidebar-toggle').addEventListener('click', () => { app.dataset.sidebar = app.dataset.sidebar === 'closed' ? 'open' : 'closed'; note.textContent = 'Sidebar hidden. Ctrl+B restores it in this mockup.' })
document.querySelector('#commands').addEventListener('click', () => openCommands())
document.querySelector('#settings').addEventListener('click', () => openSettings())
document.querySelector('#changes').addEventListener('click', () => renderResource('review'))
document.querySelector('#workspace-toggle').addEventListener('click', () => { if (app.dataset.workspace === 'closed') renderResource(resource); else app.dataset.workspace = 'closed' })
document.querySelector('#close-workspace').addEventListener('click', () => { app.dataset.workspace = 'closed'; document.querySelector('#workspace-toggle').focus() })
document.querySelectorAll('[data-resource]').forEach(button => button.addEventListener('click', () => renderResource(button.dataset.resource)))
document.querySelector('.tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
  const tabs = [...document.querySelectorAll('[data-resource]')]
  const current = tabs.findIndex(tab => tab.dataset.resource === resource)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length
  event.preventDefault()
  renderResource(tabs[next].dataset.resource)
  tabs[next].focus()
})
document.querySelector('#add-resource').addEventListener('click', () => openCommands(true))
document.querySelector('#terminal-toggle').addEventListener('click', () => { document.querySelector('#terminal').hidden = !document.querySelector('#terminal').hidden })
document.querySelector('#hide-terminal').addEventListener('click', () => { document.querySelector('#terminal').hidden = true; document.querySelector('#terminal-toggle').focus() })
document.querySelector('#send-menu').addEventListener('click', () => openDialog('Send a follow-up', `<p class="detail-copy">Steer the active turn, or queue a separate turn after it.</p><div class="detail-actions"><button data-preference="Steer">Steer now</button><button data-preference="Queue">Queue next</button></div>`))
document.querySelector('#stop').addEventListener('click', () => { renderState('idle'); note.textContent = 'Mockup: Stop targets the active turn. No real turn was running.' })
document.querySelector('#composer').addEventListener('submit', event => { event.preventDefault(); note.textContent = `Mockup: ${state === 'running' ? preferredAction : 'Send'} selected. Your demonstration draft is retained; no request was sent.` })
document.querySelector('#dialog-close').addEventListener('click', closeDialog)
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog() })
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return
  const controls = [...dialog.querySelectorAll('button,input,textarea,a[href],[tabindex]')].filter(control => !control.disabled && control.tabIndex>=0 && control.getClientRects().length)
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
})
document.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (!button) return
  if (button.dataset.action) action(button.dataset.action)
  if (button.dataset.task) { document.querySelector('#task-title').textContent = button.dataset.task; document.querySelectorAll('[data-task]').forEach(b => b.classList.toggle('selected', b === button)); note.textContent = 'Mockup task selected. Production implementation must restore its own drafts, resources and running state.' }
  if (button.dataset.demo) demonstrate(button.dataset.demo)
  if (button.dataset.preference) { preferredAction = button.dataset.preference; document.querySelector('#send').textContent = preferredAction; closeDialog() }
  if (button.dataset.choice) { const target = button.dataset.choiceKind === 'Permissions' ? document.querySelector('.permissions') : document.querySelector('[data-action="Working mode"]'); target.textContent = `${button.dataset.choice} ⌄`; closeDialog() }
  if (button.dataset.setting) { const leaf = settings.find(([id]) => id === button.dataset.setting); openDialog(leaf[1], `<p class="prototype-label">${leaf[2]} → ${leaf[1]}</p><p class="detail-copy">The existing ${leaf[1]} settings form belongs here, with its saved values and validation preserved.</p><div class="detail-actions"><button data-demo="Return to settings">Return to task</button></div>`) }
  if (button.dataset.command) { if (button.dataset.section.startsWith('Settings')) openSettings(button.dataset.section.replace('Settings · ','')); else action(button.dataset.command) }
})
document.addEventListener('keydown', event => {
  if (dialog.open) return
  if (!(event.ctrlKey || event.metaKey) || event.isComposing) return
  const key = event.key.toLowerCase()
  if (key === 'k' || (key === 'p' && event.shiftKey)) { event.preventDefault(); openCommands() }
  if (key === ',') { event.preventDefault(); openSettings() }
  if (key === 'b') { event.preventDefault(); app.dataset.sidebar = app.dataset.sidebar === 'closed' ? 'open' : 'closed' }
  if (key === 'j') { event.preventDefault(); document.querySelector('#terminal-toggle').click() }
})
const initial = new URLSearchParams(location.search).get('state')
renderState(['idle','running','review'].includes(initial) ? initial : 'idle')
