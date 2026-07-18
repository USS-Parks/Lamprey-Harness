import { randomUUID } from 'crypto'
import { toolRegistry, type ToolExecutionContext } from './tool-registry'
import {
  appendArtifactRevision,
  createArtifact,
  createArtifactAnnotation,
  getArtifact,
  getArtifactRevision,
  listArtifactAnnotations
} from './artifact-store'
import {
  isVisualizationType,
  validateAnnotationBody,
  validateArtifactContent,
  validateVisualizationFallback,
  VISUALIZATION_TYPES,
  type VisualizationType
} from './artifact-content-validator'
import { sandboxPolicyForType, type ArtifactType } from './artifact-schema'
import { emitChatEvent } from './chat-events'
import { upsertPendingArtifact, type StoredArtifactAttachment } from './pending-turn-artifacts'
import { createArtifactEditProposal } from './artifact-edit-store'

const VISUALIZATION_ENUM = [...VISUALIZATION_TYPES]

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value
}

function requiredInteger(args: Record<string, unknown>, name: string): number {
  const value = args[name]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`)
  }
  return value
}

function extensionFor(type: VisualizationType): string {
  if (type === 'mermaid') return 'mmd'
  if (type === 'chart' || type === 'table') return 'json'
  if (type === 'react') return 'jsx'
  return type
}

function publishVisualizationState(
  ctx: ToolExecutionContext,
  visualization: StoredArtifactAttachment
): void {
  upsertPendingArtifact(ctx.correlationId, visualization)
  if (ctx.conversationId) {
    emitChatEvent('chat:visualization-state', {
      conversationId: ctx.conversationId,
      visualization
    })
  }
}

function readArtifactResult(artifactId: string, revisionNumber?: number): string {
  const artifact = getArtifact(artifactId)
  if (!artifact) throw new Error(`unknown artifact: ${artifactId}`)
  const revision = getArtifactRevision(artifactId, revisionNumber ?? artifact.currentRevision)
  if (!revision) throw new Error(`unknown artifact revision: ${artifactId}@${revisionNumber}`)
  return JSON.stringify({
    artifact,
    revision,
    annotations: listArtifactAnnotations(artifactId, revision.revision)
  })
}

toolRegistry.registerNative(
  {
    id: 'artifact_propose_edit',
    name: 'artifact_propose_edit',
    title: 'Propose artifact edit',
    description:
      'Propose a replacement for one exact artifact revision range. The user previews and accepts or rejects it; this tool does not change the current revision.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifactId: { type: 'string', description: 'Stable artifact id.' },
        expectedRevision: { type: 'number', description: 'Exact base revision.' },
        startOffset: { type: 'number', description: 'Inclusive UTF-16 start offset.' },
        endOffset: { type: 'number', description: 'Exclusive UTF-16 end offset.' },
        replacement: { type: 'string', description: 'Replacement source for the selected range.' },
        rationale: { type: 'string', description: 'Short explanation shown in the diff preview.' }
      },
      required: ['artifactId', 'expectedRevision', 'startOffset', 'endOffset', 'replacement']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true,
    lazy: true
  },
  async (args, ctx) => {
    const proposal = createArtifactEditProposal({
      artifactId: requiredString(args, 'artifactId'),
      baseRevision: requiredInteger(args, 'expectedRevision'),
      startOffset: requiredInteger(args, 'startOffset'),
      endOffset: requiredInteger(args, 'endOffset'),
      replacement: typeof args.replacement === 'string' ? args.replacement : '',
      rationale: typeof args.rationale === 'string' ? args.rationale : null,
      actorKind: 'assistant',
      actorId: ctx.model ?? null
    })
    if (ctx.conversationId) {
      emitChatEvent('chat:artifact-edit-proposed', {
        conversationId: ctx.conversationId,
        proposal
      })
    }
    return JSON.stringify(proposal)
  }
)

toolRegistry.registerNative(
  {
    id: 'create_visualization',
    name: 'create_visualization',
    title: 'Create visualization',
    description:
      'Create a persistent Mermaid, chart, table, SVG, HTML, JSX, or React visualization with an accessible text fallback. Returns a stable artifact id and revision.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: VISUALIZATION_ENUM, description: 'Visualization type.' },
        title: { type: 'string', description: 'Short user-facing title.' },
        content: { type: 'string', description: 'Type-specific visualization source.' },
        fallbackText: {
          type: 'string',
          description: 'Accessible text equivalent containing the important facts.'
        },
        exportFilename: {
          type: 'string',
          description: 'Optional filename used by export actions.'
        }
      },
      required: ['type', 'title', 'content', 'fallbackText']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true,
    lazy: true
  },
  async (args, ctx) => {
    const type = requiredString(args, 'type') as ArtifactType
    if (!isVisualizationType(type)) throw new Error(`unsupported visualization type: ${type}`)
    const title = requiredString(args, 'title').slice(0, 200)
    const content = requiredString(args, 'content')
    const fallbackText = requiredString(args, 'fallbackText')
    if (!ctx.conversationId) throw new Error('create_visualization requires a conversation')
    const callId = ctx.callId ?? randomUUID()
    const createdAt = Date.now()
    publishVisualizationState(ctx, {
      artifactId: null,
      callId,
      type,
      title,
      revision: null,
      fallbackText,
      status: 'loading',
      createdAt
    })
    try {
      validateArtifactContent(type, content)
      validateVisualizationFallback(fallbackText)
      const artifact = createArtifact({
        conversationId: ctx.conversationId,
        sourceKind: 'native',
        artifactType: type,
        title,
        sandboxPolicy: sandboxPolicyForType(type),
        content,
        actorKind: 'assistant',
        actorId: ctx.model ?? null,
        exportFilename:
          typeof args.exportFilename === 'string' && args.exportFilename.trim()
            ? args.exportFilename.trim().slice(0, 240)
            : `${title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'visualization'}.${extensionFor(type)}`,
        exportMimeType:
          type === 'svg'
            ? 'image/svg+xml'
            : type === 'html'
              ? 'text/html'
              : type === 'chart' || type === 'table'
                ? 'application/json'
                : 'text/plain',
        exportMetadata: { visualization: true, fallbackText },
        provenance: {
          source: 'create_visualization',
          toolCallId: ctx.callId ?? null,
          correlationId: ctx.correlationId ?? null
        },
        revisionMetadata: { fallbackText }
      })
      publishVisualizationState(ctx, {
        artifactId: artifact.id,
        callId,
        type,
        title,
        revision: artifact.currentRevision,
        fallbackText,
        status: 'ready',
        createdAt
      })
      return JSON.stringify({ artifactId: artifact.id, revision: artifact.currentRevision, type })
    } catch (err) {
      publishVisualizationState(ctx, {
        artifactId: null,
        callId,
        type,
        title,
        revision: null,
        fallbackText,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        createdAt
      })
      throw err
    }
  }
)

toolRegistry.registerNative(
  {
    id: 'update_visualization',
    name: 'update_visualization',
    title: 'Update visualization',
    description:
      'Append a validated revision to an existing visualization. expectedRevision is required and stale writers fail closed.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifactId: { type: 'string', description: 'Stable artifact id.' },
        expectedRevision: {
          type: 'number',
          description: 'Current revision expected by the caller.'
        },
        content: { type: 'string', description: 'Replacement visualization source.' },
        fallbackText: { type: 'string', description: 'Updated accessible text equivalent.' }
      },
      required: ['artifactId', 'expectedRevision', 'content', 'fallbackText']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true,
    lazy: true
  },
  async (args, ctx) => {
    const artifactId = requiredString(args, 'artifactId')
    const artifact = getArtifact(artifactId)
    if (!artifact) throw new Error(`unknown artifact: ${artifactId}`)
    if (!isVisualizationType(artifact.artifactType)) {
      throw new Error(`artifact is not a visualization: ${artifactId}`)
    }
    const content = requiredString(args, 'content')
    const fallbackText = requiredString(args, 'fallbackText')
    const callId = ctx.callId ?? randomUUID()
    const createdAt = Date.now()
    publishVisualizationState(ctx, {
      artifactId,
      callId,
      type: artifact.artifactType,
      title: artifact.title,
      revision: artifact.currentRevision,
      fallbackText,
      status: 'loading',
      createdAt
    })
    try {
      validateArtifactContent(artifact.artifactType, content)
      validateVisualizationFallback(fallbackText)
      const revision = appendArtifactRevision({
        artifactId,
        expectedRevision: requiredInteger(args, 'expectedRevision'),
        content,
        actorKind: 'assistant',
        actorId: ctx.model ?? null,
        metadata: { fallbackText, toolCallId: ctx.callId ?? null }
      })
      publishVisualizationState(ctx, {
        artifactId,
        callId,
        type: artifact.artifactType,
        title: artifact.title,
        revision: revision.revision,
        fallbackText,
        status: 'ready',
        createdAt
      })
      return JSON.stringify({ artifactId, revision: revision.revision })
    } catch (err) {
      publishVisualizationState(ctx, {
        artifactId,
        callId,
        type: artifact.artifactType,
        title: artifact.title,
        revision: artifact.currentRevision,
        fallbackText,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        createdAt
      })
      throw err
    }
  }
)

toolRegistry.registerNative(
  {
    id: 'artifact_read',
    name: 'artifact_read',
    title: 'Read artifact',
    description:
      'Read artifact metadata, one immutable revision, and its annotations. Defaults to the current revision.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifactId: { type: 'string', description: 'Stable artifact id.' },
        revision: { type: 'number', description: 'Optional revision number; current when omitted.' }
      },
      required: ['artifactId']
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    parallelizable: true,
    mutates: false,
    lazy: true
  },
  async (args) =>
    readArtifactResult(
      requiredString(args, 'artifactId'),
      args.revision === undefined ? undefined : requiredInteger(args, 'revision')
    )
)

toolRegistry.registerNative(
  {
    id: 'artifact_update',
    name: 'artifact_update',
    title: 'Update artifact',
    description:
      'Append a validated immutable revision to any artifact. expectedRevision prevents lost updates.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifactId: { type: 'string', description: 'Stable artifact id.' },
        expectedRevision: {
          type: 'number',
          description: 'Current revision expected by the caller.'
        },
        content: { type: 'string', description: 'Complete replacement content.' },
        note: { type: 'string', description: 'Optional short revision note.' }
      },
      required: ['artifactId', 'expectedRevision', 'content']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true,
    lazy: true
  },
  async (args, ctx) => {
    const artifactId = requiredString(args, 'artifactId')
    const artifact = getArtifact(artifactId)
    if (!artifact) throw new Error(`unknown artifact: ${artifactId}`)
    const content = requiredString(args, 'content')
    validateArtifactContent(artifact.artifactType, content)
    const revision = appendArtifactRevision({
      artifactId,
      expectedRevision: requiredInteger(args, 'expectedRevision'),
      content,
      actorKind: 'assistant',
      actorId: ctx.model ?? null,
      metadata: {
        note: typeof args.note === 'string' ? args.note.trim().slice(0, 500) : null,
        toolCallId: ctx.callId ?? null
      }
    })
    return JSON.stringify({ artifactId, revision: revision.revision })
  }
)

toolRegistry.registerNative(
  {
    id: 'artifact_annotate',
    name: 'artifact_annotate',
    title: 'Annotate artifact',
    description:
      'Attach a durable note to an exact artifact revision and optional character range.',
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifactId: { type: 'string', description: 'Stable artifact id.' },
        revision: { type: 'number', description: 'Exact revision being annotated.' },
        body: { type: 'string', description: 'Annotation text.' },
        startOffset: { type: 'number', description: 'Optional zero-based range start.' },
        endOffset: { type: 'number', description: 'Optional exclusive range end.' }
      },
      required: ['artifactId', 'revision', 'body']
    },
    risks: ['write'],
    requiresApproval: false,
    enabled: true,
    mutates: true,
    lazy: true
  },
  async (args, ctx) => {
    const body = requiredString(args, 'body')
    validateAnnotationBody(body)
    const startOffset = args.startOffset === undefined ? null : requiredInteger(args, 'startOffset')
    const endOffset = args.endOffset === undefined ? null : requiredInteger(args, 'endOffset')
    const annotation = createArtifactAnnotation({
      artifactId: requiredString(args, 'artifactId'),
      revision: requiredInteger(args, 'revision'),
      startOffset,
      endOffset,
      body,
      actorKind: 'assistant',
      actorId: ctx.model ?? null
    })
    return JSON.stringify({
      annotationId: annotation.id,
      artifactId: annotation.artifactId,
      revision: annotation.revision
    })
  }
)
