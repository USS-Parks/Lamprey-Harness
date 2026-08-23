# OD_BASELINE.md — Operability Debt measurement lock (before)

**Prompt:** OD-0
**Captured:** 2026-08-23
**HEAD at measurement:** `3e0fde9` (`Fix native-DB CI failures from the first Actions run`)
**package.json version:** `0.29.0`
**Method:** same as `PLANNING/AC_BASELINE.md` / `PLANNING/AC_AFTER.md` —
physical line counts via `fs.readFileSync(f,'utf8').split(/\r?\n/).length`.

## Line counts

| File | Lines |
|------|------:|
| `electron/ipc/chat.ts` | 1358 |
| `electron/services/finalize-turn.ts` | 113 |
| `electron/services/turn-interrupt.ts` | 185 |
| `electron/services/tool-unlock-state.ts` | 118 |
| `electron/services/tool-unlock-persist.ts` | 44 |
| `electron/services/providers/registry.ts` | 1752 |
| `electron/services/providers/catalog.ts` | 808 |
| `electron/services/providers/catalog-august-2026.ts` | 153 |
| `electron/ipc/chat-turn-settlement.test.ts` | 158 |
| `electron/services/finalize-turn.test.ts` | 130 |
| `electron/services/turn-interrupt.test.ts` | 155 |
| `electron/services/tool-unlock-state.test.ts` | 126 |

## PLANNING root

81 markdown files at `PLANNING/*.md` (no `archive/` yet).

## Soft inventory (open at baseline)

| # | Leftover | Evidence at `3e0fde9` |
|---|---------|------------------------|
| S1 | Settlement is WC-8 + unit closer, not a live catch/finally | `chat-turn-settlement.test.ts` reads `chat.ts`. `finalize-turn.test.ts` covers `completed` / `failed` only. No `headless-turn-settlement.test.ts`. |
| S2 | Honest gaps are wrap prose | CLAUDE.md / AGENTS.md Current State lists R1–R4, live `supportsTools`, unsigned builds, `turn.interrupted` leftover, OpenWiki + native-DB CI as `user-verification-needed`. No lock file. |
| S3 | Mid-round drains have no closer comment | `chat.ts` ~1063 and ~1261 drain without saying they are not `finalizeTurn`. |
| S4 | Unlock persist swallows SQLite errors | `tool-unlock-persist.ts` `save` / `clear` / `load` empty `catch`. |
| S5 | Current State still two catalog stories | August 2026 catalog is a separate Current State bullet from Audit Closure’s “catalog extract”. |
| S6 | Overlay push-loop | `registry.ts:451–455` pushes `AUGUST_2026_MODELS` onto `MODEL_CATALOG`. |
| S7 | Spent plans at PLANNING root | 81 markdown files; no `PLANNING/archive/`. |

## Notes

Native-DB CI first Actions run was closed on `main` (`3e0fde9`) after AC-42
listed it `user-verification-needed`. OD-7 drops that clause.

Authored and reviewed by Basho Parks, copyright 2026
