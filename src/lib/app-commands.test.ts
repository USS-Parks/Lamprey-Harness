import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ openSettings: vi.fn(), setActiveTool: vi.fn(), toggleTool: vi.fn(), workflow: vi.fn().mockResolvedValue('run'), toast: vi.fn() }))
vi.mock('@/stores/chat-store', () => ({ useChatStore: { getState: () => ({ activeConversationId: null }) } }))
vi.mock('@/stores/ui-store', () => ({ useUiStore: { getState: () => ({ openSettings: mocks.openSettings, setActiveTool: mocks.setActiveTool, toggleTool: mocks.toggleTool }) } }))
vi.mock('@/stores/sessions-store', () => ({ useSessionsStore: { getState: () => ({}) } }))
vi.mock('@/stores/workflows-store', () => ({ useWorkflowsStore: { getState: () => ({ runWorkflow: mocks.workflow }) } }))
vi.mock('@/stores/toast-store', () => ({ toast: { error: mocks.toast, success: vi.fn() } }))
vi.mock('./attach-file', () => ({ pickAndAttachFiles: vi.fn() }))
import { APP_COMMANDS, TOOL_COMMANDS, commandById, executeCommand, validateCommands, workflowCommands, shortcutCommand } from './app-commands'
import { SETTINGS_LEAVES } from './settings-navigation'
import { TOOL_LABELS } from './workspace-tools'
it('includes every existing tool and all 24 settings leaves without conflicting bindings', () => {
  expect(SETTINGS_LEAVES).toHaveLength(24)
  expect(TOOL_COMMANDS.map(command => command.id)).toEqual(Object.keys(TOOL_LABELS).map(id => `tool.${id}`))
  for (const leaf of SETTINGS_LEAVES) expect(commandById(`settings.${leaf.id}`).label).toBe(leaf.label)
  expect(() => validateCommands(APP_COMMANDS)).not.toThrow()
})
it('rejects duplicate IDs and case-insensitive conflicting shortcuts', () => {
  const command = commandById('app.settings')
  expect(() => validateCommands([command, command])).toThrow('Duplicate command')
  expect(() => validateCommands([command, { ...command, id: 'other', shortcuts: ['mod+,'] }])).toThrow('Conflicting shortcut')
})
it('routes settings and tools through existing handlers with distinct shortcut toggle intent', async () => {
  await executeCommand(commandById('settings.permissions'))
  expect(mocks.openSettings).toHaveBeenCalledWith('permissions')
  await executeCommand(commandById('tool.review'))
  expect(mocks.setActiveTool).toHaveBeenCalledWith('review')
  await executeCommand(commandById('tool.review'), 'shortcut')
  expect(mocks.toggleTool).toHaveBeenCalledWith('review')
})
it('does not execute unavailable commands and names the missing prerequisite', async () => {
  expect(await executeCommand(commandById('app.worktrees'))).toBe(false)
  expect(mocks.toast).toHaveBeenCalledWith('Select a task first')
})
it('coalesces repeated invocation until an asynchronous action settles', async () => {
  let finish!: () => void
  const run = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const command = { id: 'test', label: 'Test', kind: 'command' as const, run }
  const first = executeCommand(command)
  expect(await executeCommand(command)).toBe(false)
  expect(run).toHaveBeenCalledTimes(1)
  finish(); expect(await first).toBe(true)
})
it('workflow commands invoke only the existing named workflow runner', async () => {
  const [command] = workflowCommands([{ name: 'safe-workflow', description: 'Existing workflow', origin: 'user' }])
  await executeCommand(command)
  expect(mocks.workflow).toHaveBeenCalledWith('safe-workflow')
  expect(command.id).toBe('workflow.user.safe-workflow')
})

it('matches exact modifiers and catches reordered equivalent shortcut declarations', () => {
  expect(shortcutCommand({ key: 'G', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })?.id).toBe('tool.review')
  expect(shortcutCommand({ key: 'g', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBeUndefined()
  const command = commandById('tool.review')
  expect(() => validateCommands([command, { ...command, id: 'other', shortcuts: ['Shift+Ctrl+G'] }])).toThrow('Conflicting shortcut')
})

it('aligns navigation bindings and retains Memory on its documented alternate', () => {
  const bindings = [['p', true, false, 'app.commands'], ['j', false, false, 'tool.terminal'], ['m', true, false, 'app.model'], ['m', false, true, 'app.memory'] ] as const
  for (const [key, shiftKey, altKey, id] of bindings) expect(shortcutCommand({ key, ctrlKey: true, metaKey: false, shiftKey, altKey })?.id).toBe(id)
})
