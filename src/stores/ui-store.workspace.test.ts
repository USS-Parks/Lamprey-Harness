import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './ui-store'
import { decodeWorkspaces, resourceDescriptor, workspaceKey } from '@/lib/workspace-state'

const state = () => useUiStore.getState()
const current = () => state().workspaces[workspaceKey(state().activeRightPanelConvId)]
beforeEach(() => {
  useUiStore.setState({ workspaces: {}, activeRightPanelConvId: null, activeWorkspaceProjectId: null, activeTool: null, rightPanelByConv: {} })
  state().hydrateRightPanelForConv('task-a', 'project-a')
})

describe('task workspace resource lifecycle', () => {
  it('deduplicates repeated Windows paths and preserves user order', () => {
    state().requestOpenFile('C:\\repo\\example.ts')
    state().requestOpenFile('C:/repo/other.ts')
    state().requestOpenFile('c:/REPO/example.ts')
    expect(current().tabs).toHaveLength(2)
    expect(current().activeId).toBe(current().tabs[0].id)
    const ids = current().tabs.map(tab => tab.id).reverse()
    state().reorderWorkspaceResources(ids)
    expect(current().tabs.map(tab => tab.id)).toEqual(ids)
    state().reorderWorkspaceResources([ids[0], ids[0]])
    expect(current().tabs.map(tab => tab.id)).toEqual(ids)
  })
  it('keeps identical filenames in different projects distinct', () => {
    state().requestOpenFile('src/index.ts')
    const first = current().activeId
    state().hydrateRightPanelForConv('task-a', 'project-b')
    state().requestOpenFile('src/index.ts')
    expect(current().tabs).toHaveLength(2)
    expect(current().activeId).not.toBe(first)
  })
  it('restores task selection without leaking another task file', () => {
    state().requestOpenFile('a.txt')
    state().hydrateRightPanelForConv('task-b', 'project-b')
    expect(state().activeTool).toBeNull()
    expect(state().requestedOpenFilePath).toBeNull()
    state().setActiveTool('review')
    state().hydrateRightPanelForConv('task-a', 'project-a')
    expect(state().activeTool).toBe('files')
    expect(state().requestedOpenFilePath).toBe('a.txt')
    expect(current().tabs).toHaveLength(1)
  })
  it('closes only the chosen tab and selects its neighbor; reopening is fresh', () => {
    state().requestOpenFile('a.txt')
    state().requestOpenFile('b.txt')
    const b = current().activeId!
    state().closeWorkspaceResource(b)
    expect(state().requestedOpenFilePath).toBe('a.txt')
    state().requestOpenFile('b.txt')
    expect(current().tabs).toHaveLength(2)
    state().closeActiveTool()
    state().closeActiveTool()
    expect(state().activeTool).toBeNull()
    expect(current().tabs).toEqual([])
  })
  it('background opens do not activate a resource or expand the panel', () => {
    state().setRightPanelCollapsed(true)
    state().openWorkspaceResource('artifacts', 'artifacts', 'Artifacts', false)
    expect(current().tabs).toHaveLength(1)
    expect(current().activeId).toBeNull()
    expect(state().rightPanelCollapsed).toBe(true)
    expect(decodeWorkspaces(JSON.stringify(state().workspaces))[workspaceKey('task-a')].activeId).toBeNull()
    state().autoOpenRightPanel('task-b', 'artifact-b')
    expect(state().rightPanelCollapsed).toBe(true)
  })
  it('keeps legacy layout and independent permissions while initializing tabs', () => {
    useUiStore.setState({ rightPanelWidth: 533, permissionsMode: 'auto-review', planMode: true, rightPanelByConv: { legacy: { collapsed: false, currentTrigger: null, dismissed: [] } } })
    state().hydrateRightPanelForConv('legacy')
    expect(state().rightPanelWidth).toBe(533)
    expect(state().rightPanelCollapsed).toBe(false)
    expect(state().permissionsMode).toBe('auto-review')
    expect(state().planMode).toBe(true)
    state().setActiveTool('review')
    expect(current().tabs[0].kind).toBe('review')
  })
})

