# Codex July 2026 PR Chat Owner Playbook

Status: `USER-VERIFICATION-NEEDED` until every row has an owner result and evidence path.

Use a disposable GitHub repository and draft pull request. Do not run this against a live
production repository. Record repository identity, PR number, initial base/head SHA, Lamprey
build commit, provider/model, timestamp, screenshots, and the final GitHub review inventory.

| ID | Owner action | Required result |
| --- | --- | --- |
| PRC-1 | Open the existing Pull Requests panel and expand the draft PR. | Metadata, files, annotations, and checks render; check progress refreshes without reopening. |
| PRC-2 | Click **Chat about this PR**. | The active conversation receives an exact repository/PR/head prompt and the conversation↔PR binding persists after restart. |
| PRC-3 | Click **Send hunk** on one changed file. | One bounded diff hunk is sent to the same conversation; another repo or stale head is rejected. |
| PRC-4 | Ask for summary, files, checks, comments, and one patch inspection. | The six PR read tools return bounded/redacted results and large output spills normally. |
| PRC-5 | Ask Lamprey to start a pending review and add one inline annotation. Approve only the exact expected target. | GitHub shows one pending review and one correctly mapped annotation; duplicate idempotency key creates no second post. |
| PRC-6 | Submit the review as `COMMENT`. | The approval names the exact target; UI confirms submission; GitHub shows exactly one submitted review. |
| PRC-7 | Ask for a patch proposal, edit it in the patch card, then reject it. | Proposal changes locally; rejection changes no workspace file and performs no GitHub write. |
| PRC-8 | Create another proposal and click **Accept…**. Approve the exact proposal. | Current head is rechecked, confined workspace files change, and the card reports accepted. |
| PRC-9 | Advance the draft PR head, then try to accept an old proposal. | Acceptance fails closed as stale/conflicted and changes no workspace file. |
| PRC-10 | Force a later-hunk mismatch in a two-file proposal. | Earlier writes roll back; both files match their pre-accept bytes. |

Closeout: read GitHub's review/comment inventory and local `git diff`; confirm only the one
intentional `COMMENT` review and annotation were posted. Record any skipped row as an honest
gap. Passing automated tests alone does not change this playbook status.
