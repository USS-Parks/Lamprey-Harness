import type { ChatCompletionTool } from 'openai/resources/chat/completions'

// AC-13 — strip opt-in packs from the model surface when their master
// toggle is off. Handlers stay fail-closed as a second belt.
// Same shape as filterOrchestrationTools.

export const LOOP_MODEL_TOOL_IDS = [
  'schedule_wakeup',
  'loop_enqueue',
  'loop_complete_task',
  'loop_control'
] as const

export const BROWSER_DEVELOPER_MODEL_TOOL_IDS = [
  'browser_console_observe',
  'browser_dom_snapshot',
  'browser_runtime_inspect',
  'browser_performance_inspect',
  'browser_trace_window',
  'browser_screenshot_annotate',
  'browser_network_observe',
  'browser_network_body'
] as const

const LOOP_SET = new Set<string>(LOOP_MODEL_TOOL_IDS)
const BROWSER_DEV_SET = new Set<string>(BROWSER_DEVELOPER_MODEL_TOOL_IDS)

function toolName(t: ChatCompletionTool): string {
  return (t as { function?: { name?: string } }).function?.name ?? ''
}

export function filterLoopTools(
  tools: ChatCompletionTool[],
  enabled: boolean
): ChatCompletionTool[] {
  if (enabled) return tools
  return tools.filter((t) => {
    const name = toolName(t)
    return !name || !LOOP_SET.has(name)
  })
}

export function filterBrowserDeveloperTools(
  tools: ChatCompletionTool[],
  enabled: boolean
): ChatCompletionTool[] {
  if (enabled) return tools
  return tools.filter((t) => {
    const name = toolName(t)
    return !name || !BROWSER_DEV_SET.has(name)
  })
}
