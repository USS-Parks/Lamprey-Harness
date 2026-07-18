import { beforeEach, describe, expect, it } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'
import { ARTIFACT_SCHEMA_SQL } from './artifact-schema'
import { ARTIFACT_EDIT_SCHEMA_SQL } from './artifact-edit-schema'
import {
  acceptArtifactEditProposal,
  createArtifactEditProposal,
  getArtifactEditProposal,
  rejectArtifactEditProposal
} from './artifact-edit-store'
import { createArtifact, getArtifact, listArtifactRevisions } from './artifact-store'

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

beforeEach(() => {
  if (!HAS_NATIVE_SQLITE) return
  db = new BetterSqlite3(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE conversations (id TEXT PRIMARY KEY);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
    );
    ${ARTIFACT_SCHEMA_SQL}
    ${ARTIFACT_EDIT_SCHEMA_SQL}
  `)
  createArtifact(
    {
      id: 'artifact-1',
      artifactType: 'code',
      title: 'example.ts',
      sandboxPolicy: 'text',
      content: 'alpha beta',
      actorKind: 'assistant'
    },
    db
  )
})

describe.skipIf(!HAS_NATIVE_SQLITE)('VA-4 immutable artifact edit proposals', () => {
  it('previews an exact range without changing the current revision', () => {
    const proposal = createArtifactEditProposal(
      {
        id: 'proposal-1',
        artifactId: 'artifact-1',
        baseRevision: 1,
        startOffset: 0,
        endOffset: 5,
        replacement: 'gamma',
        rationale: 'rename',
        actorKind: 'assistant',
        actorId: 'model-1'
      },
      db
    )
    expect(proposal).toMatchObject({ proposedContent: 'gamma beta', status: 'pending' })
    expect(getArtifact('artifact-1', db)?.currentRevision).toBe(1)
    expect(listArtifactRevisions('artifact-1', db)).toHaveLength(1)
  })

  it('accepts by appending a user-provenance revision and retaining the prior revision', () => {
    createArtifactEditProposal(
      {
        id: 'proposal-1',
        artifactId: 'artifact-1',
        baseRevision: 1,
        startOffset: 0,
        endOffset: 5,
        replacement: 'gamma',
        actorKind: 'assistant',
        actorId: 'model-1'
      },
      db
    )
    const accepted = acceptArtifactEditProposal(
      'proposal-1',
      { actorKind: 'user', actorId: 'local-user' },
      db
    )
    expect(accepted.proposal).toMatchObject({ status: 'accepted', acceptedRevision: 2 })
    expect(listArtifactRevisions('artifact-1', db)).toMatchObject([
      { revision: 1, content: 'alpha beta' },
      { revision: 2, content: 'gamma beta', actorKind: 'user', actorId: 'local-user' }
    ])
  })

  it('rejects without adding a revision', () => {
    createArtifactEditProposal(
      {
        id: 'proposal-1',
        artifactId: 'artifact-1',
        baseRevision: 1,
        startOffset: 6,
        endOffset: 10,
        replacement: 'delta',
        actorKind: 'user'
      },
      db
    )
    expect(rejectArtifactEditProposal('proposal-1', db).status).toBe('rejected')
    expect(getArtifact('artifact-1', db)?.currentRevision).toBe(1)
  })

  it('marks a stale proposal conflicted and never overwrites the newer revision', () => {
    for (const id of ['proposal-a', 'proposal-b']) {
      createArtifactEditProposal(
        {
          id,
          artifactId: 'artifact-1',
          baseRevision: 1,
          startOffset: 0,
          endOffset: 5,
          replacement: id,
          actorKind: 'user'
        },
        db
      )
    }
    acceptArtifactEditProposal('proposal-a', { actorKind: 'user' }, db)
    expect(() => acceptArtifactEditProposal('proposal-b', { actorKind: 'user' }, db)).toThrow(
      /revision conflict/
    )
    expect(getArtifactEditProposal('proposal-b', db)?.status).toBe('conflict')
    expect(listArtifactRevisions('artifact-1', db)).toHaveLength(2)
  })

  it('rejects ranges outside the exact base revision', () => {
    expect(() =>
      createArtifactEditProposal(
        {
          artifactId: 'artifact-1',
          baseRevision: 1,
          startOffset: 0,
          endOffset: 99,
          replacement: 'x',
          actorKind: 'user'
        },
        db
      )
    ).toThrow(/outside/)
  })
})
