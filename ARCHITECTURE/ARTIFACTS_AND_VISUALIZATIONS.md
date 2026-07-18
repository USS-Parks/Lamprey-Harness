# Artifacts, inline visualizations, and direct editing

**Local release:** v0.22.0 (not published)

**Database migrations:** v24–v26

**Scope:** durable artifact identity, inline safe presentation, revision proposals,
annotations, activity, open/export

## Canonical storage

Artifacts are not message-body HTML and are not files hidden behind renderer state. The
main-process ledger owns identity and history:

| Entity                    | Purpose                                                                     | Mutation rule                                              |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `artifacts`               | stable identity, type, current revision, sandbox/export/provenance metadata | current-revision pointer advances atomically               |
| `artifact_revisions`      | full immutable content plus hash, size, actor, message, metadata            | insert-only; update/delete triggers reject                 |
| `artifact_annotations`    | exact revision/range notes and actor provenance                             | status may resolve; revision identity never moves          |
| `artifact_edit_proposals` | pending replacement against one base revision/range                         | accept/reject/conflict terminal; accept appends a revision |

`electron/services/artifact-schema.ts:28` defines the v24 ledger and deterministic legacy
document backfill. `electron/services/artifact-edit-schema.ts:1` defines v26 proposals.
`messages.artifacts` from v25 stores only visualization attachment identity/state/fallback;
revision content remains canonical in the artifact ledger.

Message documents keep their established JSON representation for compatibility, while
`electron/services/artifact-store.ts:469` gives new documents the same deterministic artifact
identity as v24 backfill. `electron/services/conversation-store.ts:803` links ready
visualizations to the committed assistant row in the same transaction. Transcript deletion
nulls live foreign keys but leaves immutable origin metadata and revision history intact.

## Invocation map

| Boundary       | Production entry                                                                   | Responsibility                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Model tools    | `electron/services/artifact-tool-pack.ts:74`, `:123`, `:362`                       | propose edits, create/update visualizations, read/update/annotate artifacts through registry risk/plan-mode authority |
| Durable store  | `electron/services/artifact-store.ts:237`, `:301`, `:446`                          | create, append exact revision, link message provenance                                                                |
| Proposal store | `electron/services/artifact-edit-store.ts:96`, `:161`                              | validate exact ranges; accept via append; reject/conflict without overwrite                                           |
| Renderer IPC   | `electron/ipc/artifact.ts:19`, `:49` and `electron/preload.ts:1136`                | typed read/propose/accept/reject/annotate/open bridge; no renderer database access                                    |
| Inline card    | `src/components/chat/VisualizationCardRow.tsx:21`                                  | loading/error/ready presentation, fallback, collapse/open/edit/export                                                 |
| Range editor   | `src/components/chat/ArtifactEditorDialog.tsx:13`                                  | exact selection, chat request, direct preview, annotation, accept/reject                                              |
| Activity       | `src/lib/artifact-activity.ts:11`, `src/components/artifacts/ActivityFeed.tsx:110` | queued/running/complete/error with no false completion                                                                |

Every model-callable write remains a normal registered tool. Descriptor risks, plan-mode
mutation blocking, audit dispatch, and tool-call result truth remain authoritative. Renderer
actions cross narrow IPC and are attributed to `local-user`; assistant proposals and
annotations retain model actor identity.

## Type validation and rendering boundary

`artifact-content-validator.ts` bounds all content and fallbacks. Mermaid rejects init/click
directives and external URLs. Chart/table inputs are bounded JSON envelopes. SVG rejects
scripts, embedded documents, event attributes, and external URLs. HTML/JSX reject external
network, navigation, worker, process, and host APIs.

The chat renderer never uses `dangerouslySetInnerHTML` for artifact source:

- charts and tables become ordinary React elements;
- Mermaid renders with `securityLevel: 'strict'` and the resulting SVG is displayed only in
  image context;
- validated SVG is displayed only in image context;
- HTML, JSX, and React source is sandbox-only and never executes inside chat.

The existing artifact `WebContentsView` and popped-out window retain `sandbox: true`, context
isolation, no Node integration, `connect-src 'none'`, denied navigation, and denied popups.
Every visualization retains a visible text alternative even when rendering fails.

## Revision proposal state machine

```text
pending(base revision + exact range)
  ├─ accept while current == base ─> accepted(new immutable revision)
  ├─ reject ───────────────────────> rejected(no revision)
  └─ accept while current != base ─> conflict(no overwrite)
```

Creating a proposal is non-destructive. The UI's **Ask Lamprey** request names
`artifact_propose_edit` and explicitly forbids direct `artifact_update`, so model work returns
to the user as a diff preview. Accept attributes the new revision to the user who approved it;
the proposal separately retains who authored the suggestion. Prior revisions are never lost.

## Activity and file-open truth

Model visualization/edit calls derive activity from canonical tool-call status. Direct edits
and opens use `runTrackedArtifactActivity`. A direct action records queued, then running, and
only records complete after a successful IPC envelope. False envelopes and thrown calls record
error and cannot produce complete. Document actions resolve the latest accepted revision before
open/copy/download rather than reusing stale message JSON.

## Verification boundary and honest gaps

Focused suites run exact schema/migrations and native stores under Electron's matching SQLite
ABI; pure/source-lock suites cover validation, renderer isolation, range/diff decisions,
activity mapping, and false-success negatives. The production build and both bundle smokes are
part of the milestone gate.

`PLANNING/CJ26_ARTIFACT_EDITING_PLAYBOOK.md` is the packaged owner GUI acceptance pass. Until
its receipt is appended, v0.22.0 is implementation-complete locally but not published and not a
blanket current-Codex artifact-parity claim.

---

Authored and reviewed by Basho Parks, copyright 2026
