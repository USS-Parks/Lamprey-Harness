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
    expect(decoded[workspaceKey('a')]).toEqual({ tabs: [tab], activeId: tab.id })
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
