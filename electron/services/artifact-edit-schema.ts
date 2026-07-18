export const ARTIFACT_EDIT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS artifact_edit_proposals (
    id                TEXT PRIMARY KEY,
    artifact_id       TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    base_revision     INTEGER NOT NULL,
    start_offset      INTEGER NOT NULL CHECK(start_offset >= 0),
    end_offset        INTEGER NOT NULL CHECK(end_offset >= start_offset),
    replacement       TEXT NOT NULL,
    proposed_content  TEXT NOT NULL,
    rationale         TEXT,
    actor_kind        TEXT NOT NULL CHECK(actor_kind IN ('user','assistant','system','import')),
    actor_id          TEXT,
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','accepted','rejected','conflict')),
    accepted_revision INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    FOREIGN KEY (artifact_id, base_revision)
      REFERENCES artifact_revisions(artifact_id, revision) ON DELETE CASCADE,
    FOREIGN KEY (artifact_id, accepted_revision)
      REFERENCES artifact_revisions(artifact_id, revision) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_artifact_edit_proposals_artifact
    ON artifact_edit_proposals(artifact_id, status, created_at DESC);
`
