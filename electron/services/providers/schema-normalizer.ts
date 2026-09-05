/**
 * FC-3 — Provider schema normalizer.
 *
 * Adapts Lamprey's canonical tool descriptors into provider-specific tool
 * arrays. Per the FC-0 audit, all four providers (DeepSeek, Google, DashScope,
 * OpenRouter) accept standard OpenAI-format tool schemas with the same
 * accepted subset:
 *
 *   ✅ type, properties, required, description, enum, items, additionalProperties
 *   ❌ $ref, oneOf, anyOf, allOf
 *
 * The normalizer's primary job is therefore validation and safety, not
 * structural transformation:
 *
 *  1. Strip unsupported JSON Schema keywords from every tool's parameters.
 *  2. Core tools with unsupported keywords that CANNOT be stripped cause a
 *     startup-time failure.
 *  3. Non-core tools with unsupported keywords are dropped with a logged
 *     warning naming the tool, provider, and unsupported keyword.
 *  4. MCP-originating tools (if exposed to models) pass through the same
 *     normalization pathway.
 */

import { CORE_NORMALIZE_NAMES } from '../core-tool-names'

export interface ProviderTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * Keywords that are NOT supported by any of Lamprey's OpenAI-compatible
 * providers. Tools using these keywords have them stripped if possible;
 * if the keyword is structural (cannot be removed without breaking the
 * schema), the tool is either failed (core) or dropped (non-core).
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$ref',
  'oneOf',
  'anyOf',
  'allOf',
  '$schema',
  '$id',
  'definitions',
  '$defs',
  'patternProperties',
  'if',
  'then',
  'else',
  'not',
  'dependencies',
  'dependentRequired',
  'dependentSchemas',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'minContains',
  'maxContains',
  'propertyNames',
  'prefixItems'
])

/**
 * Structural keywords — if present, the schema cannot be meaningfully
 * normalized and the tool must be dropped (or failed for core tools).
 */
const STRUCTURAL_UNSUPPORTED = new Set(['$ref', 'oneOf', 'anyOf', 'allOf'])

/**
 * Core tools. These are the essential tools Lamprey requires to function.
 * If a core tool's schema cannot be normalized, the harness fails at startup
 * with a clear error.
 */
const CORE_TOOL_NAMES = new Set(CORE_NORMALIZE_NAMES)

export interface NormalizerResult {
  tools: ProviderTool[]
  warnings: string[]
}

/**
 * Visit schema positions only. Property names and literal/default values
 * are data, even when they happen to be JSON Schema keywords.
 */
function findStructuralUnsupported(schema: unknown): string | null {
  if (!schema || typeof schema !== 'object') return null
  const obj = schema as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (STRUCTURAL_UNSUPPORTED.has(key)) return key
    // Recurse into properties and items
    if (key === 'properties' && obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as Record<string, unknown>
      for (const propSchema of Object.values(props)) {
        const found = findStructuralUnsupported(propSchema)
        if (found) return found
      }
    }
    if (key === 'items' || key === 'additionalProperties') {
      const children = Array.isArray(obj[key]) ? obj[key] : [obj[key]]
      for (const child of children) {
        const found = findStructuralUnsupported(child)
        if (found) return found
      }
    }
  }
  return null
}

/**
 * Strip non-structural unsupported keywords from a schema object.
 * Returns a new object with unsupported keys removed at all depths.
 */
function stripUnsupportedKeywords(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key) && !STRUCTURAL_UNSUPPORTED.has(key)) {
      continue // Strip non-structural unsupported keys
    }
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, cleanChild(child)]))
    } else if (key === 'items' || key === 'additionalProperties') {
      cleaned[key] = Array.isArray(value) ? value.map(cleanChild) : cleanChild(value)
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

function cleanChild(value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? stripUnsupportedKeywords(value as Record<string, unknown>)
    : value
}

/**
 * Normalize tool descriptors for a specific provider.
 *
 * @param tools     Lamprey tool descriptors from the registry.
 * @param provider  Target provider. Anthropic / Google / MiniMax wire notes
 *                  in FUNCTION_CALLING.md §16 are request-level (compat
 *                  host, ignored `strict`/`response_format`/`reasoning_effort`),
 *                  not tool-schema transforms — so schemas stay identical
 *                  across those ids. The name is read for fail-fast errors.
 */
export function normalizeToolsForProvider(
  tools: Array<{ name: string; description: string; inputSchema: unknown; providerKind?: string }>,
  provider: string
): NormalizerResult {
  const result: ProviderTool[] = []
  const warnings: string[] = []

  for (const tool of tools) {
    const inputSchema = tool.inputSchema as Record<string, unknown> | undefined
    if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
      const isCore = CORE_TOOL_NAMES.has(tool.name)
      if (isCore) {
        throw new Error(
          `Core tool "${tool.name}" has missing or invalid inputSchema. Cannot normalize for provider "${provider}".`
        )
      }
      warnings.push(
        `Dropping tool "${tool.name}" — missing or invalid inputSchema (provider "${provider}").`
      )
      continue
    }

    // Check for structural unsupported keywords
    const structural = findStructuralUnsupported(inputSchema)
    if (structural) {
      const isCore = CORE_TOOL_NAMES.has(tool.name)
      if (isCore) {
        throw new Error(
          `Core tool "${tool.name}" uses unsupported JSON Schema keyword "${structural}" which cannot be stripped. ` +
            `Fix the tool's inputSchema to remove this keyword before normalizing for provider "${provider}".`
        )
      }
      warnings.push(
        `Dropping tool "${tool.name}" — uses unsupported structural keyword "${structural}" (provider "${provider}").`
      )
      continue
    }

    // Strip non-structural unsupported keywords
    const parameters = stripUnsupportedKeywords(inputSchema)

    // Ensure type: "object" is present
    if (!parameters.type) {
      parameters.type = 'object'
    }

    result.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters
      }
    })
  }

  return { tools: result, warnings }
}
