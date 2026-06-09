/**
 * FC-10 — Capability mismatch detection.
 *
 * Tracks per-conversation per-model capability: when a model flagged
 * `supportsTools: true` repeatedly returns no structured tool_calls while
 * the model's text contains tool-like syntax (suggesting it TRIED to invoke
 * a tool but couldn't via the API), we detect the mismatch and temporarily
 * downgrade the model to fallback mode for the remainder of the conversation.
 *
 * A turn where the model simply answers without tool-like syntax does NOT
 * count as a mismatch — false positives are a worse UX than silent fallback.
 */

const TOOL_LIKE_PATTERNS = [
  /<bash>/i,
  /<tool>/i,
  /<run>/i,
  /<shell>/i,
  /<execute>/i,
  /<command>/i,
  /<terminal>/i,
  /\{"action"\s*:\s*"/i,
  /```(bash|sh|shell|cmd|powershell|ps1)/i
]

function hasToolLikeSyntax(text: string): boolean {
  return TOOL_LIKE_PATTERNS.some((p) => p.test(text))
}

interface CapabilityState {
  /** Consecutive mismatch count for this session. */
  mismatchCount: number
  /** Whether the model has been downgraded to fallback mode. */
  downgraded: boolean
}

/**
 * Per-conversation model capability tracking.
 * Key: `${conversationId}::${modelId}`
 */
const stateMap = new Map<string, CapabilityState>()

const DEFAULT_MISMATCH_THRESHOLD = 3

function stateKey(conversationId: string, modelId: string): string {
  return `${conversationId}::${modelId}`
}

/**
 * Reset tracking state for a conversation+model pair (e.g. on new conversation).
 */
export function resetCapabilityTracking(conversationId: string, modelId: string): void {
  stateMap.delete(stateKey(conversationId, modelId))
}

/**
 * Clear all capability tracking state (e.g. on app restart).
 */
export function clearAllCapabilityTracking(): void {
  stateMap.clear()
}

/**
 * Return true if the model has been downgraded to fallback mode for this
 * conversation. Callers should treat the model as `supportsTools: false`.
 */
export function isDowngraded(conversationId: string, modelId: string): boolean {
  const state = stateMap.get(stateKey(conversationId, modelId))
  return state?.downgraded ?? false
}

/**
 * Record a turn result for capability mismatch detection.
 *
 * Call this after every model turn where `supportsTools: true` and tools
 * were sent. When the model returned NO tool_calls AND its text contains
 * tool-like syntax, increment the mismatch counter. Normal answers (no
 * tool-like syntax) reset the counter.
 *
 * After `threshold` consecutive mismatches, the model is downgraded and
 * `isDowngraded()` returns true for the remainder of the conversation.
 *
 * @returns A warning string if a downgrade just occurred, null otherwise.
 */
export function recordCapabilityCheck(
  conversationId: string,
  modelId: string,
  toolsWereSent: boolean,
  toolCallsWereReturned: boolean,
  modelTextContent: string,
  threshold = DEFAULT_MISMATCH_THRESHOLD
): string | null {
  if (!toolsWereSent) return null // No tools sent, no mismatch to detect

  const key = stateKey(conversationId, modelId)
  let state = stateMap.get(key)

  if (!state) {
    state = { mismatchCount: 0, downgraded: false }
    stateMap.set(key, state)
  }

  if (state.downgraded) return null // Already downgraded, no further action

  if (toolCallsWereReturned) {
    // Model returned tool_calls — working correctly. Reset counter.
    if (state.mismatchCount > 0) {
      state.mismatchCount = 0
    }
    return null
  }

  // No tool_calls returned. Check if the model's text looks like it
  // was trying to invoke a tool.
  if (!hasToolLikeSyntax(modelTextContent)) {
    // Normal answer — reset counter, not a mismatch.
    state.mismatchCount = 0
    return null
  }

  // Tool-like syntax detected but no tool_calls returned → mismatch
  state.mismatchCount++

  if (state.mismatchCount >= threshold) {
    state.downgraded = true
    return (
      `Capability mismatch detected for model "${modelId}": ` +
      `${state.mismatchCount} consecutive turns with tool-like syntax but no tool_calls returned. ` +
      `Downgrading to fallback mode for the remainder of this conversation.`
    )
  }

  return null
}

/**
 * Inject for tests: set the internal state for a conversation+model pair.
 */
export function __setCapabilityStateForTesting(
  conversationId: string,
  modelId: string,
  state: CapabilityState
): void {
  stateMap.set(stateKey(conversationId, modelId), state)
}

/**
 * Inject for tests: clear all state.
 */
export function __clearForTesting(): void {
  stateMap.clear()
}
