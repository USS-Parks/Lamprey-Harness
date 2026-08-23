# AC_AFTER.md — Audit Closure measurement lock (after)

**Prompt:** AC-31 (measurements) + AC-42 (version)
**Captured:** 2026-08-22
**HEAD at measurement:** wrap branch after leftover Improve + wrap docs (see git log)
**package.json version:** `0.29.0` (AC-42)
**Method:** same as `PLANNING/AC_BASELINE.md` — physical line counts via
`fs.readFileSync(f,'utf8').split(/\r?\n/).length` (equivalent to
`(Get-Content -LiteralPath <file>).Count`). ABI-guarded list from the same
walk as `scripts/verify-proof.cjs` `listNativeGuardedTestFiles()`.

## Line counts

| File | Baseline (AC-0) | After | Delta |
|------|----------------:|------:|------:|
| `electron/ipc/chat.ts` | 1915 | 1358 | −557 |
| `electron/services/providers/registry.ts` | 2547 | 1752 | −795 |
| `electron/services/tool-registry.ts` | 1191 | 1142 | −49 |
| `electron/preload.ts` | 1613 | 1603 | −10 |

Surprises: `chat.ts` dropped because AC-8 extracted `chat-tool-dispatch.ts`.
`registry.ts` dropped because AC-41 moved `MODEL_CATALOG` + `RETIRED_MODEL_MAP`
to `electron/services/providers/catalog.ts` (no row edits). Preload drop is
Delete-track `contracts` namespace (AC-29).

## ABI-guarded native-DB test files (17)

AC-25 deleted `pipeline-orphans.test.ts`. That is the expected drop from 18 → 17.

`listNativeGuardedTestFiles()` walk (same files as AC-0 minus pipeline-orphans):

- electron/services/artifact-edit-store.test.ts
- electron/services/artifact-store.test.ts
- electron/services/backup-runner.test.ts
- electron/services/conversation-store-sanitize.test.ts
- electron/services/database-checkpoint.test.ts
- electron/services/database-integrity.test.ts
- electron/services/db-migrations.test.ts
- electron/services/failure-ledger.test.ts
- electron/services/loop-runner.test.ts
- electron/services/loop-store.test.ts
- electron/services/proof-receipts.test.ts
- electron/services/rag/embedder-meta.test.ts
- electron/services/schema-init.test.ts
- electron/services/sessions-search.test.ts
- electron/services/snip/apply.test.ts
- electron/services/snip/tracking.test.ts
- electron/services/turn-control-store.test.ts

## §1 / §2 row status

Every Improve / Delete / Add / wrap prompt in the P-SPR landed except:

- AC-33 OpenWiki refresh: `user-verification-needed`. MCP `openwiki_begin`
  ran in update mode, but this checkout has no authored `openwiki/*.md`
  pages to refresh. `ARCHITECTURE/FUNCTION_CALLING.md` was still corrected
  in AC-34.
- AC-36 native-DB CI: workflow present; first Actions run remains
  `user-verification-needed` (Add-track honest gap).
- Live `supportsTools` probes: not run this phase (K-register / AC-42 gap).

## Prompt landings (Improve leftovers on wrap)

| Prompt | Status |
|--------|--------|
| AC-6 orphaned turn | landed |
| AC-7 suppressDoneEvent gone | landed |
| AC-8 chat-tool-dispatch | landed |
| AC-9 compressor stack | landed |
| AC-10 single drain | landed (research + send-error finalizeTurn kept; send-success duplicate removed) |
| AC-11 CORE lists | landed |
| AC-12 fallback dispatch tools | landed |
| AC-13 gated pack strip | landed |
| AC-14 getOpenAITools alias | landed |
| AC-15 chat uses provider path | landed (`getNormalizedToolsForRole` kept for multi_agent_run / WC-2) |
| AC-16 session handlers | landed |
| AC-17 unknown supportsTools false | landed |
| AC-18 custom tools default off | landed |
| AC-35 honest pre-push | landed |
| AC-38 MCP approval from risks | landed |
| AC-39 provider name read | landed (no invented schema deltas; Anthropic/Google/MiniMax notes are request-level) |
| AC-41 catalog.ts | landed |
| AC-31 AFTER | this file |
| AC-34 FUNCTION_CALLING.md | landed |
| AC-37 audit-closure-safety | landed |
| AC-42 wrap | landed |

Authored and reviewed by Basho Parks, copyright 2026
