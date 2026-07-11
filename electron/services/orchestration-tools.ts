import type { ChatCompletionTool } from 'openai/resources/chat/completions'

// Agentic Orchestration Phase AO-6 — the orchestration model tools and the
// dispatch-array strip that enforces the master toggle's zero-byte guarantee.
//
// The three strategy tools register in the pack list like every other tool, but
// when orchestration is OFF they are removed from the array handed to the model
// in buildDispatchTools / rebuildToolsForNextRound — so ZERO orchestration
// tool-schema bytes reach the provider (stronger than the loop precedent, where
// the loop tools stay in the surface and refuse at the handler). One list, used
// by the strip and by the safety source-lock.

export const ORCHESTRATION_MODEL_TOOL_IDS = [
  'agent_fanout',
  'agent_critique',
  'agent_advisor'
] as const

const ORCH_SET = new Set<string>(ORCHESTRATION_MODEL_TOOL_IDS)

/** Strip the orchestration tools from a dispatch array when orchestration is
 *  off. Returns the input unchanged when enabled (identity — no copy). */
export function filterOrchestrationTools(
  tools: ChatCompletionTool[],
  enabled: boolean
): ChatCompletionTool[] {
  if (enabled) return tools
  return tools.filter((t) => {
    const name = (t as { function?: { name?: string } }).function?.name
    return !name || !ORCH_SET.has(name)
  })
}
