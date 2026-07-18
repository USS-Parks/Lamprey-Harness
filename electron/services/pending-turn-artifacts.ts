import type { ArtifactType } from './artifact-schema'

export interface StoredArtifactAttachment {
  artifactId: string | null
  callId: string
  type: ArtifactType
  title: string
  revision: number | null
  fallbackText: string
  status: 'loading' | 'error' | 'ready'
  error?: string
  createdAt: number
}

const pendingArtifacts = new Map<string, Map<string, StoredArtifactAttachment>>()

export function upsertPendingArtifact(
  correlationId: string | undefined,
  attachment: StoredArtifactAttachment
): void {
  if (!correlationId) return
  const entries = pendingArtifacts.get(correlationId) ?? new Map()
  entries.set(attachment.callId, attachment)
  pendingArtifacts.set(correlationId, entries)
}

export function drainPendingArtifacts(
  correlationId: string | undefined
): StoredArtifactAttachment[] | undefined {
  if (!correlationId) return undefined
  const entries = pendingArtifacts.get(correlationId)
  pendingArtifacts.delete(correlationId)
  if (!entries || entries.size === 0) return undefined
  return [...entries.values()]
}

export function __resetPendingArtifactsForTests(): void {
  pendingArtifacts.clear()
}
