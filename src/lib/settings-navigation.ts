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
export interface SettingsLeaf { id: SettingsTabId; label: string; group: SettingsGroupId; aliases: string[] }

export const SETTINGS_LEAVES: readonly SettingsLeaf[] = [
  { id: 'general', label: 'General', group: 'general', aliases: [] },
  { id: 'automations', label: 'Automations', group: 'general', aliases: [] },
  { id: 'appearance', label: 'Appearance', group: 'appearance', aliases: [] },
  { id: 'models', label: 'Models', group: 'connections', aliases: [] },
  { id: 'api', label: 'API Keys', group: 'connections', aliases: [] },
  { id: 'github', label: 'GitHub', group: 'connections', aliases: [] },
  { id: 'webTools', label: 'Web Tools', group: 'extensions', aliases: [] },
  { id: 'currentInfo', label: 'Current Info', group: 'extensions', aliases: [] },
  { id: 'imageGen', label: 'Image Generation', group: 'extensions', aliases: ['Image Gen'] },
  { id: 'tools', label: 'Tools', group: 'extensions', aliases: [] },
  { id: 'library', label: 'Library', group: 'extensions', aliases: [] },
  { id: 'rag', label: 'Knowledge Search (RAG)', group: 'extensions', aliases: ['RAG'] },
  { id: 'permissions', label: 'Permissions', group: 'permissions', aliases: [] },
  { id: 'agenticCoding', label: 'Coding Behavior', group: 'advanced', aliases: ['Coding Mode'] },
  { id: 'planGoal', label: 'Plans & Goals', group: 'advanced', aliases: [] },
  { id: 'hooks', label: 'Hooks', group: 'advanced', aliases: [] },
  { id: 'loops', label: 'Loops', group: 'advanced', aliases: [] },
  { id: 'orchestration', label: 'Orchestration', group: 'advanced', aliases: [] },
  { id: 'snip', label: 'Output Filtering (Snip)', group: 'advanced', aliases: ['Snip'] },
  { id: 'timeouts', label: 'Timeouts', group: 'advanced', aliases: [] },
  { id: 'seedBudget', label: 'Context Budgets', group: 'advanced', aliases: ['Seed Budget'] },
  { id: 'reasoning', label: 'Reasoning Audit', group: 'advanced', aliases: [] },
  { id: 'persistence', label: 'Storage & Recovery', group: 'advanced', aliases: ['Persistence'] },
  { id: 'activity', label: 'Activity History', group: 'advanced', aliases: ['Activity'] },
]

export function settingsLeaf(id: SettingsTabId): SettingsLeaf {
  return SETTINGS_LEAVES.find(leaf => leaf.id === id) ?? SETTINGS_LEAVES[0]
}
