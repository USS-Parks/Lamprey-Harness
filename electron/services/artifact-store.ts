import { createHash, randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import {
  ARTIFACT_TYPES,
  legacyArtifactId,
  sandboxPolicyForType,
  type ArtifactActorKind,
  type ArtifactSandboxPolicy,
  type ArtifactSourceKind,
  type ArtifactType
} from './artifact-schema'

export interface ArtifactRecord {
  id: string
  conversationId: string | null
  sourceMessageId: string | null
  sourceKind: ArtifactSourceKind
  sourceKey: string | null
  artifactType: ArtifactType
  title: string
  sandboxPolicy: ArtifactSandboxPolicy
  currentRevision: number
  exportFilename: string | null
  exportMimeType: string | null
  exportMetadata: Record<string, unknown>
  provenance: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface ArtifactRevision {
  artifactId: string
  revision: number
  content: string
  contentSha256: string
  sizeBytes: number
  actorKind: ArtifactActorKind
  actorId: string | null
  sourceMessageId: string | null
  metadata: Record<string, unknown>
  createdAt: number
}

export interface ArtifactAnnotation {
  id: string
  artifactId: string
  revision: number
  startOffset: number | null
  endOffset: number | null
  body: string
  actorKind: ArtifactActorKind
  actorId: string | null
  status: 'open' | 'resolved'
  createdAt: number
  updatedAt: number
}

type ArtifactRow = {
  id: string
  conversation_id: string | null
  source_message_id: string | null
  source_kind: ArtifactSourceKind
  source_key: string | null
  artifact_type: ArtifactType
  title: string
  sandbox_policy: ArtifactSandboxPolicy
  current_revision: number
  export_filename: string | null
  export_mime_type: string | null
  export_metadata_json: string
  provenance_json: string
  created_at: number
  updated_at: number
}

type RevisionRow = {
  artifact_id: string
  revision: number
  content: string
  content_sha256: string
  size_bytes: number
  actor_kind: ArtifactActorKind
  actor_id: string | null
  source_message_id: string | null
  metadata_json: string
  created_at: number
}

type AnnotationRow = {
  id: string
  artifact_id: string
  revision: number
  start_offset: number | null
  end_offset: number | null
  body: string
  actor_kind: ArtifactActorKind
  actor_id: string | null
  status: 'open' | 'resolved'
  created_at: number
  updated_at: number
}

function targetDb(database?: Database): Database {
  return database ?? getDb()
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function rowToArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sourceMessageId: row.source_message_id,
    sourceKind: row.source_kind,
    sourceKey: row.source_key,
    artifactType: row.artifact_type,
    title: row.title,
    sandboxPolicy: row.sandbox_policy,
    currentRevision: row.current_revision,
    exportFilename: row.export_filename,
    exportMimeType: row.export_mime_type,
    exportMetadata: parseObject(row.export_metadata_json),
    provenance: parseObject(row.provenance_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowToRevision(row: RevisionRow): ArtifactRevision {
  return {
    artifactId: row.artifact_id,
    revision: row.revision,
    content: row.content,
    contentSha256: row.content_sha256,
    sizeBytes: row.size_bytes,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    sourceMessageId: row.source_message_id,
    metadata: parseObject(row.metadata_json),
    createdAt: row.created_at
  }
}

function rowToAnnotation(row: AnnotationRow): ArtifactAnnotation {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    revision: row.revision,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    body: row.body,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function assertArtifactType(value: string): asserts value is ArtifactType {
  if (!(ARTIFACT_TYPES as readonly string[]).includes(value)) {
    throw new Error(`unsupported artifact type: ${value}`)
  }
}

function assertProvenance(
  db: Database,
  conversationId: string | null | undefined,
  sourceMessageId: string | null | undefined
): void {
  if (sourceMessageId && !conversationId) {
    throw new Error('sourceMessageId requires conversationId')
  }
  if (conversationId) {
    const conversation = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(conversationId)
    if (!conversation) throw new Error(`unknown conversation: ${conversationId}`)
  }
  if (sourceMessageId) {
    const message = db
      .prepare('SELECT conversation_id FROM messages WHERE id = ?')
      .get(sourceMessageId) as { conversation_id: string } | undefined
    if (!message) throw new Error(`unknown source message: ${sourceMessageId}`)
    if (message.conversation_id !== conversationId) {
      throw new Error('source message does not belong to conversation')
    }
  }
}

export function getArtifact(id: string, database?: Database): ArtifactRecord | null {
  const row = targetDb(database).prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
    ArtifactRow | undefined
  return row ? rowToArtifact(row) : null
}

export function findArtifactBySource(
  sourceKind: ArtifactSourceKind,
  sourceKey: string,
  database?: Database
): ArtifactRecord | null {
  const row = targetDb(database)
    .prepare('SELECT * FROM artifacts WHERE source_kind = ? AND source_key = ?')
    .get(sourceKind, sourceKey) as ArtifactRow | undefined
  return row ? rowToArtifact(row) : null
}

export function createArtifact(
  input: {
    id?: string
    conversationId?: string | null
    sourceMessageId?: string | null
    sourceKind?: ArtifactSourceKind
    sourceKey?: string | null
    artifactType: ArtifactType
    title: string
    sandboxPolicy: ArtifactSandboxPolicy
    content: string
    actorKind: ArtifactActorKind
    actorId?: string | null
    exportFilename?: string | null
    exportMimeType?: string | null
    exportMetadata?: Record<string, unknown>
    provenance?: Record<string, unknown>
    revisionMetadata?: Record<string, unknown>
    createdAt?: number
  },
  database?: Database
): ArtifactRecord {
  const db = targetDb(database)
  assertArtifactType(input.artifactType)
  if (!input.title.trim()) throw new Error('artifact title is required')
  assertProvenance(db, input.conversationId, input.sourceMessageId)
  const id = input.id ?? randomUUID()
  const now = input.createdAt ?? Date.now()
  const conversationId = input.conversationId ?? null
  const sourceMessageId = input.sourceMessageId ?? null
  const sourceKind = input.sourceKind ?? 'native'
  const sizeBytes = Buffer.byteLength(input.content, 'utf8')
  const provenance = {
    conversationId,
    messageId: sourceMessageId,
    ...(input.provenance ?? {})
  }
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO artifacts (
        id, conversation_id, source_message_id, source_kind, source_key,
        artifact_type, title, sandbox_policy, current_revision,
        export_filename, export_mime_type, export_metadata_json,
        provenance_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      conversationId,
      sourceMessageId,
      sourceKind,
      input.sourceKey ?? null,
      input.artifactType,
      input.title.trim(),
      input.sandboxPolicy,
      input.exportFilename ?? null,
      input.exportMimeType ?? null,
      JSON.stringify(input.exportMetadata ?? {}),
      JSON.stringify(provenance),
      now,
      now
    )
    db.prepare(
      `INSERT INTO artifact_revisions (
        artifact_id, revision, content, content_sha256, size_bytes,
        actor_kind, actor_id, source_message_id, metadata_json, created_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.content,
      sha256(input.content),
      sizeBytes,
      input.actorKind,
      input.actorId ?? null,
      sourceMessageId,
      JSON.stringify(input.revisionMetadata ?? {}),
      now
    )
  })
  tx()
  return getArtifact(id, db)!
}

export function appendArtifactRevision(
  input: {
    artifactId: string
    expectedRevision: number
    content: string
    actorKind: ArtifactActorKind
    actorId?: string | null
    sourceMessageId?: string | null
    metadata?: Record<string, unknown>
    createdAt?: number
  },
  database?: Database
): ArtifactRevision {
  const db = targetDb(database)
  const now = input.createdAt ?? Date.now()
  let revision = 0
  const tx = db.transaction(() => {
    const artifact = db
      .prepare('SELECT current_revision, conversation_id FROM artifacts WHERE id = ?')
      .get(input.artifactId) as
      { current_revision: number; conversation_id: string | null } | undefined
    if (!artifact) throw new Error(`unknown artifact: ${input.artifactId}`)
    if (artifact.current_revision !== input.expectedRevision) {
      throw new Error(
        `artifact revision conflict: expected ${input.expectedRevision}, current ${artifact.current_revision}`
      )
    }
    if (input.sourceMessageId) {
      assertProvenance(db, artifact.conversation_id, input.sourceMessageId)
    }
    revision = artifact.current_revision + 1
    db.prepare(
      `INSERT INTO artifact_revisions (
        artifact_id, revision, content, content_sha256, size_bytes,
        actor_kind, actor_id, source_message_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.artifactId,
      revision,
      input.content,
      sha256(input.content),
      Buffer.byteLength(input.content, 'utf8'),
      input.actorKind,
      input.actorId ?? null,
      input.sourceMessageId ?? null,
      JSON.stringify(input.metadata ?? {}),
      now
    )
    const updated = db
      .prepare(
        `UPDATE artifacts
            SET current_revision = ?, updated_at = ?
          WHERE id = ? AND current_revision = ?`
      )
      .run(revision, now, input.artifactId, input.expectedRevision)
    if (updated.changes !== 1) throw new Error('artifact revision conflict')
  })
  tx()
  return getArtifactRevision(input.artifactId, revision, db)!
}

export function getArtifactRevision(
  artifactId: string,
  revision: number,
  database?: Database
): ArtifactRevision | null {
  const row = targetDb(database)
    .prepare('SELECT * FROM artifact_revisions WHERE artifact_id = ? AND revision = ?')
    .get(artifactId, revision) as RevisionRow | undefined
  return row ? rowToRevision(row) : null
}

export function listArtifactRevisions(artifactId: string, database?: Database): ArtifactRevision[] {
  const rows = targetDb(database)
    .prepare('SELECT * FROM artifact_revisions WHERE artifact_id = ? ORDER BY revision ASC')
    .all(artifactId) as RevisionRow[]
  return rows.map(rowToRevision)
}

export function createArtifactAnnotation(
  input: {
    id?: string
    artifactId: string
    revision: number
    startOffset?: number | null
    endOffset?: number | null
    body: string
    actorKind: ArtifactActorKind
    actorId?: string | null
    createdAt?: number
  },
  database?: Database
): ArtifactAnnotation {
  const db = targetDb(database)
  const revision = getArtifactRevision(input.artifactId, input.revision, db)
  if (!revision) throw new Error('artifact revision not found')
  if (!input.body.trim()) throw new Error('annotation body is required')
  const start = input.startOffset ?? null
  const end = input.endOffset ?? null
  if ((start === null) !== (end === null)) throw new Error('annotation range must be complete')
  if (
    start !== null &&
    end !== null &&
    (start < 0 || end < start || end > revision.content.length)
  ) {
    throw new Error('annotation range is outside the revision')
  }
  const id = input.id ?? randomUUID()
  const now = input.createdAt ?? Date.now()
  db.prepare(
    `INSERT INTO artifact_annotations (
      id, artifact_id, revision, start_offset, end_offset, body,
      actor_kind, actor_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).run(
    id,
    input.artifactId,
    input.revision,
    start,
    end,
    input.body.trim(),
    input.actorKind,
    input.actorId ?? null,
    now,
    now
  )
  const row = db.prepare('SELECT * FROM artifact_annotations WHERE id = ?').get(id) as AnnotationRow
  return rowToAnnotation(row)
}

export function listArtifactAnnotations(
  artifactId: string,
  revision: number,
  database?: Database
): ArtifactAnnotation[] {
  const rows = targetDb(database)
    .prepare(
      `SELECT * FROM artifact_annotations
        WHERE artifact_id = ? AND revision = ?
        ORDER BY created_at ASC, id ASC`
    )
    .all(artifactId, revision) as AnnotationRow[]
  return rows.map(rowToAnnotation)
}

export function linkArtifactToMessage(
  artifactId: string,
  conversationId: string,
  messageId: string,
  database?: Database
): void {
  const db = targetDb(database)
  assertProvenance(db, conversationId, messageId)
  const result = db
    .prepare(
      `UPDATE artifacts
          SET conversation_id = ?, source_message_id = ?, updated_at = MAX(updated_at, ?)
        WHERE id = ? AND (conversation_id IS NULL OR conversation_id = ?)`
    )
    .run(conversationId, messageId, Date.now(), artifactId, conversationId)
  if (result.changes !== 1) throw new Error(`artifact cannot be linked to message: ${artifactId}`)
  db.prepare(
    `UPDATE artifact_revisions
        SET source_message_id = ?
      WHERE artifact_id = ? AND source_message_id IS NULL`
  ).run(messageId, artifactId)
}

export function mirrorLegacyResearchArtifact(
  input: {
    filename: string
    question: string
    content: string
    createdAt: number
    sizeBytes?: number
  },
  database?: Database
): ArtifactRecord {
  const db = targetDb(database)
  const existing = findArtifactBySource('research', input.filename, db)
  if (existing) return existing
  return createArtifact(
    {
      id: legacyArtifactId('research', input.filename),
      sourceKind: 'research',
      sourceKey: input.filename,
      artifactType: 'research',
      title: input.question || input.filename,
      sandboxPolicy: 'text',
      content: input.content,
      actorKind: 'import',
      exportFilename: input.filename,
      exportMimeType: 'text/markdown',
      exportMetadata: {
        sizeBytes: input.sizeBytes ?? Buffer.byteLength(input.content, 'utf8')
      },
      provenance: { source: 'research-file', filename: input.filename },
      revisionMetadata: { importedFrom: 'research-file' },
      createdAt: input.createdAt
    },
    db
  )
}

export function mirrorEphemeralArtifact(
  type: string,
  content: string,
  database?: Database
): ArtifactRecord {
  assertArtifactType(type)
  const db = targetDb(database)
  const sourceKey = `${type}:${sha256(content)}`
  const existing = findArtifactBySource('ephemeral', sourceKey, db)
  if (existing) return existing
  return createArtifact(
    {
      id: legacyArtifactId('ephemeral', sourceKey),
      sourceKind: 'ephemeral',
      sourceKey,
      artifactType: type,
      title: `Untitled ${type} artifact`,
      sandboxPolicy: sandboxPolicyForType(type),
      content,
      actorKind: 'import',
      exportMetadata: { migratedFrom: 'artifact-sandbox.currentSource' },
      provenance: { source: 'artifact-sandbox.currentSource' },
      revisionMetadata: { importedFrom: 'artifact-sandbox.currentSource' }
    },
    db
  )
}
