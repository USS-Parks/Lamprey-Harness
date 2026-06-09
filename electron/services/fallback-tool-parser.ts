/**
 * FC-6 — Brace-balanced fallback tool-call parser.
 *
 * For models that do not support native function calling (supportsTools:
 * false), tool invocations must be extracted from the model's text output.
 * The fallback parser:
 *
 *   1. Extracts the first brace-balanced JSON object from the text using a
 *      linear-scan approach (no regex, no recursive backtracking).
 *   2. Parses the JSON and checks for the fallback contract format:
 *        {"action": "<tool_name>", "input": {...}}  — tool call
 *        {"action": "final", "answer": "..."}        — final answer
 *   3. Validates tool arguments against the tool's inputSchema.
 *   4. Returns validated ToolCallRequest objects with provenance: "fallback"
 *      or null when no valid tool call is found.
 *
 * Plain prose with no JSON is treated as a final answer only after parser
 * failure and is tagged `fallback-prose` by the caller.
 */

import { validateToolArguments } from './tool-schema-validator'
import type { ToolCallRequest } from './transcript-model'

/**
 * Extract the first brace-balanced JSON object from text using a
 * linear-scan approach.
 *
 * Algorithm:
 *   - Find the first '{' character
 *   - Scan forward, tracking nested braces and string state
 *   - When brace depth returns to 0, return the slice
 *   - Unbalanced or no braces → return null
 *
 * This is O(n), no backtracking, handles nested objects and escaped
 * quotes inside strings.
 */
export function extractBalancedJson(text: string): string | null {
  // Find the first opening brace
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\' && inString) {
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  // Unbalanced braces — no complete JSON object found
  return null
}

/**
 * Fallback instruction contract embedded in the system prompt for
 * non-native-tool models. Instructs them to output either:
 *
 *   {"action": "<tool_name>", "input": {...}}
 *   {"action": "final", "answer": "..."}
 *
 * Plain prose (no JSON) is treated as a final answer after parser failure.
 */
export const FALLBACK_TOOL_INSTRUCTION = [
  'Tool calling instructions:',
  'You do not have native function calling. To invoke a tool, output a single JSON object:',
  '  {"action": "<tool_name>", "input": {<arguments>}}',
  'When you are done and ready to answer, output:',
  '  {"action": "final", "answer": "Your final answer here."}',
  'Do NOT wrap the JSON in markdown fences or any other text. Output ONLY the JSON object on its own line.',
  'If your final answer is a plain text message (no tool call needed), you may output it directly as prose.',
  'Available tools and their schemas are listed above.',
  ''
].join('\n')

interface FallbackJson {
  action?: string
  input?: unknown
  answer?: string
}

/**
 * Parse fallback tool calls from a model's text output.
 *
 * Returns:
 *   - `ToolCallRequest[]` — valid fallback tool calls extracted from the text
 *   - `null` — no tool calls found (final answer)
 *
 * The caller should distinguish between:
 *   - parser returned null AND text contains no JSON → `fallback-prose` final answer
 *   - parser returned null BUT action is "final" → intentional final answer
 *   - parser returned `ToolCallRequest[]` → fallback tool calls to dispatch
 */
export function parseFallbackToolCalls(
  text: string,
  tools: Array<{ name: string; inputSchema: unknown; description?: string }>
): { calls: ToolCallRequest[]; isFinalAnswer: boolean } | null {
  // Try to extract a JSON object
  const jsonStr = extractBalancedJson(text)
  if (!jsonStr) return null

  let parsed: FallbackJson
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  // Check for final-answer contract
  if (parsed.action === 'final') {
    return { calls: [], isFinalAnswer: true }
  }

  // Must have an action/tool name and input
  if (!parsed.action || typeof parsed.action !== 'string') {
    return null
  }

  if (parsed.input === undefined) {
    return null
  }

  const toolName = parsed.action
  const toolDef = tools.find((t) => t.name === toolName)

  if (!toolDef) {
    // Tool not found in registry
    return null
  }

  // Validate arguments against the tool's schema
  const validation = validateToolArguments(toolName, parsed.input, toolDef.inputSchema)
  if (!validation.valid) {
    // Invalid arguments — return null so the model gets corrective feedback
    // in the next turn (caller should append validation errors to conversation)
    return null
  }

  // Generate a fallback-prefixed call id so native and fallback calls are
  // distinguishable in audit trails.
  const callId = `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  return {
    calls: [
      {
        id: callId,
        name: toolName,
        arguments: validation.parsed,
        provenance: 'fallback'
      }
    ],
    isFinalAnswer: false
  }
}
