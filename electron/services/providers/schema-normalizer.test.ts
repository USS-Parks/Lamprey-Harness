import { describe, it, expect } from 'vitest'
import { normalizeToolsForProvider } from './schema-normalizer'

const simpleTool = {
  name: 'simple_tool',
  description: 'A simple tool',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'A command' }
    },
    required: ['command'],
    additionalProperties: false
  }
}

const toolWithNested = {
  name: 'nested_tool',
  description: 'Tool with nested objects',
  inputSchema: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        properties: {
          timeout: { type: 'number' }
        },
        required: ['timeout'],
        additionalProperties: false
      }
    },
    required: ['config']
  }
}

const toolWithUnsupportedNonStructural = {
  name: 'quirky_tool',
  description: 'Has unsupported non-structural keywords',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'quirky',
    patternProperties: { '^x-': { type: 'string' } }
  }
}

const toolWithOneOf = {
  name: 'oneof_tool',
  description: 'Uses oneOf which is structural and unsupported',
  inputSchema: {
    type: 'object',
    oneOf: [
      { properties: { a: { type: 'string' } } },
      { properties: { b: { type: 'number' } } }
    ]
  }
}

const coreToolWithOneOf = {
  name: 'shell_command',
  description: 'Core tool with oneOf',
  inputSchema: {
    type: 'object',
    oneOf: [{ properties: { cmd: { type: 'string' } } }]
  }
}

const coreTool = {
  name: 'workspace_context',
  description: 'Core tool',
  inputSchema: {
    type: 'object',
    properties: { cwd: { type: 'string' } },
    additionalProperties: false
  }
}

describe('normalizeToolsForProvider', () => {
  it('preserves keyword-shaped property names and literal values at every object depth', () => {
    const properties = Object.fromEntries(['if', 'not', '$ref', 'oneOf', '__proto__'].map((name) => [name, { type: 'string', $id: 'strip-me' }]))
    const nested = { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
    const schema = {
      type: 'object', properties: { ...properties, nested, rows: { type: 'array', items: nested } },
      required: Object.keys(properties), default: { $ref: 'literal', if: { not: 'data' } },
      enum: [{ oneOf: 'literal' }], additionalProperties: nested
    }
    const original = structuredClone(schema)
    const result = normalizeToolsForProvider([{ ...simpleTool, inputSchema: schema }], 'deepseek')
    expect(result.warnings).toEqual([])
    const params = result.tools[0].function.parameters as any
    for (const object of [params, params.properties.nested, params.properties.rows.items, params.additionalProperties]) {
      for (const name of Object.keys(properties)) expect(object.properties[name]).toEqual({ type: 'string' })
      expect(object.required).toEqual(Object.keys(properties))
    }
    expect(params.default).toEqual(schema.default)
    expect(params.enum).toEqual(schema.enum)
    expect(schema).toEqual(original)
  })

  it.each([
    { properties: { x: { $ref: '#/defs/x' } } },
    { items: { oneOf: [{ type: 'string' }] } },
    { items: [{ anyOf: [{ type: 'string' }] }] },
    { additionalProperties: { allOf: [{ type: 'string' }] } }
  ])('rejects real structural keywords in schema positions: %j', (inputSchema) => {
    expect(normalizeToolsForProvider([{ ...simpleTool, inputSchema }], 'deepseek').tools).toEqual([])
    expect(() => normalizeToolsForProvider([{ ...coreTool, inputSchema }], 'deepseek')).toThrow(/unsupported JSON Schema keyword/)
  })
  it('passes through simple valid tools', () => {
    const result = normalizeToolsForProvider([simpleTool], 'deepseek')
    expect(result.tools).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
    const t = result.tools[0]
    expect(t.type).toBe('function')
    expect(t.function.name).toBe('simple_tool')
    expect(t.function.parameters.type).toBe('object')
    expect(t.function.parameters.additionalProperties).toBe(false)
  })

  it('handles tools with nested objects', () => {
    const result = normalizeToolsForProvider([toolWithNested], 'deepseek')
    expect(result.tools).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
    const params = result.tools[0].function.parameters
    const config = (params.properties as Record<string, unknown>).config as Record<string, unknown>
    expect(config.type).toBe('object')
  })

  it('strips non-structural unsupported keywords', () => {
    const result = normalizeToolsForProvider([toolWithUnsupportedNonStructural], 'deepseek')
    expect(result.tools).toHaveLength(1)
    const params = result.tools[0].function.parameters
    expect(params.$schema).toBeUndefined()
    expect(params.$id).toBeUndefined()
    expect(params.patternProperties).toBeUndefined()
    // Core properties should remain
    expect(params.properties).toBeDefined()
    expect(params.required).toEqual(['query'])
  })

  it('drops non-core tools with structural unsupported keywords', () => {
    const result = normalizeToolsForProvider([toolWithOneOf], 'deepseek')
    expect(result.tools).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('oneOf')
    expect(result.warnings[0]).toContain('oneof_tool')
  })

  it('throws for core tools with structural unsupported keywords', () => {
    expect(() => {
      normalizeToolsForProvider([coreToolWithOneOf], 'deepseek')
    }).toThrow(/Core tool "shell_command".*oneOf/)
  })

  it('core tools pass through normally when valid', () => {
    const result = normalizeToolsForProvider([coreTool], 'deepseek')
    expect(result.tools).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
  })

  it('handles mixed valid and invalid tools', () => {
    const result = normalizeToolsForProvider(
      [simpleTool, toolWithOneOf, coreTool],
      'deepseek'
    )
    expect(result.tools).toHaveLength(2) // simpleTool + coreTool
    expect(result.warnings).toHaveLength(1) // oneof_tool dropped
  })

  it('handles empty tool list', () => {
    const result = normalizeToolsForProvider([], 'deepseek')
    expect(result.tools).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('reads provider in fail-fast errors and applies no invented schema deltas', () => {
    expect(() =>
      normalizeToolsForProvider(
        [{ name: 'shell_command', description: 'x', inputSchema: null }],
        'anthropic'
      )
    ).toThrow(/provider "anthropic"/)
    const a = normalizeToolsForProvider([simpleTool], 'anthropic')
    const g = normalizeToolsForProvider([simpleTool], 'google')
    const m = normalizeToolsForProvider([simpleTool], 'minimax')
    expect(a.tools).toEqual(g.tools)
    expect(g.tools).toEqual(m.tools)
  })

  it('adds type:object when missing from inputSchema', () => {
    const result = normalizeToolsForProvider([{
      name: 'no_type_tool',
      description: 'Schema without explicit type',
      inputSchema: {
        properties: { x: { type: 'string' } }
      }
    }], 'deepseek')
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0].function.parameters.type).toBe('object')
  })
})
