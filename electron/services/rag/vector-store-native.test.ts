import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('Use isolated DB') } }, BrowserWindow: { getAllWindows: () => [] } }))
import { __setUserDataForTests, getDb } from '../database'
import { __resetCollectionStore, createCollection, insertDocument, insertChunks } from './store'
import { retrieveWithMeta } from './retrieve'

const HAS_NATIVE_SQLITE = (() => {
  try { const db = new Database(':memory:'); db.close(); return true } catch { return false }
})()

describe.skipIf(!HAS_NATIVE_SQLITE)('native RAG vector round trip', () => {
  let profile: string
  beforeEach(() => {
    profile = mkdtempSync(join(tmpdir(), 'lamprey-vector-test-'))
    __setUserDataForTests(profile)
    __resetCollectionStore()
  })
  afterEach(() => {
    __setUserDataForTests(null)
    rmSync(profile, { recursive: true, force: true })
  })
  it('persists integer vector keys and retrieves an offset typed-array view', async () => {
    const collection = createCollection({ name: 'Vector fixture', embedderId: 'bge-small-en-v1.5' })
    const doc = insertDocument({ collectionId: collection.id, displayName: 'fixture.txt', sourceKind: 'paste', hashSha256: 'fixture', status: 'ready' })
    const backing = new Float32Array(386)
    backing[0] = 99
    backing[1] = 1
    const vector = backing.subarray(1, 385)
    const inserted = insertChunks([{ documentId: doc.id, collectionId: collection.id, chunkIndex: 0, startOffset: 0, endOffset: 60, text: 'A lighthouse keeper keeps the brass telescope in the northern tower.' }], [vector])
    expect(getDb().prepare('SELECT count(*) AS n FROM rag_chunk_vec').get()).toEqual({ n: 1 })
    const result = await retrieveWithMeta({ query: 'telescope', collectionIds: [collection.id], queryEmbedding: vector })
    expect(result.vecHits).toBe(1)
    expect(result.results[0].chunkId).toBe(inserted.ids[0])
    expect(result.results[0].scores.vec).toBeCloseTo(0)
  })
})
