import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendArtifactRevision: vi.fn(),
  createArtifact: vi.fn(),
  createArtifactAnnotation: vi.fn(),
  getArtifact: vi.fn(),
  getArtifactRevision: vi.fn(),
  listArtifactAnnotations: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp' },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./artifact-store', () => mocks)

import './artifact-tool-pack'
import { toolRegistry } from './tool-registry'
import { validateToolArguments } from './tool-schema-validator'

const TOOL_NAMES = [
  'create_visualization',
  'update_visualization',
  'artifact_read',
  'artifact_update',
  'artifact_annotate'
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createArtifact.mockReturnValue({ id: 'artifact-1', currentRevision: 1 })
  mocks.getArtifact.mockReturnValue({
    id: 'artifact-1',
    artifactType: 'mermaid',
    currentRevision: 1
  })
  mocks.getArtifactRevision.mockReturnValue({
    artifactId: 'artifact-1',
    revision: 1,
    content: 'graph TD\nA-->B',
    metadata: { fallbackText: 'A leads to B' }
  })
  mocks.listArtifactAnnotations.mockReturnValue([])
  mocks.appendArtifactRevision.mockReturnValue({ artifactId: 'artifact-1', revision: 2 })
  mocks.createArtifactAnnotation.mockReturnValue({
    id: 'annotation-1',
    artifactId: 'artifact-1',
    revision: 1
  })
})

describe('VA-2 artifact tool pack', () => {
  it('registers five strict lazy tools with honest risk metadata', () => {
    for (const name of TOOL_NAMES) {
      const descriptor = toolRegistry.getById(name)
      expect(descriptor, name).toBeDefined()
      expect(descriptor?.lazy).toBe(true)
      expect(
        (descriptor?.inputSchema as { additionalProperties?: boolean }).additionalProperties
      ).toBe(false)
      expect(toolRegistry.hasHandler(name)).toBe(true)
      if (name === 'artifact_read') {
        expect(descriptor?.risks).toEqual(['read'])
        expect(descriptor?.parallelizable).toBe(true)
        expect(descriptor?.mutates).toBe(false)
      } else {
        expect(descriptor?.risks).toEqual(['write'])
        expect(descriptor?.requiresApproval).toBe(false)
        expect(descriptor?.mutates).toBe(true)
      }
    }
  })

  it('keeps every schema strict and rejects unknown arguments', () => {
    for (const name of TOOL_NAMES) {
      const schema = toolRegistry.getById(name)!.inputSchema
      const result = validateToolArguments(name, { extra: true }, schema)
      expect(result.valid, name).toBe(false)
    }
  })

  it('creates a validated visualization with conversation and tool provenance', async () => {
    const result = await toolRegistry.executeNative(
      'create_visualization',
      {
        type: 'mermaid',
        title: 'Flow',
        content: 'graph TD\nA-->B',
        fallbackText: 'A leads to B'
      },
      {
        conversationId: 'conversation-1',
        model: 'model-1',
        callId: 'call-1',
        correlationId: 'correlation-1'
      }
    )
    expect(JSON.parse(String(result))).toEqual({
      artifactId: 'artifact-1',
      revision: 1,
      type: 'mermaid'
    })
    expect(mocks.createArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        artifactType: 'mermaid',
        sandboxPolicy: 'strict-static',
        actorId: 'model-1',
        provenance: expect.objectContaining({
          toolCallId: 'call-1',
          correlationId: 'correlation-1'
        })
      })
    )
  })

  it('rejects unsafe visualization content before persistence', async () => {
    await expect(
      toolRegistry.executeNative(
        'create_visualization',
        {
          type: 'svg',
          title: 'Unsafe',
          content: '<svg onload="bad()"></svg>',
          fallbackText: 'unsafe'
        },
        { conversationId: 'conversation-1' }
      )
    ).rejects.toThrow(/event-handler/)
    expect(mocks.createArtifact).not.toHaveBeenCalled()
  })

  it('enforces visualization type and optimistic revision identity on updates', async () => {
    await toolRegistry.executeNative(
      'update_visualization',
      {
        artifactId: 'artifact-1',
        expectedRevision: 1,
        content: 'graph TD\nB-->C',
        fallbackText: 'B leads to C'
      },
      { model: 'model-1', callId: 'call-2' }
    )
    expect(mocks.appendArtifactRevision).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'artifact-1', expectedRevision: 1 })
    )

    mocks.getArtifact.mockReturnValue({
      id: 'artifact-2',
      artifactType: 'document',
      currentRevision: 1
    })
    await expect(
      toolRegistry.executeNative(
        'update_visualization',
        {
          artifactId: 'artifact-2',
          expectedRevision: 1,
          content: 'text',
          fallbackText: 'text'
        },
        {}
      )
    ).rejects.toThrow(/not a visualization/)
  })

  it('reads exact revisions and creates exact-range annotations', async () => {
    const read = await toolRegistry.executeNative(
      'artifact_read',
      { artifactId: 'artifact-1', revision: 1 },
      {}
    )
    expect(JSON.parse(String(read))).toMatchObject({
      artifact: { id: 'artifact-1' },
      revision: { revision: 1 },
      annotations: []
    })

    await toolRegistry.executeNative(
      'artifact_annotate',
      {
        artifactId: 'artifact-1',
        revision: 1,
        body: 'Clarify A',
        startOffset: 0,
        endOffset: 1
      },
      { model: 'model-1' }
    )
    expect(mocks.createArtifactAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: 'artifact-1',
        revision: 1,
        startOffset: 0,
        endOffset: 1,
        actorId: 'model-1'
      })
    )
  })
})
