import type { ToolId } from '@/stores/ui-store'

export type ResourceKind = ToolId | 'file' | 'artifact'
export interface WorkspaceResource {
  id: string
  kind: ResourceKind
  ref: string
  title: string
  projectId: string | null
}
export interface TaskWorkspace {
  tabs: WorkspaceResource[]
  activeId: string | null
}
export type Workspaces = Record<string, TaskWorkspace>
export const EMPTY_WORKSPACE: TaskWorkspace = { tabs: [], activeId: null }
const KINDS = new Set<ResourceKind>(['files', 'sidechat', 'browser', 'review', 'terminal', 'environment', 'sources', 'artifacts', 'plan', 'background', 'afterAction', 'loop', 'agents', 'file', 'artifact'])
export const workspaceKey = (taskId: string | null): string => JSON.stringify([taskId])
export const resourceTool = (resource: WorkspaceResource): ToolId => resource.kind === 'file' ? 'files' : resource.kind === 'artifact' ? 'artifacts' : resource.kind

export function resourceDescriptor(kind: ResourceKind, ref: string, title: string, projectId: string | null): WorkspaceResource {
  const normalized = kind === 'file' ? ref.replace(/\\/g, '/') : ref
  const identity = kind === 'file' && /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized
  return { id: JSON.stringify([projectId, kind, identity]), kind, ref: normalized, title, projectId }
}

/** Rebuild known metadata only. Discard malformed entries without resetting unrelated UI preferences. */
export function decodeWorkspaces(raw: string | null): Workspaces {
  try {
    if (raw && raw.length > 2_000_000) return {}
    const parsed: unknown = JSON.parse(raw ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Workspaces = {}
    for (const [key, value] of Object.entries(parsed)) {
      let owner: unknown
      try { owner = JSON.parse(key) } catch { continue }
      if (!Array.isArray(owner) || owner.length !== 1 || !(owner[0] === null || typeof owner[0] === 'string')) continue
      if (!value || !Array.isArray(value.tabs)) continue
      const tabs: WorkspaceResource[] = []
      for (const tab of value.tabs) {
        if (!tab || !KINDS.has(tab.kind) || typeof tab.ref !== 'string' || tab.ref.length > 4096 || typeof tab.title !== 'string' || tab.title.length > 240 || !(tab.projectId === null || typeof tab.projectId === 'string')) continue
        const clean = resourceDescriptor(tab.kind, tab.ref, tab.title, tab.projectId)
        if (!tabs.some(existing => existing.id === clean.id)) tabs.push(clean)
      }
      result[key] = { tabs, activeId: value.activeId === null || tabs.some(tab => tab.id === value.activeId) ? value.activeId : tabs[0]?.id ?? null }
    }
    return result
  } catch { return {} }
}

export function openResource(state: TaskWorkspace, resource: WorkspaceResource, activate = true): TaskWorkspace {
  const existing = state.tabs.some(tab => tab.id === resource.id)
  return { tabs: existing ? state.tabs : [...state.tabs, resource], activeId: activate ? resource.id : state.activeId }
}

export function closeResource(state: TaskWorkspace, id: string): TaskWorkspace {
  const index = state.tabs.findIndex(tab => tab.id === id)
  if (index < 0) return state
  const tabs = state.tabs.filter(tab => tab.id !== id)
  return { tabs, activeId: state.activeId === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null : state.activeId }
}
