import type { SettingsTabId } from '@/stores/ui-store'

export const SETTINGS_LEAVES = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models' },
  { id: 'agenticCoding', label: 'Coding Mode' },
  { id: 'api', label: 'API Keys' },
  { id: 'github', label: 'GitHub' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'webTools', label: 'Web Tools' },
  { id: 'currentInfo', label: 'Current Info' },
  { id: 'imageGen', label: 'Image Gen' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'planGoal', label: 'Plans & Goals' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'automations', label: 'Automations' },
  { id: 'loops', label: 'Loops' },
  { id: 'orchestration', label: 'Orchestration' },
  { id: 'library', label: 'Library' },
  { id: 'rag', label: 'RAG' },
  { id: 'snip', label: 'Snip' },
  { id: 'timeouts', label: 'Timeouts' },
  { id: 'tools', label: 'Tools' },
  { id: 'seedBudget', label: 'Seed Budget' },
  { id: 'reasoning', label: 'Reasoning Audit' },
  { id: 'persistence', label: 'Persistence' },
  { id: 'activity', label: 'Activity' }
] as const satisfies readonly { id: SettingsTabId; label: string }[]

