# Codex July 2026 MCP resources and sessions — after matrix

**Local target:** v0.24.0, not published

| Contract | Evidence | Result |
| --- | --- | --- |
| Capability-aware resources/templates with pagination, exact URI binding, bounds, timeout, cancellation, and notifications | MR-1 manager cohort; `acd3a83` | PASS |
| Strict lazy resource tools with server provenance, canonical content blocks, and the existing spill valve | MR-2 manager/tool/schema/lazy cohort; `4579974` | PASS |
| Streamable HTTP OAuth 2.1/PKCE, keychain-only secrets, lifecycle, reauthorization, reconnect, redaction, and URL elicitation | MR-3 auth/manager/security cohort; `1d65e3f` | PASS |
| Connector/plugin auth state, resources/templates, pagination, safe preview/open, and metadata-only activity | MR-4 UI/preview/build/smoke cohort; `fba4d6d` | PASS |
| Local fixture resource workflow | `CJ26_MCP_PLAYBOOK.md` | USER-VERIFICATION-NEEDED |
| Real hosted-provider OAuth and elicitation workflow | `CJ26_MCP_PLAYBOOK.md` | USER-VERIFICATION-NEEDED |

## MR-5 full-gate evidence

- `npm run verify:all`: PASS
- lint and both TypeScript projects: PASS
- Vitest: 230 files passed / 15 skipped; 2752 tests passed / 162 skipped / 0 failed
- production build, bundle smoke, renderer smoke, and `verify:proof`: PASS
- `git diff --check`: PASS

The proof gate explicitly reports that 18 native-database files skip native DB suites because the installed `better-sqlite3` binding targets Electron's ABI rather than this Node runtime. M6 adds no database migration, and its manager/auth/tool/UI cohorts run without that skip; the full green gate is not represented as native-DB coverage.

Implementation completion means every approved M6 prompt is gated and locally committed. It does not mean live hosted-provider parity while both owner playbooks remain open. No push, tag, Bucket run, CDN update, binary publication, or public release is included. M4 remains parked indefinitely; M7–M9 remain unapproved.

---

Authored and reviewed by Basho Parks, copyright 2026

## Production override — 2026-07-19

The owner authorized the completed M6 tranche for v0.24.0 production publication: push the
release cut to `main`, run Bucket, and verify GitHub, R2, and CDN delivery. This supersedes
only the earlier no-publication boundary. The local-fixture and hosted-provider playbooks
remain `USER-VERIFICATION-NEEDED`, and M4 plus M7–M9 remain outside this release.

---

Authored and reviewed by Basho Parks, copyright 2026
