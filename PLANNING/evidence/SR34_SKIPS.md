# SR-34 skipped-test accounting

Source: `ae0ab1467fd62fc4b3d219a99eb120a19bc963c9`. Default suite: 3,007 passed, 175 skipped, zero failed. Names are preserved in [raw skip receipt](sr34-final-skips.json). Skips are not counted as passing tests.

- 166: Electron ABI native gate: executed separately.
- 7: Platform-specific exclusion on Windows; Ubuntu hosted CI covers its applicable branch.
- 1: macOS-only sandbox-exec: not exercised on this Windows host; platform limitation retained.
- 1: Opt-in real model download/inference: executed separately in SR-34B and production RAG acceptance.

The native command executes 170 tests in 22 files; its total includes cases already executable in the default suite, so totals must not simply be added. The real network suite executed 13 tests with the opt-in flag; only its network case was skipped by default. Hosted build success is not a macOS sandbox runtime test.

| File | Skips | Disposition |
|---|---|---|
| `electron/services/artifact-edit-store.test.ts` | 5 | Electron ABI native gate: executed separately |
| `electron/services/artifact-store.test.ts` | 8 | Electron ABI native gate: executed separately |
| `electron/services/backup-runner.test.ts` | 9 | Electron ABI native gate: executed separately |
| `electron/services/context-compressor-native.test.ts` | 5 | Electron ABI native gate: executed separately |
| `electron/services/conversation-compaction.test.ts` | 3 | Electron ABI native gate: executed separately |
| `electron/services/conversation-store-sanitize.test.ts` | 5 | Electron ABI native gate: executed separately |
| `electron/services/dangerous-command-policy.test.ts` | 1 | Platform-specific exclusion on Windows; Ubuntu hosted CI covers its applicable branch |
| `electron/services/database-checkpoint.test.ts` | 6 | Electron ABI native gate: executed separately |
| `electron/services/database-integrity.test.ts` | 4 | Electron ABI native gate: executed separately |
| `electron/services/db-migrations.test.ts` | 21 | Electron ABI native gate: executed separately |
| `electron/services/dev-server-manager.test.ts` | 2 | Platform-specific exclusion on Windows; Ubuntu hosted CI covers its applicable branch |
| `electron/services/failure-ledger.test.ts` | 22 | Electron ABI native gate: executed separately |
| `electron/services/fork-task-native.test.ts` | 2 | Electron ABI native gate: executed separately |
| `electron/services/keychain.test.ts` | 2 | Platform-specific exclusion on Windows; Ubuntu hosted CI covers its applicable branch |
| `electron/services/loop-runner.test.ts` | 2 | Electron ABI native gate: executed separately |
| `electron/services/loop-store.test.ts` | 7 | Electron ABI native gate: executed separately |
| `electron/services/monitor-service.test.ts` | 1 | Platform-specific exclusion on Windows; Ubuntu hosted CI covers its applicable branch |
| `electron/services/proof-receipts.test.ts` | 6 | Electron ABI native gate: executed separately |
| `electron/services/restore-safety.test.ts` | 9 | Electron ABI native gate: executed separately |
| `electron/services/schema-init.test.ts` | 8 | Electron ABI native gate: executed separately |
| `electron/services/sessions-search.test.ts` | 6 | Electron ABI native gate: executed separately |
| `electron/services/turn-control-store.test.ts` | 9 | Electron ABI native gate: executed separately |
| `electron/services/rag/embedder-meta.test.ts` | 8 | Electron ABI native gate: executed separately |
| `electron/services/rag/vector-store-native.test.ts` | 1 | Electron ABI native gate: executed separately |
| `electron/services/sandbox/darwin.test.ts` | 1 | macOS-only sandbox-exec: not exercised on this Windows host; platform limitation retained |
| `electron/services/sandbox/linux.test.ts` | 1 | Platform-specific exclusion on Windows; Ubuntu hosted CI covers its applicable branch |
| `electron/services/snip/apply.test.ts` | 7 | Electron ABI native gate: executed separately |
| `electron/services/snip/tracking.test.ts` | 13 | Electron ABI native gate: executed separately |
| `electron/services/rag/embeddings/service.test.ts` | 1 | Opt-in real model download/inference: executed separately in SR-34B and production RAG acceptance |

Authored and reviewed by Basho Parks, copyright 2026
