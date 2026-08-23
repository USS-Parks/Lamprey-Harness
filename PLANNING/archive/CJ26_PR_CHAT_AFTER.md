# Codex July 2026 PR Chat — after matrix

**Local target:** v0.23.0, not published

| Contract | Evidence | Result |
| --- | --- | --- |
| Conversation binding carries immutable repo/base/head identity | v27 native migration + PR-1 context/store cohort | PASS |
| Bounded inspection tools with pagination, redaction, stale/error handling, spill | PR-1/PR-2 focused cohorts | PASS |
| Pending reviews, inline comments, replies, submit, detached findings | PR-3 tool/flow/native cohorts | PASS |
| External review writes require exact-target approval and idempotency | descriptor and receipt behavior tests | PASS |
| Patch proposal/edit/accept/reject with confinement, SHA race, rollback, audit | PR-4 flow/tool/native cohorts | PASS |
| Existing panel gains bound chat, selected hunk, cards, annotations, checks, confirmation | PR-5 source locks, build, renderer smoke | PASS |
| Disposable live GitHub repository workflow | `CJ26_PR_CHAT_PLAYBOOK.md` | USER-VERIFICATION-NEEDED |

## PR-6 full-gate evidence

- `npm run verify:all`: PASS
- lint and both TypeScript projects: PASS
- Vitest: 225 files passed / 15 skipped; 2717 tests passed / 162 skipped / 0 failed
- production build, bundle smoke, renderer smoke, and `verify:proof`: PASS
- Electron-native v27–v29 migration and M5 state-flow cohort: 5 files / 29 tests /
  0 skipped / 0 failed

Implementation completion means every approved M5 prompt is gated and locally committed.
It does not mean current-Codex behavioral parity or live GitHub acceptance while the owner
playbook remains open. No push, tag, Bucket run, CDN update, or public release is included.

---

Authored and reviewed by Basho Parks, copyright 2026
