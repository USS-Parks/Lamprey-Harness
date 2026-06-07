import { describe, it, expect, beforeEach, vi } from 'vitest'
import BetterSqlite3, { type Database } from 'better-sqlite3'

// Persistence Phase / PS7 — embedder-meta tests.
// We mock `../database`'s `getDb` to return an in-memory DB we set up
// with just the rag_embedder_meta table the migration produces. The
// catalogue helper is the real one (pure module, no Electron import).

const HAS_NATIVE_SQLITE: boolean = (() => {
  try {
    const probe = new BetterSqlite3(':memory:')
    probe.close()
    return true
  } catch {
    return false
  }
})()

let db: Database | null = null

vi.mock('../database', () => ({
  getDb: () => {
    if (!db) throw new Error('test db not initialised')
    return db
  }
}))

import {
  assertEmbedderDimensionMatch,
  EmbedderDimensionMismatchError,
  readEmbedderMeta,
  stampEmbedderMeta
} from './embedder-meta'

function makeDb(): Database {
  const fresh = new BetterSqlite3(':memory:')
  fresh.exec(`
    CREATE TABLE rag_embedder_meta (
      id          TEXT PRIMARY KEY CHECK(id = 'singleton'),
      embedder_id TEXT NOT NULL,
      dimensions  INTEGER NOT NULL,
      stamped_at  INTEGER NOT NULL
    );
  `)
  return fresh
}

describe.skipIf(!HAS_NATIVE_SQLITE)('embedder-meta (PS7)', () => {
  beforeEach(() => {
    if (db) {
      db.close()
    }
    db = makeDb()
  })

  it('readEmbedderMeta returns null on an empty table', () => {
    expect(readEmbedderMeta()).toBeNull()
  })

  it('stampEmbedderMeta + readEmbedderMeta round-trip', () => {
    stampEmbedderMeta('bge-small-en-v1.5')
    const row = readEmbedderMeta()
    expect(row).not.toBeNull()
    expect(row?.embedderId).toBe('bge-small-en-v1.5')
    expect(row?.dimensions).toBe(384)
    expect(row?.stampedAt).toBeGreaterThan(0)
  })

  it('stampEmbedderMeta upserts (second call overwrites the singleton row)', () => {
    stampEmbedderMeta('bge-small-en-v1.5')
    stampEmbedderMeta('all-MiniLM-L6-v2')
    const row = readEmbedderMeta()
    expect(row?.embedderId).toBe('all-MiniLM-L6-v2')
    expect(row?.dimensions).toBe(384)
    const count = db!.prepare('SELECT COUNT(*) AS c FROM rag_embedder_meta').get() as {
      c: number
    }
    expect(count.c).toBe(1)
  })

  it('stampEmbedderMeta refuses an unknown embedder id', () => {
    expect(() => stampEmbedderMeta('not-a-real-embedder')).toThrowError(
      /cannot stamp unknown embedder/
    )
    expect(readEmbedderMeta()).toBeNull()
  })

  it('assertEmbedderDimensionMatch stamps on first call (fresh DB)', () => {
    const result = assertEmbedderDimensionMatch('bge-small-en-v1.5')
    expect(result.id).toBe('bge-small-en-v1.5')
    expect(result.dimensions).toBe(384)
    const row = readEmbedderMeta()
    expect(row?.embedderId).toBe('bge-small-en-v1.5')
  })

  it('assertEmbedderDimensionMatch returns catalogue entry when dims match', () => {
    stampEmbedderMeta('bge-small-en-v1.5')
    // all-MiniLM-L6-v2 is also 384d → matches by dimension, no throw.
    const result = assertEmbedderDimensionMatch('all-MiniLM-L6-v2')
    expect(result.id).toBe('all-MiniLM-L6-v2')
    expect(result.dimensions).toBe(384)
  })

  it('assertEmbedderDimensionMatch throws on dimension mismatch with structured payload', () => {
    // Synthetically stamp a different-dim row so we can exercise the
    // mismatch path without inventing a fake catalogue entry.
    db!
      .prepare(
        `INSERT INTO rag_embedder_meta (id, embedder_id, dimensions, stamped_at)
           VALUES ('singleton', ?, ?, ?)`
      )
      .run('text-embedding-3-small', 1536, Date.now())

    let caught: unknown
    try {
      assertEmbedderDimensionMatch('bge-small-en-v1.5')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(EmbedderDimensionMismatchError)
    const e = caught as EmbedderDimensionMismatchError
    expect(e.storedEmbedderId).toBe('text-embedding-3-small')
    expect(e.storedDimensions).toBe(1536)
    expect(e.configuredEmbedderId).toBe('bge-small-en-v1.5')
    expect(e.configuredDimensions).toBe(384)
    expect(e.message).toMatch(/Rebuild the RAG index/)
  })

  it('assertEmbedderDimensionMatch refuses an unknown configured embedder', () => {
    expect(() => assertEmbedderDimensionMatch('text-embedding-3-small')).toThrowError(
      /not in the catalogue/
    )
  })
})
