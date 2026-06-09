import { describe, it, expect } from 'vitest'
import { validateToolArguments } from './tool-schema-validator'

describe('FC-1B — Core tools schema hardening', () => {
  // ── shell_command ───────────────────────────────────────────────────

  const shellSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command line to execute.' },
      cwd: { type: 'string', description: 'Optional working directory.' },
      timeout_ms: { type: 'number', description: 'Timeout in ms.' },
      env: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Optional env overlay.'
      },
      shell: {
        type: 'string',
        enum: ['auto', 'bash', 'powershell'],
        description: 'Shell flavour.'
      },
      dangerously_disable_sandbox: { type: 'boolean', description: 'Bypass sandbox.' },
      bypass_snip: { type: 'boolean', description: 'Bypass snip filter.' }
    },
    required: ['command'],
    additionalProperties: false
  }

  it('accepts valid shell_command args', () => {
    const r = validateToolArguments('shell_command', { command: 'ls -la' }, shellSchema)
    expect(r.valid).toBe(true)
  })

  it('accepts shell_command with optional fields', () => {
    const r = validateToolArguments(
      'shell_command',
      { command: 'ls', cwd: '/tmp', timeout_ms: 30000, shell: 'bash' },
      shellSchema
    )
    expect(r.valid).toBe(true)
  })

  it('rejects shell_command without command', () => {
    const r = validateToolArguments('shell_command', { cwd: '/tmp' }, shellSchema)
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors[0]).toContain('missing required property "command"')
  })

  it('rejects shell_command with unknown property', () => {
    const r = validateToolArguments('shell_command', { command: 'ls', extra: true }, shellSchema)
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toContainEqual(expect.stringContaining('unexpected property "extra"'))
  })

  it('rejects shell_command with wrong shell enum', () => {
    const r = validateToolArguments(
      'shell_command',
      { command: 'ls', shell: 'zsh' },
      shellSchema
    )
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toContainEqual(expect.stringContaining('must be one of'))
  })

  // ── apply_patch ─────────────────────────────────────────────────────

  const patchSchema = {
    type: 'object',
    properties: {
      patch: { type: 'string', description: 'Full patch envelope.' }
    },
    required: ['patch'],
    additionalProperties: false
  }

  it('accepts valid apply_patch args', () => {
    const r = validateToolArguments(
      'apply_patch',
      { patch: '*** Begin Patch\n*** Add File: foo.txt\n+hello\n*** End Patch' },
      patchSchema
    )
    expect(r.valid).toBe(true)
  })

  it('rejects apply_patch without patch', () => {
    const r = validateToolArguments('apply_patch', {}, patchSchema)
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors[0]).toContain('missing required property "patch"')
  })

  it('rejects apply_patch with extra property', () => {
    const r = validateToolArguments(
      'apply_patch',
      { patch: '...', dry_run: true },
      patchSchema
    )
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toContainEqual(expect.stringContaining('unexpected property "dry_run"'))
  })

  // ── workspace_context ───────────────────────────────────────────────

  const workspaceCtxSchema = {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Optional working directory.' },
      cap_bytes: { type: 'number', description: 'Output size cap.' }
    },
    additionalProperties: false
  }

  it('accepts empty workspace_context (no required fields)', () => {
    const r = validateToolArguments('workspace_context', {}, workspaceCtxSchema)
    expect(r.valid).toBe(true)
  })

  it('accepts workspace_context with optional fields', () => {
    const r = validateToolArguments(
      'workspace_context',
      { cwd: '/src', cap_bytes: 16384 },
      workspaceCtxSchema
    )
    expect(r.valid).toBe(true)
  })

  it('rejects workspace_context with unknown property', () => {
    const r = validateToolArguments(
      'workspace_context',
      { cwd: '/src', format: 'json' },
      workspaceCtxSchema
    )
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toContainEqual(expect.stringContaining('unexpected property "format"'))
  })

  // ── view_image ──────────────────────────────────────────────────────

  const viewImageSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to image file.' },
      description: { type: 'string', description: 'Optional caption.' }
    },
    required: ['path'],
    additionalProperties: false
  }

  it('accepts valid view_image args', () => {
    const r = validateToolArguments('view_image', { path: '/workspace/screenshot.png' }, viewImageSchema)
    expect(r.valid).toBe(true)
  })

  it('accepts view_image with description', () => {
    const r = validateToolArguments(
      'view_image',
      { path: '/w/img.jpg', description: 'Login page screenshot' },
      viewImageSchema
    )
    expect(r.valid).toBe(true)
  })

  it('rejects view_image without path', () => {
    const r = validateToolArguments('view_image', { description: 'a pic' }, viewImageSchema)
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors[0]).toContain('missing required property "path"')
  })

  it('rejects view_image with extra property', () => {
    const r = validateToolArguments(
      'view_image',
      { path: '/img.png', max_size: 1024 },
      viewImageSchema
    )
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.errors).toContainEqual(expect.stringContaining('unexpected property "max_size"'))
  })
})
