import { beforeEach, describe, expect, it } from 'vitest'
import {
  ARTIFACT_SCHEMA_SQL,
  legacyArtifactId,
  migrateLegacyDocumentArtifacts
} from './artifact-schema'

type DB = {
  exec(sql: string): void
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number | bigint }
    get(...args: unknown[]): Record<string, unknown> | undefined
    all(...args: unknown[]): Record<string, unknown>[]
  }
}

let DatabaseSync: (new (path: string) => DB) | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseSync = (require('node:sqlite') as { DatabaseSync: new (path: string) => DB }).DatabaseSync
} catch {
  DatabaseSync = null
}

const hasNodeSqlite = !!DatabaseSync
let db: DB

function insertArtifact(id = 'artifact-1'): void {
  db.prepare(
    `INSERT INTO artifacts (
      id, conversation_id, source_message_id, source_kind, source_key,
      artifact_type, title, sandbox_policy, current_revision,
      export_metadata_json, provenance_json, created_at, updated_at
    ) VALUES (?, 'conversation-1', 'message-1', 'native', ?,
      'markdown', 'Plan', 'text', 1, '{}', ?, 10, 10)`
  ).run(id, id, JSON.stringify({ conversationId: 'conversation-1', messageId: 'message-1' }))
  db.prepare(
    `INSERT INTO artifact_revisions (
      artifact_id, revision, content, content_sha256, size_bytes,
      actor_kind, source_message_id, metadata_json, created_at
    ) VALUES (?, 1, '# Plan', ?, 6, 'assistant', 'message-1', '{}', 10)`
  ).run(id, 'a'.repeat(64))
}

beforeEach(() => {
  if (!hasNodeSqlite) return
  db = new DatabaseSync!(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE conversations (id TEXT PRIMARY KEY);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      documents TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO conversations (id) VALUES ('conversation-1');
    INSERT INTO messages (id, conversation_id, created_at)
      VALUES ('message-1', 'conversation-1', 10);
    ${ARTIFACT_SCHEMA_SQL}
  `)
})

describe('VA-1 artifact schema under node:sqlite', () => {
  it('has node:sqlite available in this runtime', () => {
    expect(hasNodeSqlite).toBe(true)
  })

  it.skipIf(!hasNodeSqlite)('creates the exact production tables and indexes', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name")
      .all()
      .map((row) => row.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'artifacts',
        'artifact_revisions',
        'artifact_annotations',
        'idx_artifacts_source',
        'idx_artifacts_conversation',
        'idx_artifact_annotations_revision'
      ])
    )
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all()
      .map((row) => row.name)
    expect(triggers).toEqual(
      expect.arrayContaining([
        'artifact_revisions_immutable',
        'artifact_current_revision_monotonic',
        'artifact_current_revision_exists'
      ])
    )
  })

  it.skipIf(!hasNodeSqlite)('enforces type, sandbox, revision, JSON, and range constraints', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO artifacts (
            id, source_kind, artifact_type, title, sandbox_policy,
            export_metadata_json, provenance_json, created_at, updated_at
          ) VALUES ('bad-type','native','video','x','text','{}','{}',1,1)`
        )
        .run()
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO artifacts (
            id, source_kind, artifact_type, title, sandbox_policy,
            export_metadata_json, provenance_json, created_at, updated_at
          ) VALUES ('bad-json','native','markdown','x','text','{','{}',1,1)`
        )
        .run()
    ).toThrow()
    insertArtifact()
    expect(() =>
      db
        .prepare(
          "UPDATE artifact_revisions SET content = 'changed' WHERE artifact_id = 'artifact-1'"
        )
        .run()
    ).toThrow(/immutable/)
    expect(() =>
      db.prepare("UPDATE artifacts SET current_revision = 2 WHERE id = 'artifact-1'").run()
    ).toThrow(/does not exist/)
    expect(() =>
      db
        .prepare(
          `INSERT INTO artifact_annotations (
            id, artifact_id, revision, start_offset, end_offset, body,
            actor_kind, created_at, updated_at
          ) VALUES ('bad-range','artifact-1',1,5,2,'x','user',1,1)`
        )
        .run()
    ).toThrow()
    expect(() =>
      db
        .prepare(
          `INSERT INTO artifact_annotations (
            id, artifact_id, revision, body, actor_kind, created_at, updated_at
          ) VALUES ('bad-revision','artifact-1',2,'x','user',1,1)`
        )
        .run()
    ).toThrow()
  })

  it.skipIf(!hasNodeSqlite)(
    'retains artifact history while nulling live transcript links and preserving provenance',
    () => {
      insertArtifact()
      db.prepare(
        `INSERT INTO artifact_annotations (
          id, artifact_id, revision, body, actor_kind, created_at, updated_at
        ) VALUES ('annotation-1','artifact-1',1,'keep this','user',11,11)`
      ).run()
      db.prepare("DELETE FROM conversations WHERE id = 'conversation-1'").run()
      expect(
        db
          .prepare(
            'SELECT conversation_id, source_message_id, provenance_json FROM artifacts WHERE id = ?'
          )
          .get('artifact-1')
      ).toEqual({
        conversation_id: null,
        source_message_id: null,
        provenance_json: JSON.stringify({
          conversationId: 'conversation-1',
          messageId: 'message-1'
        })
      })
      expect(db.prepare('SELECT COUNT(*) AS count FROM artifact_revisions').get()!.count).toBe(1)
      expect(db.prepare('SELECT COUNT(*) AS count FROM artifact_annotations').get()!.count).toBe(1)
    }
  )

  it.skipIf(!hasNodeSqlite)(
    'backfills valid message documents idempotently without modifying legacy JSON',
    () => {
      const documents = JSON.stringify([
        {
          id: 'document-1',
          name: 'plan.md',
          mimeType: 'text/markdown',
          content: '# Imported',
          sizeBytes: 10,
          createdAt: 20
        }
      ])
      db.prepare('UPDATE messages SET documents = ? WHERE id = ?').run(documents, 'message-1')
      expect(migrateLegacyDocumentArtifacts(db as never)).toBe(1)
      expect(migrateLegacyDocumentArtifacts(db as never)).toBe(0)
      expect(
        db.prepare('SELECT documents FROM messages WHERE id = ?').get('message-1')!.documents
      ).toBe(documents)
      const artifactId = legacyArtifactId('document', 'message-1:document-1')
      expect(
        db
          .prepare(
            `SELECT id, artifact_type, current_revision, export_filename
               FROM artifacts WHERE id = ?`
          )
          .get(artifactId)
      ).toEqual({
        id: artifactId,
        artifact_type: 'markdown',
        current_revision: 1,
        export_filename: 'plan.md'
      })
      expect(
        db
          .prepare('SELECT content, actor_kind FROM artifact_revisions WHERE artifact_id = ?')
          .get(artifactId)
      ).toEqual({ content: '# Imported', actor_kind: 'import' })
    }
  )

  it.skipIf(!hasNodeSqlite)('ignores malformed legacy document JSON without losing it', () => {
    db.prepare('UPDATE messages SET documents = ? WHERE id = ?').run('{broken', 'message-1')
    expect(migrateLegacyDocumentArtifacts(db as never)).toBe(0)
    expect(
      db.prepare('SELECT documents FROM messages WHERE id = ?').get('message-1')!.documents
    ).toBe('{broken')
  })
})
