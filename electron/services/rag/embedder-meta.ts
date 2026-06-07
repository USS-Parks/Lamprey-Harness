import { getDb } from '../database'
import { getEmbedder, type EmbedderInfo } from './embeddings/catalog'

// Persistence Phase / PS7 — embedder dimension guard.
//
// The vec0 virtual table in `database.ts` is hard-pinned to `FLOAT[384]`
// because both catalogue embedders (bge-small + all-MiniLM-L6-v2) emit
// 384-dim vectors. If a user (or a future migration) swaps in an
// embedder with different dimensions — e.g. text-embedding-3-small at
// 1536 — every `INSERT INTO rag_chunk_vec` either errors hard (dim
// mismatch) or, worse, silently embeds wrong-shaped data that vec_distance
// can't reason about.
//
// PS7 makes this loud:
//   1. `rag_embedder_meta` holds the active embedder id + its dimension
//      at index time.
//   2. `assertEmbedderDimensionMatch(configuredEmbedderId)` reads the
//      stored row + compares against the catalogue's dims. On mismatch
//      it throws a structured error the RAG ingest path surfaces to the
//      renderer with a "Rebuild index for new embedder" action (PS10).
//   3. On a fresh DB with no rows the stamp helper writes the first row
//      from the configured embedder.
//
// PS7 does NOT auto-rebuild the index — that's a destructive operation
// the user must consent to. The Settings → Persistence panel (PS10)
// surfaces the action; the renderer banner (PS4 + this prompt) shows the
// reason.

export interface EmbedderMetaRow {
  id: 'singleton'
  embedderId: string
  dimensions: number
  stampedAt: number
}

/**
 * Read the singleton meta row, if any. NULL on an empty table (fresh
 * DB before any RAG ingest has stamped).
 */
export function readEmbedderMeta(): EmbedderMetaRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT id, embedder_id AS embedderId, dimensions, stamped_at AS stampedAt
         FROM rag_embedder_meta WHERE id = 'singleton'`
    )
    .get() as EmbedderMetaRow | undefined
  return row ?? null
}

/**
 * Write the singleton meta row from the catalogue entry. Used by the
 * ingest path on first-ever ingest, and (eventually, after the user
 * consents to a rebuild via PS10) after `rebuildVecIndex()`.
 */
export function stampEmbedderMeta(embedderId: string): void {
  const catalogueEntry = getEmbedder(embedderId)
  if (!catalogueEntry) {
    throw new Error(
      `embedder-meta: cannot stamp unknown embedder ${JSON.stringify(embedderId)}`
    )
  }
  const db = getDb()
  db.prepare(
    `INSERT INTO rag_embedder_meta (id, embedder_id, dimensions, stamped_at)
       VALUES ('singleton', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         embedder_id = excluded.embedder_id,
         dimensions = excluded.dimensions,
         stamped_at = excluded.stamped_at`
  ).run(catalogueEntry.id, catalogueEntry.dimensions, Date.now())
}

export class EmbedderDimensionMismatchError extends Error {
  readonly storedEmbedderId: string
  readonly storedDimensions: number
  readonly configuredEmbedderId: string
  readonly configuredDimensions: number

  constructor(
    storedEmbedderId: string,
    storedDimensions: number,
    configuredEmbedderId: string,
    configuredDimensions: number
  ) {
    super(
      `embedder dimension mismatch: index was built with ${storedEmbedderId} ` +
        `(${storedDimensions}d) but the configured embedder is ` +
        `${configuredEmbedderId} (${configuredDimensions}d). Rebuild the RAG ` +
        `index via Settings → Persistence to switch.`
    )
    this.name = 'EmbedderDimensionMismatchError'
    this.storedEmbedderId = storedEmbedderId
    this.storedDimensions = storedDimensions
    this.configuredEmbedderId = configuredEmbedderId
    this.configuredDimensions = configuredDimensions
  }
}

/**
 * Verify the configured embedder matches what was indexed. Returns the
 * resolved catalogue entry on success. Behaviors:
 *   - No row stored yet: stamps the configured embedder + returns it.
 *     (Fresh DB or pre-PS7 upgrade with no prior ingest.)
 *   - Row matches: returns the catalogue entry.
 *   - Row mismatches: throws EmbedderDimensionMismatchError. The RAG
 *     IPC handler catches this + surfaces it; the user clicks "Rebuild"
 *     in PS10 which (a) drops rag_chunk_vec, (b) recreates it with the
 *     new dim, (c) re-embeds all chunks, (d) calls stampEmbedderMeta().
 */
export function assertEmbedderDimensionMatch(
  configuredEmbedderId: string
): EmbedderInfo {
  const catalogueEntry = getEmbedder(configuredEmbedderId)
  if (!catalogueEntry) {
    throw new Error(
      `embedder-meta: configured embedder ${JSON.stringify(configuredEmbedderId)} ` +
        `is not in the catalogue`
    )
  }
  const stored = readEmbedderMeta()
  if (!stored) {
    stampEmbedderMeta(configuredEmbedderId)
    return catalogueEntry
  }
  if (stored.dimensions !== catalogueEntry.dimensions) {
    throw new EmbedderDimensionMismatchError(
      stored.embedderId,
      stored.dimensions,
      configuredEmbedderId,
      catalogueEntry.dimensions
    )
  }
  return catalogueEntry
}
