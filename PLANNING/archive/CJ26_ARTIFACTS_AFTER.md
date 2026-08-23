# Codex July 2026 Artifacts — v0.22.0 Local Evidence

**Prompts:** VA-1–VA-6

**Evidence date:** 2026-07-18

**Release state:** local version cut; not pushed, tagged, or published

**Parity claim:** withheld pending packaged owner GUI evidence

## Milestone matrix

| Prompt | Delivered substrate                                                                 | Mechanical evidence                                           | Status |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| VA-1   | stable artifact/revision/annotation ledger, migration v24, legacy mirrors           | exact schema + native store/retention/provenance suite        | PASS   |
| VA-2   | strict lazy visualization/read/update/annotate tools                                | schema/risk/size/sanitization/conflict suite                  | PASS   |
| VA-3   | message visualization identity, live states, inline safe cards, sandbox open/export | 42-test focused cohort, build, renderer/proof smokes          | PASS   |
| VA-4   | v26 edit proposals, exact selection, chat request, diff, accept/reject, annotations | 45-test native/UI cohort, build, renderer smoke               | PASS   |
| VA-5   | unified artifact activity and honest open outcomes                                  | 20-test status/no-false-success cohort, build, renderer smoke | PASS   |
| VA-6   | architecture/current-state/version/release notes/full gate                          | final receipt below                                           | PASS   |

## Reuse outcome

M3 extends Lamprey's existing message documents, artifact sandbox, tool registry, typed preload,
chat event spine, Zustand transcript state, and Activity feed. It does not introduce a second
chat executor, renderer database access, alternate permission path, or interactive raw-HTML
message format.

Genuinely new state is limited to the durable artifact/revision/annotation ledger, one message
attachment identity column, and edit proposals. Existing document/research payloads remain
canonical-compatible and are mirrored deterministically rather than rewritten or invalidated.

## Focused evidence already complete

- VA-1: 34 native focused tests, 0 skipped.
- VA-2: 33 focused tests, 0 skipped.
- VA-3: 42 focused tests, 0 skipped; production build, renderer smoke, proof static gate.
- VA-4: 45 focused tests, 0 skipped; production build and renderer smoke.
- VA-5: 20 focused tests, 0 skipped; production build and renderer smoke.
- Both TypeScript programs and focused lint passed at every prompt.

## Full milestone receipt

`npm.cmd run verify:all` exited 0 on 2026-07-18:

- production Electron/Vite build passed (main, preload, and renderer);
- repository ESLint passed;
- both TypeScript programs passed;
- host Vitest passed 218 files and 2,688 tests, with 15 files / 159 tests skipped;
- bundle smoke passed (`out\\main\\index.js` loaded in 577 ms);
- renderer smoke passed (HTML, two referenced assets, and root mount verified);
- proof gate explicitly disclosed that 18 native-DB suites were not exercised by host Node's
  incompatible `better-sqlite3` ABI.

The M3 native database cohort was therefore rerun through Electron 43 with
`ELECTRON_RUN_AS_NODE=1`: 5 files and 38 tests passed, 0 skipped. It covered the exact artifact
schema, immutable revision store, edit proposals, migrations, and conversation-store
integration. Focused prompt gates add 174 passing checks across VA-1 through VA-5; their
overlapping tests are supporting evidence and are not added to the repository-suite total.

The automated milestone gate is complete. The separate packaged owner GUI playbook remains an
honest open conformance gate as recorded below.

## Owner GUI ledger

`PLANNING/CJ26_ARTIFACT_EDITING_PLAYBOOK.md` remains `USER-VERIFICATION-NEEDED` in this
automated session. Therefore M3 is locally implementation-complete, but it must not be labeled
blanket current-Codex parity or published without separate authorization.

## Remaining scope

M4 through M8 remain independent approval cuts. This M3 instruction does not authorize Code
Mode, PR Chat, MCP resource/auth expansion, Browser Developer Mode, automation/goal work,
push, tag, release asset creation, or Bucket publication.

---

Authored and reviewed by Basho Parks, copyright 2026
