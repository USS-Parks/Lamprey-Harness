// Workspace World Model Phase (WM-5) — plan rollforward.
//
// GAVEL Alg. 1 lines 10-19 for a model turn's multi-call batch: simulate
// the calls in order on a shared overlay, stopping at the first blocking
// violation. The point is CROSS-CALL awareness the live per-call gate
// cannot have: call 3 doomed by call 1's simulated effect is rejected
// BEFORE call 1 mutates anything, so an invalid plan executes nothing —
// the paper's verify-before-execute contract.
//
// Optimism rule: state the simulation cannot know (an unattributable shell
// write) never dooms a later call. Doom requires a fact the overlay or the
// disk actually establishes.

import { analyzeToolCall } from './tool-action-semantics'
import {
  validateAnalysis,
  type ValidateContext,
  type WorkspaceOverlay,
  type WorldModelVerdict
} from './world-model-validate'

export interface BatchCall {
  toolName: string
  /** Parsed arguments; null when the raw arguments were not valid JSON. */
  args: Record<string, unknown> | null
}

export interface RollforwardViolation {
  index: number
  toolName: string
  verdict: WorldModelVerdict
}

export interface RollforwardResult {
  ok: boolean
  firstViolation?: RollforwardViolation
  overlay: WorkspaceOverlay
}

export function rollforwardCalls(
  calls: BatchCall[],
  base: { workspaceRoot: string; conversationId: string }
): RollforwardResult {
  const overlay: WorkspaceOverlay = new Map()
  const unknownPaths = new Set<string>()
  const ctx: ValidateContext = { ...base, overlay, unknownPaths }

  for (let index = 0; index < calls.length; index++) {
    const call = calls[index]
    // Unparseable args and tools without semantics pass through: the
    // per-call path owns their errors, and simulating nothing is safer
    // than guessing.
    if (call.args === null) continue
    const analysis = analyzeToolCall(call.toolName, call.args)
    if (!analysis) continue
    const verdict = validateAnalysis(analysis, ctx)
    if (!verdict.applicable) {
      return { ok: false, firstViolation: { index, toolName: call.toolName, verdict }, overlay }
    }
  }
  return { ok: true, overlay }
}

/** Result body for calls suppressed because the batch failed validation. */
export function batchNotExecutedResult(
  violationIndex: number,
  violationTool: string
): string {
  return JSON.stringify({
    error: 'batch_not_executed',
    reason:
      `Call ${violationIndex + 1} (${violationTool}) failed world-model validation, ` +
      'so NOTHING in this batch was executed. Fix that call using its verdict and ' +
      're-issue the batch.'
  })
}
