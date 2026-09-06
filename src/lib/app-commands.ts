import { useChatStore } from '@/stores/chat-store'
import { useUiStore, type ToolId } from '@/stores/ui-store'
import { useSessionsStore } from '@/stores/sessions-store'
import { useWorkflowsStore, type WorkflowLibraryEntry } from '@/stores/workflows-store'
import { toast } from '@/stores/toast-store'
import { pickAndAttachFiles } from './attach-file'
import { TOOL_LABELS } from './workspace-tools'
import { SETTINGS_LEAVES } from './settings-navigation'

export interface AppCommand {
  id: string
  label: string
  kind: 'command' | 'tool' | 'settings' | 'workflow' | 'task' | 'file'
  aliases?: string[]
  shortcuts?: string[]
  unavailable?: () => string | null
  run: () => unknown | Promise<unknown>
  onShortcut?: () => unknown | Promise<unknown>
}
const ui = () => useUiStore.getState()
async function openProjectLink(url: string): Promise<void> {
  const result = await window.api.artifact.openExternal(url)
  if (!result.success) throw new Error(result.error ?? 'Could not open the project page')
}
const toolBindings: Partial<Record<ToolId, string[]>> = { browser: ['Mod+T'], review: ['Mod+Shift+G'], terminal: ['Mod+`', 'Mod+J'], environment: ['Mod+Shift+E'], sources: ['Mod+Shift+S'] }
export const TOOL_COMMANDS: AppCommand[] = (Object.entries(TOOL_LABELS) as [ToolId, string][]).map(([id, label]) => ({
  id: `tool.${id}`, label, kind: 'tool', shortcuts: toolBindings[id], run: () => ui().setActiveTool(id), onShortcut: () => ui().toggleTool(id)
}))
export const APP_COMMANDS: AppCommand[] = [
  { id: 'task.new', label: 'New task', aliases: ['New chat', 'New conversation'], kind: 'command', shortcuts: ['Mod+N'], run: async () => {
    ui().closeProjectView(); ui().closeCustomize()
    useSessionsStore.getState().setQuery(''); useSessionsStore.getState().setProject(undefined); useSessionsStore.getState().setTab('recent')
    await useChatStore.getState().createConversation()
  } },
  { id: 'task.search', label: 'Search tasks', aliases: ['Sessions', 'Search conversations', 'Archived tasks'], kind: 'command', run: () => ui().requestSearchFocus() },
  { id: 'app.commands', label: 'Commands', aliases: ['Workflow commands', 'Command palette'], kind: 'command', shortcuts: ['Mod+K', 'Mod+Shift+P'], run: () => ui().openWorkflowPalette() },
  { id: 'files.find', label: 'Find workspace files', aliases: ['Quick open'], kind: 'command', shortcuts: ['Mod+P'], run: () => ui().openQuickOpen() },
  { id: 'files.attach', label: 'Attach files', aliases: ['Photos', 'Add file'], kind: 'command', shortcuts: ['Mod+U'], run: pickAndAttachFiles },
  { id: 'files.editor', label: 'Open in VS Code', kind: 'command', unavailable: () => typeof window === 'undefined' || !window.api?.files?.openInVSCode ? 'Editor integration unavailable' : null, run: async () => {
    const result = await window.api.files.openInVSCode({ conversationId: useChatStore.getState().activeConversationId })
    if (!result.success) throw new Error(result.error ?? 'Could not open VS Code')
  } },
  { id: 'app.sidebar', label: 'Toggle sidebar', kind: 'command', shortcuts: ['Mod+B'], run: () => ui().toggleSidebar() },
  { id: 'app.settings', label: 'Settings', kind: 'command', shortcuts: ['Mod+,'], run: () => ui().openSettings() },
  { id: 'app.model', label: 'Switch model', kind: 'command', shortcuts: ['Mod+Shift+M'], run: () => ui().requestModelMenu() },
  { id: 'app.memory', label: 'Memory', kind: 'command', shortcuts: ['Mod+Alt+M'], run: () => ui().openMemory() },
  { id: 'app.worktrees', label: 'Manage task worktrees', aliases: ['Branches', 'Worktree manager'], kind: 'command', unavailable: () => useChatStore.getState().activeConversationId ? null : 'Select a task first', run: () => ui().openWorktreeModal() },
  { id: 'app.github', label: 'View Lamprey on GitHub', kind: 'command', run: () => openProjectLink('https://github.com/USS-Parks/Lamprey-Harness') },
  { id: 'app.issue', label: 'Report an issue', kind: 'command', run: () => openProjectLink('https://github.com/USS-Parks/Lamprey-Harness/issues') },
  ...TOOL_COMMANDS,
  ...SETTINGS_LEAVES.map(leaf => ({ id: `settings.${leaf.id}`, label: leaf.label, aliases: leaf.aliases, kind: 'settings' as const, run: () => ui().openSettings(leaf.id) })),
  ...(['skills', 'connectors', 'plugins'] as const).map(column => ({ id: `customize.${column}`, label: column[0].toUpperCase() + column.slice(1), aliases: ['Customize', column === 'connectors' ? 'MCP' : column], kind: 'command' as const, run: () => ui().openCustomize(column) }))
]
export function workflowCommands(entries: WorkflowLibraryEntry[]): AppCommand[] {
  return entries.map(entry => ({ id: `workflow.${encodeURIComponent(entry.origin)}.${encodeURIComponent(entry.name)}`, label: entry.name, aliases: [entry.description, entry.origin], kind: 'workflow', run: async () => {
    const id = await useWorkflowsStore.getState().runWorkflow(entry.name)
    if (!id) throw new Error(useWorkflowsStore.getState().libraryError || 'Workflow did not start')
    toast.success(`Started ${entry.name}`)
  } }))
}
function normalizedShortcut(value: string): string {
  const parts = value.toLowerCase().split('+')
  const key = parts.pop()
  return [...parts.map(part => part === 'ctrl' || part === 'cmd' ? 'mod' : part).sort(), key].join('+')
}
export function shortcutCommand(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): AppCommand | undefined {
  const key = [...(event.ctrlKey || event.metaKey ? ['Mod'] : []), ...(event.shiftKey ? ['Shift'] : []), ...(event.altKey ? ['Alt'] : []), event.key].join('+')
  return APP_COMMANDS.find(command => command.shortcuts?.some(binding => normalizedShortcut(binding) === normalizedShortcut(key)))
}
export function validateCommands(commands: AppCommand[]): void {
  const ids = new Set<string>(); const bindings = new Set<string>()
  for (const command of commands) {
    if (ids.has(command.id)) throw new Error(`Duplicate command: ${command.id}`)
    ids.add(command.id)
    for (const key of command.shortcuts ?? []) {
      const normalized = normalizedShortcut(key)
      if (bindings.has(normalized)) throw new Error(`Conflicting shortcut: ${key}`)
      bindings.add(normalized)
    }
  }
}
validateCommands(APP_COMMANDS)
const executing = new Set<string>()
export async function executeCommand(command: AppCommand, source: 'menu' | 'shortcut' = 'menu'): Promise<boolean> {
  const reason = command.unavailable?.()
  if (reason) { toast.error(reason); return false }
  if (executing.has(command.id)) return false
  executing.add(command.id)
  try { await (source === 'shortcut' && command.onShortcut ? command.onShortcut : command.run)(); return true }
  catch (error) { toast.error(error instanceof Error ? error.message : String(error)); return false }
  finally { executing.delete(command.id) }
}
export function commandById(id: string): AppCommand {
  const command = APP_COMMANDS.find(command => command.id === id)
  if (!command) throw new Error(`Unknown command: ${id}`)
  return command
}
export const shortcutHint = (command: AppCommand): string | undefined => command.shortcuts?.[0]?.replace('Mod', 'Ctrl')
