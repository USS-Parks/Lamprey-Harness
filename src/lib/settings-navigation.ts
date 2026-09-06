import type { SettingsTabId } from '@/stores/ui-store'

export const SETTINGS_GROUPS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'connections', label: 'Models & Connections' },
  { id: 'extensions', label: 'Tools & Extensions' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'advanced', label: 'Advanced' },
] as const
export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]['id']
export interface SettingsLeaf { id: SettingsTabId; label: string; group: SettingsGroupId; aliases: string[]; description: string }

export const SETTINGS_LEAVES: readonly SettingsLeaf[] = [
  { id: 'general', label: 'General', group: 'general', aliases: [], description: 'Startup, conversation titles and follow-up preferences.' },
  { id: 'automations', label: 'Automations', group: 'general', aliases: [], description: 'Scheduled tasks, reminders and recurring work.' },
  { id: 'appearance', label: 'Appearance', group: 'appearance', aliases: [], description: 'Light and dark mode, colors and theme presets.' },
  { id: 'models', label: 'Models', group: 'connections', aliases: [], description: 'Choose models, import catalogs and configure provider routing.' },
  { id: 'api', label: 'API Keys', group: 'connections', aliases: [], description: 'Connect providers and search services with API keys.' },
  { id: 'github', label: 'GitHub', group: 'connections', aliases: [], description: 'GitHub authentication and repository integration.' },
  { id: 'webTools', label: 'Web Tools', group: 'extensions', aliases: [], description: 'Web browsing and search tool preferences.' },
  { id: 'currentInfo', label: 'Current Info', group: 'extensions', aliases: [], description: 'Current information and freshness preferences.' },
  { id: 'imageGen', label: 'Image Generation', group: 'extensions', aliases: ['Image Gen'], description: 'Image generation providers and output settings.' },
  { id: 'tools', label: 'Tools', group: 'extensions', aliases: [], description: 'Tool access, discovery and large output handling.' },
  { id: 'library', label: 'Library', group: 'extensions', aliases: [], description: 'Reusable saved prompts and workflow library.' },
  { id: 'rag', label: 'Knowledge Search (RAG)', group: 'extensions', aliases: ['RAG'], description: 'Knowledge collections, documents, embeddings and retrieval.' },
  { id: 'permissions', label: 'Permissions', group: 'permissions', aliases: [], description: 'Approval policies and allowed tool actions.' },
  { id: 'agenticCoding', label: 'Coding Behavior', group: 'advanced', aliases: ['Coding Mode'], description: 'Coding behavior, verification and skill preferences.' },
  { id: 'planGoal', label: 'Plans & Goals', group: 'advanced', aliases: [], description: 'Planning mode, goals and execution preferences.' },
  { id: 'hooks', label: 'Hooks', group: 'advanced', aliases: [], description: 'Lifecycle hooks and configured commands.' },
  { id: 'loops', label: 'Loops', group: 'advanced', aliases: [], description: 'Repeated work, iteration limits and execution budgets.' },
  { id: 'orchestration', label: 'Orchestration', group: 'advanced', aliases: [], description: 'Agent coordination and resource limits.' },
  { id: 'snip', label: 'Output Filtering (Snip)', group: 'advanced', aliases: ['Snip'], description: 'Filter verbose command output and inspect filtering preferences.' },
  { id: 'timeouts', label: 'Timeouts', group: 'advanced', aliases: [], description: 'Streaming inactivity and tool execution time limits.' },
  { id: 'seedBudget', label: 'Context Budgets', group: 'advanced', aliases: ['Seed Budget'], description: 'Context window, seed length and token budgets.' },
  { id: 'reasoning', label: 'Reasoning Audit', group: 'advanced', aliases: [], description: 'Reasoning history and audit preferences.' },
  { id: 'persistence', label: 'Storage & Recovery', group: 'advanced', aliases: ['Persistence'], description: 'Storage, backup, recovery and data management.' },
  { id: 'activity', label: 'Activity History', group: 'advanced', aliases: ['Activity'], description: 'Diagnostic activity history. Current task attention stays in the sidebar.' },
]

export function settingsLeaf(id: SettingsTabId): SettingsLeaf {
  return SETTINGS_LEAVES.find(leaf => leaf.id === id) ?? SETTINGS_LEAVES[0]
}

export function searchSettings(query: string): SettingsLeaf[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return SETTINGS_LEAVES.filter(leaf => {
    const group = SETTINGS_GROUPS.find(group => group.id === leaf.group)?.label ?? ''
    const text = [leaf.label, leaf.description, group, ...leaf.aliases].join(' ').toLowerCase()
    return terms.every(term => text.includes(term))
  }).sort((a, b) => Number(b.label.toLowerCase().startsWith(query.trim().toLowerCase())) - Number(a.label.toLowerCase().startsWith(query.trim().toLowerCase())))
}
