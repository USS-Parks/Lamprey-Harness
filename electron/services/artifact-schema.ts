import { createHash } from 'crypto'
import type { Database } from 'better-sqlite3'

export const ARTIFACT_TYPES = [
  'document',
  'markdown',
  'code',
  'mermaid',
  'chart',
  'table',
  'html',
  'svg',
  'jsx',
  'react',
  'research'
] as const

export type ArtifactType = (typeof ARTIFACT_TYPES)[number]
export type ArtifactSandboxPolicy = 'text' | 'strict-static' | 'strict-interactive'
export type ArtifactSourceKind = 'native' | 'document' | 'research' | 'ephemeral'
export type ArtifactActorKind = 'user' | 'assistant' | 'system' | 'import'

/**
 * VA-1 artifact ledger. This exact SQL is shared with the node:sqlite test.
 * Legacy document/research sources remain canonical; these tables add stable
 * identity, immutable revisions, annotations, and export/provenance metadata.
 */
export const ARTIFACT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS artifacts (
    id                   TEXT PRIMARY KEY,
    conversation_id      TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    source_message_id    TEXT REFERENCES messages(id) ON DELETE SET NULL,
    source_kind          TEXT NOT NULL CHECK(source_kind IN ('native','document','research','ephemeral')),
    source_key           TEXT,
    artifact_type        TEXT NOT NULL CHECK(artifact_type IN ('document','markdown','code','mermaid','chart','table','html','svg','jsx','react','research')),
    title                TEXT NOT NULL,
    sandbox_policy       TEXT NOT NULL CHECK(sandbox_policy IN ('text','strict-static','strict-interactive')),
    current_revision     INTEGER NOT NULL DEFAULT 1 CHECK(current_revision >= 1),
    export_filename      TEXT,
    export_mime_type     TEXT,
    export_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(export_metadata_json)),
    provenance_json      TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provenance_json)),
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_source
    ON artifacts(source_kind, source_key)
    WHERE source_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_artifacts_conversation
    ON artifacts(conversation_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_artifacts_message
    ON artifacts(source_message_id);

  CREATE TABLE IF NOT EXISTS artifact_revisions (
    artifact_id       TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    revision          INTEGER NOT NULL CHECK(revision >= 1),
    content           TEXT NOT NULL,
    content_sha256    TEXT NOT NULL CHECK(length(content_sha256) = 64),
    size_bytes        INTEGER NOT NULL CHECK(size_bytes >= 0),
    actor_kind        TEXT NOT NULL CHECK(actor_kind IN ('user','assistant','system','import')),
    actor_id          TEXT,
    source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    metadata_json     TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
    created_at        INTEGER NOT NULL,
    PRIMARY KEY (artifact_id, revision)
  );

  CREATE INDEX IF NOT EXISTS idx_artifact_revisions_created
    ON artifact_revisions(artifact_id, created_at DESC);

  CREATE TRIGGER IF NOT EXISTS artifact_revisions_immutable
    BEFORE UPDATE OF artifact_id, revision, content, content_sha256, size_bytes,
      actor_kind, actor_id, metadata_json, created_at ON artifact_revisions
    BEGIN
      SELECT RAISE(ABORT, 'artifact revisions are immutable');
    END;

  CREATE TRIGGER IF NOT EXISTS artifact_current_revision_monotonic
    BEFORE UPDATE OF current_revision ON artifacts
    WHEN NEW.current_revision < OLD.current_revision
    BEGIN
      SELECT RAISE(ABORT, 'artifact current revision cannot move backwards');
    END;

  CREATE TRIGGER IF NOT EXISTS artifact_current_revision_exists
    BEFORE UPDATE OF current_revision ON artifacts
    WHEN NEW.current_revision > OLD.current_revision
      AND NOT EXISTS (
        SELECT 1 FROM artifact_revisions
         WHERE artifact_id = NEW.id AND revision = NEW.current_revision
      )
    BEGIN
      SELECT RAISE(ABORT, 'artifact current revision does not exist');
    END;

  CREATE TABLE IF NOT EXISTS artifact_annotations (
    id             TEXT PRIMARY KEY,
    artifact_id    TEXT NOT NULL,
    revision       INTEGER NOT NULL CHECK(revision >= 1),
    start_offset   INTEGER,
    end_offset     INTEGER,
    body           TEXT NOT NULL,
    actor_kind     TEXT NOT NULL CHECK(actor_kind IN ('user','assistant','system','import')),
    actor_id       TEXT,
    status         TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    CHECK(
      (start_offset IS NULL AND end_offset IS NULL) OR
      (start_offset IS NOT NULL AND end_offset IS NOT NULL AND start_offset >= 0 AND end_offset >= start_offset)
    ),
    FOREIGN KEY (artifact_id, revision)
      REFERENCES artifact_revisions(artifact_id, revision) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_artifact_annotations_revision
    ON artifact_annotations(artifact_id, revision, created_at ASC);
`

type LegacyDocument = {
  id: string
  name: string
  mimeType: string
  content: string
  sizeBytes?: number
  createdAt?: number
}

type LegacyDocumentRow = {
  id: string
  conversation_id: string
  documents: string
  created_at: number
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function legacyArtifactId(sourceKind: ArtifactSourceKind, sourceKey: string): string {
  return `artifact-${sourceKind}-${sha256(sourceKey)}`
}

export function inferArtifactType(mimeType: string, filename = ''): ArtifactType {
  const mime = mimeType.toLowerCase()
  const name = filename.toLowerCase()
  if (mime === 'text/markdown' || name.endsWith('.md')) return 'markdown'
  if (mime === 'text/html' || name.endsWith('.html') || name.endsWith('.htm')) return 'html'
  if (mime === 'image/svg+xml' || name.endsWith('.svg')) return 'svg'
  if (
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('python') ||
    mime.startsWith('text/x-') ||
    /\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|swift|rb|php|cs|cpp|c|h|css|sql|sh|ps1)$/i.test(name)
  ) {
    return 'code'
  }
  return 'document'
}

export function sandboxPolicyForType(type: ArtifactType): ArtifactSandboxPolicy {
  if (type === 'html' || type === 'jsx' || type === 'react') return 'strict-interactive'
  if (type === 'svg' || type === 'mermaid' || type === 'chart') return 'strict-static'
  return 'text'
}

function isLegacyDocument(value: unknown): value is LegacyDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LegacyDocument>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.mimeType === 'string' &&
    candidate.mimeType.length > 0 &&
    typeof candidate.content === 'string'
  )
}

/**
 * Backfill message-row documents into the additive ledger. The source JSON is
 * never rewritten or cleared, and malformed legacy entries remain untouched.
 * Deterministic IDs plus INSERT OR IGNORE make retry/re-entry idempotent.
 */
export function migrateLegacyDocumentArtifacts(db: Database): number {
  const messageColumns = new Set(
    (db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  )
  if (
    !messageColumns.has('conversation_id') ||
    !messageColumns.has('documents') ||
    !messageColumns.has('created_at')
  ) {
    return 0
  }
  const rows = db
    .prepare(
      `SELECT id, conversation_id, documents, created_at
         FROM messages
        WHERE documents IS NOT NULL AND documents <> ''`
    )
    .all() as LegacyDocumentRow[]
  const insertArtifact = db.prepare(`
    INSERT OR IGNORE INTO artifacts (
      id, conversation_id, source_message_id, source_kind, source_key,
      artifact_type, title, sandbox_policy, current_revision,
      export_filename, export_mime_type, export_metadata_json,
      provenance_json, created_at, updated_at
    ) VALUES (?, ?, ?, 'document', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `)
  const insertRevision = db.prepare(`
    INSERT OR IGNORE INTO artifact_revisions (
      artifact_id, revision, content, content_sha256, size_bytes,
      actor_kind, actor_id, source_message_id, metadata_json, created_at
    ) VALUES (?, 1, ?, ?, ?, 'import', NULL, ?, ?, ?)
  `)
  let imported = 0

  for (const row of rows) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.documents)
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue
    for (const value of parsed) {
      if (!isLegacyDocument(value)) continue
      const sourceKey = `${row.id}:${value.id}`
      const artifactId = legacyArtifactId('document', sourceKey)
      const type = inferArtifactType(value.mimeType, value.name)
      const createdAt =
        typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
          ? value.createdAt
          : row.created_at
      const sizeBytes = Buffer.byteLength(value.content, 'utf8')
      const result = insertArtifact.run(
        artifactId,
        row.conversation_id,
        row.id,
        sourceKey,
        type,
        value.name,
        sandboxPolicyForType(type),
        value.name,
        value.mimeType,
        JSON.stringify({ legacyDocumentId: value.id, sizeBytes }),
        JSON.stringify({
          source: 'messages.documents',
          conversationId: row.conversation_id,
          messageId: row.id,
          legacyDocumentId: value.id
        }),
        createdAt,
        createdAt
      )
      insertRevision.run(
        artifactId,
        value.content,
        sha256(value.content),
        sizeBytes,
        row.id,
        JSON.stringify({ importedFrom: 'messages.documents' }),
        createdAt
      )
      if (result.changes > 0) imported++
    }
  }
  return imported
}

export function applyArtifactSchema(db: Database): number {
  db.exec(ARTIFACT_SCHEMA_SQL)
  return migrateLegacyDocumentArtifacts(db)
}
