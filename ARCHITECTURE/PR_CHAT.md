# PR Chat and patch review

**Local release:** v0.23.0 (not published)

**Database migrations:** v27–v29

**Scope:** conversation-bound GitHub pull-request inspection, review drafts, detached findings,
and explicit patch proposals through the existing PR panel and workspace patch authority.

## Authority and identity

`conversation_pull_requests` remains the canonical association. Migration v27 adds immutable
GitHub repository ID plus bound base/head SHA snapshots. The existing composite
conversation/repository/number identity remains stable and legacy rows remain readable.

Invoked from: `electron/ipc/github.ts:423` binds a panel selection after fetching both the
repository and PR from GitHub. `electron/services/pr-chat-context.ts:84` refuses a missing
conversation binding, repository name/ID drift, and a changed head before returning context.
Files, checks, threads, per-thread comments, and selected diff bytes have independent bounds,
pagination, and explicit truncation signals.

## Model tool boundary

| Surface | Production entry | Authority |
| --- | --- | --- |
| Summary/files/diff/checks/comments/patch reads | `electron/services/pr-chat-tool-pack.ts:53` | strict lazy `read` + `network`; parallelizable; no approval; credential-shaped text redacted; normal spill valve |
| Pending review/comment/reply/submit | `electron/services/pr-chat-tool-pack.ts:102` | strict lazy `write` + `network`; every external write requires normal approval and exact target args |
| Detached findings | `electron/services/pr-review-schema.ts:3` | local durable draft; no GitHub post |
| Patch propose/edit/accept/reject | `electron/services/pr-patch-tool-pack.ts` | local proposal edits; only accept is approval-gated workspace mutation |

Review writes are pinned to the bound head. Unified-diff header ranges validate left/right
line anchors before annotation. Migration v28 persists detached findings and idempotency
receipts: a completed key replays its result, a pending duplicate fails closed, and a failed
network action clears its reservation for an explicit retry.

## Patch proposal state machine

```text
pending(bound head + confined patch)
  ├─ edit ───────────────────────────────> pending(updated patch)
  ├─ reject ─────────────────────────────> rejected(no workspace change)
  ├─ accept after head changed ──────────> conflict(no workspace change)
  ├─ accept; apply fails ────────────────> error(all affected files restored)
  └─ accept; apply succeeds ─────────────> accepted(workspace patch result recorded)
```

Migration v29 owns proposal durability. Invoked from:
`electron/services/pr-patch-flow.ts:53` rechecks SHA freshness, confines every relative path
under the active workspace, snapshots affected files, and calls the existing
`executeApplyPatch` authority. A later-hunk failure restores every snapshot before terminal
error state. `electron/services/pr-patch-flow.ts:82` rejects without touching workspace files.
Tool-call lifecycle records exact proposal/edit/accept/reject arguments and outcomes in the
existing event spine.

## Renderer map

The existing Pull Requests panel is extended, not replaced.

- `src/components/github/PullRequestsPanel.tsx:107` binds and sends “Chat about this PR.”
- `src/components/github/PRDiffView.tsx` loads bounded file patches and sends one selected hunk.
- `src/components/github/PRStatusChecks.tsx` retains the 15-second check refresh.
- `src/components/github/InlineCommentComposer.tsx` retains annotations and user-submit
  confirmation.
- `src/components/chat/PrPatchCard.tsx:10` renders editable proposals and routes edit/reject/
  accept back through chat so model tools, approval, and audit remain canonical.

## Verification boundary

Automated gates cover repository identity, stale SHA, pagination/budgets, redaction, strict
schemas, spill behavior, approval metadata, line mapping, idempotency, schema execution,
path confinement, rollback, renderer wiring, production build, and renderer smoke. The
disposable GitHub repository workflow in `PLANNING/CJ26_PR_CHAT_PLAYBOOK.md` remains
`USER-VERIFICATION-NEEDED`; no blanket live-GitHub parity claim is made.

---

Authored and reviewed by Basho Parks, copyright 2026