describe('persisted workspace validation', () => {
  it('drops corrupt entries and unknown fields but preserves valid siblings', () => {
    const tab = resourceDescriptor('file', 'a.txt', 'a.txt', 'project-a')
    const decoded = decodeWorkspaces(JSON.stringify({ bad: {}, [workspaceKey('a')]: { tabs: [{ ...tab, contents: 'must not persist', credential: 'must not persist' }, { kind: 'unknown' }, tab], activeId: 'missing' } }))
    expect(decoded[workspaceKey('a')]).toEqual({ tabs: [tab], activeId: tab.id, terminalOpen: false })
    expect(JSON.stringify(decoded)).not.toContain('must not persist')
    expect(decodeWorkspaces('{')).toEqual({})
    expect(decodeWorkspaces('[]')).toEqual({})
  })
  it('round-trips order and selection through a reload', () => {
    state().requestOpenFile('a.txt')
    state().setActiveTool('review')
    const saved = JSON.stringify(state().workspaces)
    useUiStore.setState({ workspaces: decodeWorkspaces(saved), activeTool: null })
    state().hydrateRightPanelForConv('task-a', 'project-a')
    expect(state().activeTool).toBe('review')
    expect(current().tabs.map(tab => tab.kind)).toEqual(['file', 'review'])
  })
})


it('routes terminal opens below the workspace and preserves visibility across other tab changes', () => {
  state().setRightPanelCollapsed(true)
  state().setActiveTool('terminal')
  expect(current().terminalOpen).toBe(true)
  expect(current().tabs).toEqual([])
  expect(state().rightPanelCollapsed).toBe(true)
  state().requestOpenFile('a.txt')
  state().closeActiveTool()
  expect(current().terminalOpen).toBe(true)
  state().hydrateRightPanelForConv('another-task')
  expect(current()?.terminalOpen).toBeUndefined()
  state().hydrateRightPanelForConv('task-a')
  expect(current().terminalOpen).toBe(true)
  state().toggleTool('terminal')
  expect(current().terminalOpen).toBe(false)
})

it('migrates a legacy terminal tab into the dock without dropping file tabs', () => {
  const terminal = resourceDescriptor('terminal', 'terminal', 'Terminal', null)
  const file = resourceDescriptor('file', 'a.txt', 'a.txt', null)
  const decoded = decodeWorkspaces(JSON.stringify({ [workspaceKey('a')]: { tabs: [terminal, file], activeId: terminal.id } }))
  expect(decoded[workspaceKey('a')]).toEqual({ tabs: [file], activeId: file.id, terminalOpen: true })
})

it('restores review selection without retaining diff content or malformed metadata', () => {
  state().setActiveTool('review')
  state().updateWorkspace({ ...current(), reviewSelection: { path: 'src/a.ts', staged: true }, reviewMode: 'pr' })
  const decoded = decodeWorkspaces(JSON.stringify(state().workspaces))
  expect(decoded[workspaceKey('task-a')].reviewSelection).toEqual({ path: 'src/a.ts', staged: true })
  expect(decoded[workspaceKey('task-a')].reviewMode).toBe('pr')
  const malformed = decodeWorkspaces(JSON.stringify({ [workspaceKey('b')]: { tabs: [], reviewSelection: { path: 123, staged: true, diff: 'private content' } } }))
  expect(malformed[workspaceKey('b')].reviewSelection).toBeUndefined()
  expect(JSON.stringify(malformed)).not.toContain('private content')
})

it('saves a late review selection to its owner without replacing the foreground resource', () => {
  state().setActiveTool('review')
  const ownerWorkspace = current()
  state().hydrateRightPanelForConv('task-b')
  state().requestOpenFile('b.txt')
  state().updateWorkspace({ ...ownerWorkspace, reviewSelection: { path: 'a.txt', staged: false } }, 'task-a')
  expect(state().activeTool).toBe('files')
  expect(current().tabs[0].ref).toBe('b.txt')
  state().hydrateRightPanelForConv('task-a')
  expect(current().reviewSelection).toEqual({ path: 'a.txt', staged: false })
})
