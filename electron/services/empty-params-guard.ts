/**
 * Fix C — detect tool calls with empty parameters caused by reasoning token
 * exhaustion. When a reasoning model's chain-of-thought consumes the entire
 * output budget, the tool call structure is emitted but the parameter content
 * is empty or '{}'. If the tool's schema has required properties, this is
 * almost certainly a truncation, not an intentional empty call.
 *
 * Pure function — no side effects, no imports beyond types.
 */

export interface EmptyParamsDetection {
  isEmpty: true
  toolName: string
  requiredFields: string[]
  diagnostic: string
}

export interface EmptyParamsOk {
  isEmpty: false
}

export type EmptyParamsResult = EmptyParamsDetection | EmptyParamsOk

export function detectEmptyParams(
  toolName: string,
  rawArgs: string | undefined | null,
  schemaRequired: string[] | undefined
): EmptyParamsResult {
  const trimmed = (rawArgs || '').trim()
  const argsAreEmpty = trimmed === '' || trimmed === '{}' || trimmed === 'null'

  if (!argsAreEmpty) return { isEmpty: false }

  const hasRequired =
    schemaRequired && Array.isArray(schemaRequired) && schemaRequired.length > 0

  if (!hasRequired) return { isEmpty: false }

  return {
    isEmpty: true,
    toolName,
    requiredFields: schemaRequired!,
    diagnostic:
      'Your tool call arrived with empty parameters — this typically '
      + 'means your reasoning/thinking consumed the entire output token budget '
      + 'before the tool-call content could be emitted. Shorten your chain-of-thought '
      + 'drastically and retry. Write the tool parameters FIRST, reason less.'
  }
}
