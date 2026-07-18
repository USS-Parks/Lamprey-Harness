import type { ArtifactActivity } from '@/lib/types'
import type { ToolCallState } from '@/stores/chat-store'

const VISUALIZATION_TOOLS = new Set(['create_visualization', 'update_visualization'])
const ARTIFACT_EDIT_TOOLS = new Set([
  'artifact_propose_edit',
  'artifact_update',
  'artifact_annotate'
])

export function activityFromArtifactTool(tool: ToolCallState): ArtifactActivity | null {
  const kind = VISUALIZATION_TOOLS.has(tool.toolName)
    ? 'visualization'
    : ARTIFACT_EDIT_TOOLS.has(tool.toolName)
      ? 'artifact-edit'
      : null
  if (!kind) return null
  const status: ArtifactActivity['status'] =
    tool.status === 'pending'
      ? 'queued'
      : tool.status === 'running'
        ? 'running'
        : tool.status === 'success'
          ? 'complete'
          : 'error'
  return {
    id: `tool:${tool.callId}`,
    kind,
    label: tool.title ?? tool.toolName,
    status,
    detail: tool.result,
    error: status === 'error' ? tool.result : undefined,
    startedAt: tool.startedAt ?? Date.now(),
    finishedAt: status === 'complete' || status === 'error' ? Date.now() : undefined
  }
}

export function assertIpcSuccess<T>(
  result: { success: boolean; data?: T; error?: string },
  fallback: string
): T {
  if (!result.success) throw new Error(result.error ?? fallback)
  return result.data as T
}

export async function runTrackedArtifactActivity<T>(input: {
  id?: string
  kind: ArtifactActivity['kind']
  label: string
  record: (activity: ArtifactActivity) => void
  operation: () => Promise<T>
}): Promise<T> {
  const id = input.id ?? crypto.randomUUID()
  const startedAt = Date.now()
  input.record({ id, kind: input.kind, label: input.label, status: 'queued', startedAt })
  await Promise.resolve()
  input.record({ id, kind: input.kind, label: input.label, status: 'running', startedAt })
  try {
    const result = await input.operation()
    input.record({
      id,
      kind: input.kind,
      label: input.label,
      status: 'complete',
      startedAt,
      finishedAt: Date.now()
    })
    return result
  } catch (error) {
    input.record({
      id,
      kind: input.kind,
      label: input.label,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      finishedAt: Date.now()
    })
    throw error
  }
}
