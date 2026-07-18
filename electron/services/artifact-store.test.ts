import { beforeEach, describe, expect, it } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { ARTIFACT_SCHEMA_SQL } from './artifact-schema'
import {
  appendArtifactRevision,
  createArtifact,
  createArtifactAnnotation,
  findArtifactBySource,
  getArtifact,
  listArtifactAnnotations,
  listArtifactRevisions,
  mirrorEphemeralArtifact,
  mirrorLegacyResearchArtifact
} from './artifact-store'

const HAS_NATIVE_SQLITE = (() => {
  try {
    const probe = new BetterSqlite3(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

let db: Database

function freshDb(): Database {
  const next = new BetterSqlite3(':memory:')
  next.pragma('foreign_keys = ON')
  next.exec(`
    CREATE TABLE conversations (id TEXT PRIMARY KEY);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
    );
    INSERT INTO conversations (id) VALUES ('conversation-1'), ('conversation-2');
    INSERT INTO messages (id, conversation_id)
      VALUES ('message-1', 'conversation-1'), ('message-2', 'conversation-2');
    ${ARTIFACT_SCHEMA_SQL}
  `)
  return next
}

beforeEach(() => {
  if (HAS_NATIVE_SQLITE) db = freshDb()
})

describe.skipIf(!HAS_NATIVE_SQLITE)('VA-1 artifact native store', () => {
  it('creates a provenance-bound artifact with an immutable first revision', () => {
    const artifact = createArtifact(
      {
        id: 'artifact-1',
        conversationId: 'conversation-1',
        sourceMessageId: 'message-1',
        artifactType: 'markdown',
        title: 'Plan',
        sandboxPolicy: 'text',
        content: '# Plan',
        actorKind: 'assistant',
        actorId: 'model-1',
        exportFilename: 'plan.md',
        exportMimeType: 'text/markdown'
      },
      db
    )
    expect(artifact.currentRevision).toBe(1)
    expect(artifact.provenance).toMatchObject({
      conversationId: 'conversation-1',
      messageId: 'message-1'
    })
    expect(listArtifactRevisions('artifact-1', db)).toMatchObject([
      { revision: 1, content: '# Plan', actorKind: 'assistant', actorId: 'model-1' }
    ])
    expect(() =>
      db
        .prepare(
          "UPDATE artifact_revisions SET content = 'changed' WHERE artifact_id = 'artifact-1'"
        )
        .run()
    ).toThrow(/immutable/)
  })

  it('rejects mismatched conversation/message provenance', () => {
    expect(() =>
      createArtifact(
        {
          conversationId: 'conversation-1',
          sourceMessageId: 'message-2',
          artifactType: 'document',
          title: 'Bad provenance',
          sandboxPolicy: 'text',
          content: 'x',
          actorKind: 'system'
        },
        db
      )
    ).toThrow(/does not belong/)
  })

  it('appends revisions atomically, retains history, and rejects stale writers', () => {
    createArtifact(
      {
        id: 'artifact-1',
        artifactType: 'code',
        title: 'Example',
        sandboxPolicy: 'text',
        content: 'const value = 1',
        actorKind: 'assistant'
      },
      db
    )
    const second = appendArtifactRevision(
      {
        artifactId: 'artifact-1',
        expectedRevision: 1,
        content: 'const value = 2',
        actorKind: 'user',
        actorId: 'owner'
      },
      db
    )
    expect(second.revision).toBe(2)
    expect(getArtifact('artifact-1', db)?.currentRevision).toBe(2)
    expect(listArtifactRevisions('artifact-1', db).map((row) => row.content)).toEqual([
      'const value = 1',
      'const value = 2'
    ])
    expect(() =>
      appendArtifactRevision(
        {
          artifactId: 'artifact-1',
          expectedRevision: 1,
          content: 'stale',
          actorKind: 'user'
        },
        db
      )
    ).toThrow(/revision conflict/)
    expect(listArtifactRevisions('artifact-1', db)).toHaveLength(2)
  })

  it('binds annotations to exact revision ranges and actor provenance', () => {
    createArtifact(
      {
        id: 'artifact-1',
        artifactType: 'markdown',
        title: 'Plan',
        sandboxPolicy: 'text',
        content: 'alpha beta',
        actorKind: 'assistant'
      },
      db
    )
    const annotation = createArtifactAnnotation(
      {
        id: 'annotation-1',
        artifactId: 'artifact-1',
        revision: 1,
        startOffset: 0,
        endOffset: 5,
        body: 'Revise this',
        actorKind: 'user',
        actorId: 'owner'
      },
      db
    )
    expect(annotation).toMatchObject({
      revision: 1,
      startOffset: 0,
      endOffset: 5,
      actorKind: 'user',
      actorId: 'owner'
    })
    expect(listArtifactAnnotations('artifact-1', 1, db)).toHaveLength(1)
    expect(() =>
      createArtifactAnnotation(
        {
          artifactId: 'artifact-1',
          revision: 1,
          startOffset: 0,
          endOffset: 100,
          body: 'outside',
          actorKind: 'user'
        },
        db
      )
    ).toThrow(/outside/)
  })

  it('retains revisions and immutable origin after transcript deletion', () => {
    createArtifact(
      {
        id: 'artifact-1',
        conversationId: 'conversation-1',
        sourceMessageId: 'message-1',
        artifactType: 'markdown',
        title: 'Retained',
        sandboxPolicy: 'text',
        content: 'keep',
        actorKind: 'assistant'
      },
      db
    )
    db.prepare('DELETE FROM conversations WHERE id = ?').run('conversation-1')
    expect(getArtifact('artifact-1', db)).toMatchObject({
      conversationId: null,
      sourceMessageId: null,
      provenance: { conversationId: 'conversation-1', messageId: 'message-1' }
    })
    expect(listArtifactRevisions('artifact-1', db)).toHaveLength(1)
  })

  it('mirrors research files and ephemeral previews idempotently', () => {
    const research = mirrorLegacyResearchArtifact(
      {
        filename: 'research-fusion-10.md',
        question: 'fusion',
        content: '# Fusion',
        createdAt: 10,
        sizeBytes: 8
      },
      db
    )
    expect(research).toMatchObject({
      sourceKind: 'research',
      artifactType: 'research',
      exportFilename: 'research-fusion-10.md'
    })
    expect(
      mirrorLegacyResearchArtifact(
        {
          filename: 'research-fusion-10.md',
          question: 'fusion',
          content: '# Fusion',
          createdAt: 10
        },
        db
      ).id
    ).toBe(research.id)

    const preview = mirrorEphemeralArtifact('mermaid', 'graph TD; A-->B', db)
    expect(preview).toMatchObject({
      sourceKind: 'ephemeral',
      artifactType: 'mermaid',
      sandboxPolicy: 'strict-static'
    })
    expect(mirrorEphemeralArtifact('mermaid', 'graph TD; A-->B', db).id).toBe(preview.id)
    expect(findArtifactBySource('research', 'research-fusion-10.md', db)?.id).toBe(research.id)
    expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get()).toEqual({ count: 2 })
  })
})
