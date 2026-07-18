# Codex July 2026 — Artifact Selection Editing GUI Playbook

Status: `USER-VERIFICATION-NEEDED`

This is the packaged-app acceptance pass for VA-4. Automated range, revision-conflict,
accept/reject, provenance, and renderer-wiring tests are necessary but do not replace this
GUI check.

## Setup

1. Launch the current local production build with a disposable conversation.
2. Ask Lamprey to create one Markdown document and one Mermaid visualization with distinctive
   source text.
3. Confirm each completed assistant row shows an **Edit** action.

## Direct selection edit

1. Open the Markdown document editor.
2. Select a non-empty source range and confirm the displayed UTF-16 offsets and length update.
3. Enter a direct replacement and choose **Preview direct edit**.
4. Confirm the red/green preview shows only the selected source and replacement and that the
   current artifact remains unchanged before acceptance.
5. Choose **Reject**. Reopen/copy/download the document and confirm the original source remains.
6. Repeat the proposal and choose **Accept**. Reopen/copy/download and confirm the accepted
   revision is used while revision 1 remains available in the durable ledger.

## Chat-requested edit

1. Select another exact range, describe the desired revision, and choose **Ask Lamprey**.
2. Confirm the request appears in chat with artifact id, exact revision, and range.
3. Confirm Lamprey calls `artifact_propose_edit`, not `artifact_update`.
4. Reopen **Edit** and confirm the assistant proposal appears as `pending` with rationale and
   assistant/model provenance.
5. Accept it and confirm the card renders the new current revision.

## Annotation and conflict negatives

1. Select a range, add an annotation, close/reopen, and confirm it persists with user actor
   provenance.
2. Create two proposals against the same base revision. Accept the first, then attempt the
   second. Confirm the second reports a revision conflict and does not overwrite the first.
3. Confirm a rejected or conflicted proposal cannot later be accepted.
4. Confirm Escape/Close dismisses the editor and source selection remains keyboard accessible.

## Receipt

Record build SHA, Windows version, artifact ids, accepted revision numbers, screenshots for
direct preview/chat proposal/conflict, and PASS/FAIL here. Until that receipt is appended,
VA-4 is implementation-complete but owner GUI acceptance remains open.
