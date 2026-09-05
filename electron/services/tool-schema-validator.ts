import { isDeepStrictEqual } from 'node:util'

/** Shared argument gate for object-root tool calls.
 * Supports type (including unions), enum, required, properties,
 * additionalProperties:false and recursive array items. This is not a full
 * JSON Schema implementation: combinators, references, patterns and bounds
 * remain handler responsibilities. Provider-side validation is not trusted.
 */
export interface ToolArgValidationValid {
  valid: true
  parsed: Record<string, unknown>
}
export interface ToolArgValidationInvalid {
  valid: false
  errors: string[]
}
export type ToolArgValidationResult = ToolArgValidationValid | ToolArgValidationInvalid

interface JsonSchema {
  type?: string | string[]
  enum?: unknown[]
  properties?: Record<string, JsonSchema | boolean>
  required?: string[]
  additionalProperties?: boolean
  items?: JsonSchema | boolean
}

export function validateToolArguments(toolName: string, args: unknown, schema: unknown): ToolArgValidationResult {
  const definition = (schema ?? {}) as JsonSchema
  let parsed: unknown = args
  const emptyString = typeof args === 'string' && !args.trim()
  // Retain the no-argument compatibility contract. JSON text "null" is
  // different: it is an explicit non-object payload and must be rejected.
  if (args == null || emptyString) {
    if (definition.required?.length) return {
      valid: false,
      errors: [`${toolName}: ${emptyString ? 'empty argument string' : 'no arguments provided'} but expected: ${definition.required.join(', ')}`]
    }
    parsed = {}
  } else if (typeof args === 'string') {
    try { parsed = JSON.parse(args) } catch {
      return { valid: false, errors: [`${toolName}: failed to parse arguments as JSON`] }
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: [`${toolName}: arguments must be an object or JSON string containing an object`] }
  }
  const errors: string[] = []
  validateValue(toolName, parsed, definition, errors, '', 0)
  return errors.length ? { valid: false, errors } : { valid: true, parsed: parsed as Record<string, unknown> }
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  return typeof value === type
}

function validateValue(toolName: string, value: unknown, schema: JsonSchema | boolean, errors: string[], path: string, depth: number): void {
  if (typeof schema === 'boolean') {
    if (!schema) errors.push(`${toolName}: "${path || 'arguments'}" is not allowed by the schema`)
    return
  }
  if (depth > 64) {
    errors.push(`${toolName}: "${path}" exceeds supported nesting depth`)
    return
  }
  const types = typeof schema.type === 'string' ? [schema.type] : schema.type
  if (types && !types.some(type => matchesType(value, type))) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    errors.push(`${toolName}: "${path || 'arguments'}" expected ${types.join(' or ')}, got ${actual}`)
    return
  }
  if (schema.enum && !schema.enum.some(option => isDeepStrictEqual(value, option))) {
    errors.push(`${toolName}: "${path}" must be one of [${schema.enum.map(option => JSON.stringify(option)).join(', ')}]`)
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(object, key) || object[key] === undefined) {
        errors.push(`${toolName}: missing required property "${key}"${path ? ` in "${path}"` : ''}`)
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(object, key) && object[key] !== undefined) {
        validateValue(toolName, object[key], child, errors, path ? `${path}.${key}` : key, depth + 1)
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) errors.push(`${toolName}: ${path ? `"${path}" ` : ''}unexpected property "${key}"`)
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) validateValue(toolName, value[i], schema.items, errors, `${path}[${i}]`, depth + 1)
  }
}
