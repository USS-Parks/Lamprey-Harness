/**
 * FC-12 — Shadow-comparison logger.
 *
 * During rollout, logs what the old text parser would have inferred vs.
 * native tool_calls, without executing the old path. The old text parser
 * no longer exists (FC-0 confirmed), so the shadow always reports
 * "no legacy parser available" — this module exists as the diagnostic
 * seam required by the rollout plan.
 *
 * Can be disabled via the `shadowParserEnabled` config flag (default true
 * during this phase; FC-14 may change the default based on FC-13 results).
 */

import type { ToolCallRequest } from './transcript-model'

export interface ShadowReport {
  /** Native toolCalls that were actually dispatched. */
  native: ToolCallRequest[] | null
  /** What the legacy parser would have inferred (always null — no old parser). */
  legacyInferred: ToolCallRequest[] | null
  /** Difference classification. */
  difference: 'nativeOnly' | 'legacyOnly' | 'mismatch' | 'none'
}

let shadowEnabled = true

export function setShadowParserEnabled(enabled: boolean): void {
  shadowEnabled = enabled
}

export function isShadowParserEnabled(): boolean {
  return shadowEnabled
}

/**
 * Run shadow comparison for a turn.
 *
 * Always reports `difference: "nativeOnly"` since no old parser exists
 * to compare against. This function exists so the pipeline integration
 * point is ready for FC-13 smoke testing and can be cleanly removed in
 * FC-14 without disturbing the call site.
 */
export function runShadowComparison(
  _content: string,
  nativeToolCalls: ToolCallRequest[] | null,
  _tools: Array<{ name: string; inputSchema: unknown }>
): ShadowReport {
  return {
    native: nativeToolCalls,
    legacyInferred: null,
    difference: nativeToolCalls && nativeToolCalls.length > 0 ? 'nativeOnly' : 'none'
  }
}
