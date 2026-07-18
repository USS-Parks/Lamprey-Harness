import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import {
  appendArtifactRevision,
  getArtifact,
  getArtifactRevision,
  type ArtifactRevision
} from './artifact-store'
import type { ArtifactActorKind } from './artifact-schema'
import { validateArtifactContent } from './artifact-content-validator'

export type ArtifactEditStatus = 'pending' | 'accepted' | 'rejected' | 'conflict'

export interface ArtifactEditProposal {
  id: string
  artifactId: string
  baseRevision: number
  startOffset: number
  endOffset: number
  replacement: string
  proposedContent: string
  rationale: string | null
  actorKind: ArtifactActorKind
  actorId: string | null
  status: ArtifactEditStatus
  acceptedRevision: number | null
  createdAt: number
  updatedAt: number
}

type ProposalRow = {
  id: string
  artifact_id: string
  base_revision: number
  start_offset: number
  end_offset: number
  replacement: string
  proposed_content: string
  rationale: string | null
  actor_kind: ArtifactActorKind
  actor_id: string | null
  status: ArtifactEditStatus
  accepted_revision: number | null
  created_at: number
  updated_at: number
}

function targetDb(database?: Database): Database {
  return database ?? getDb()
}

function toProposal(row: ProposalRow): ArtifactEditProposal {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    baseRevision: row.base_revision,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    replacement: row.replacement,
    proposedContent: row.proposed_content,
    rationale: row.rationale,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    status: row.status,
    acceptedRevision: row.accepted_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getArtifactEditProposal(
  proposalId: string,
  database?: Database
): ArtifactEditProposal | null {
  const row = targetDb(database)
    .prepare('SELECT * FROM artifact_edit_proposals WHERE id = ?')
    .get(proposalId) as ProposalRow | undefined
  return row ? toProposal(row) : null
}

export function listArtifactEditProposals(
  artifactId: string,
  database?: Database
): ArtifactEditProposal[] {
  const rows = targetDb(database)
    .prepare(
      `SELECT * FROM artifact_edit_proposals
        WHERE artifact_id = ?
        ORDER BY created_at DESC, id DESC`
    )
    .all(artifactId) as ProposalRow[]
  return rows.map(toProposal)
}

export function createArtifactEditProposal(
  input: {
    id?: string
    artifactId: string
    baseRevision: number
    startOffset: number
    endOffset: number
    replacement: string
    rationale?: string | null
    actorKind: ArtifactActorKind
    actorId?: string | null
    createdAt?: number
  },
  database?: Database
): ArtifactEditProposal {
  const db = targetDb(database)
  const revision = getArtifactRevision(input.artifactId, input.baseRevision, db)
  if (!revision) throw new Error('artifact revision not found')
  if (typeof input.replacement !== 'string')
    throw new Error('artifact edit replacement is required')
  if (input.rationale && Buffer.byteLength(input.rationale, 'utf8') > 16 * 1024) {
    throw new Error('artifact edit rationale exceeds 16384 bytes')
  }
  if (!Number.isInteger(input.startOffset) || !Number.isInteger(input.endOffset)) {
    throw new Error('artifact edit range must use integer offsets')
  }
  if (
    input.startOffset < 0 ||
    input.endOffset < input.startOffset ||
    input.endOffset > revision.content.length
  ) {
    throw new Error('artifact edit range is outside the revision')
  }
  const proposedContent =
    revision.content.slice(0, input.startOffset) +
    input.replacement +
    revision.content.slice(input.endOffset)
  const artifact = getArtifact(input.artifactId, db)
  if (!artifact) throw new Error(`unknown artifact: ${input.artifactId}`)
  validateArtifactContent(artifact.artifactType, proposedContent)
  const id = input.id ?? randomUUID()
  const now = input.createdAt ?? Date.now()
  db.prepare(
    `INSERT INTO artifact_edit_proposals (
      id, artifact_id, base_revision, start_offset, end_offset,
      replacement, proposed_content, rationale, actor_kind, actor_id,
      status, accepted_revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
  ).run(
    id,
    input.artifactId,
    input.baseRevision,
    input.startOffset,
    input.endOffset,
    input.replacement,
    proposedContent,
    input.rationale?.trim() || null,
    input.actorKind,
    input.actorId ?? null,
    now,
    now
  )
  return getArtifactEditProposal(id, db)!
}

export function acceptArtifactEditProposal(
  proposalId: string,
  actor: { actorKind: ArtifactActorKind; actorId?: string | null },
  database?: Database
): { proposal: ArtifactEditProposal; revision: ArtifactRevision } {
  const db = targetDb(database)
  const proposal = getArtifactEditProposal(proposalId, db)
  if (!proposal) throw new Error(`unknown artifact edit proposal: ${proposalId}`)
  if (proposal.status !== 'pending') throw new Error(`artifact edit proposal is ${proposal.status}`)
  const artifact = getArtifact(proposal.artifactId, db)
  if (!artifact) throw new Error(`unknown artifact: ${proposal.artifactId}`)
  if (artifact.currentRevision !== proposal.baseRevision) {
    db.prepare(
      "UPDATE artifact_edit_proposals SET status = 'conflict', updated_at = ? WHERE id = ? AND status = 'pending'"
    ).run(Date.now(), proposalId)
    throw new Error(
      `artifact revision conflict: expected ${proposal.baseRevision}, current ${artifact.currentRevision}`
    )
  }
  let revision!: ArtifactRevision
  const now = Date.now()
  const tx = db.transaction(() => {
    revision = appendArtifactRevision(
      {
        artifactId: proposal.artifactId,
        expectedRevision: proposal.baseRevision,
        content: proposal.proposedContent,
        actorKind: actor.actorKind,
        actorId: actor.actorId ?? null,
        metadata: { editProposalId: proposalId, proposedBy: proposal.actorKind }
      },
      db
    )
    const updated = db
      .prepare(
        `UPDATE artifact_edit_proposals
            SET status = 'accepted', accepted_revision = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'`
      )
      .run(revision.revision, now, proposalId)
    if (updated.changes !== 1) throw new Error('artifact edit proposal changed concurrently')
  })
  tx()
  return { proposal: getArtifactEditProposal(proposalId, db)!, revision }
}

export function rejectArtifactEditProposal(
  proposalId: string,
  database?: Database
): ArtifactEditProposal {
  const db = targetDb(database)
  const result = db
    .prepare(
      `UPDATE artifact_edit_proposals
          SET status = 'rejected', updated_at = ?
        WHERE id = ? AND status = 'pending'`
    )
    .run(Date.now(), proposalId)
  if (result.changes !== 1) {
    const proposal = getArtifactEditProposal(proposalId, db)
    if (!proposal) throw new Error(`unknown artifact edit proposal: ${proposalId}`)
    throw new Error(`artifact edit proposal is ${proposal.status}`)
  }
  return getArtifactEditProposal(proposalId, db)!
}
