# OD_AFTER.md — Operability Debt measurement lock (after)

**Prompt:** OD-12
**Captured:** 2026-08-23
**package.json version at this prompt:** `0.29.0` (OD-14 bumps to `0.30.0`)
**Method:** same as `PLANNING/OD_BASELINE.md` —
`fs.readFileSync(f,'utf8').split(/\r?\n/).length`.

## Line counts

| File | Baseline | After | Delta |
|------|---------:|------:|------:|
| `electron/ipc/chat.ts` | 1358 | 1364 | +6 |
| `electron/services/finalize-turn.ts` | 113 | 113 | 0 |
| `electron/services/turn-interrupt.ts` | 185 | 185 | 0 |
| `electron/services/tool-unlock-state.ts` | 118 | 118 | 0 |
| `electron/services/tool-unlock-persist.ts` | 44 | 52 | +8 |
| `electron/services/providers/registry.ts` | 1752 | 1745 | −7 |
| `electron/services/providers/catalog.ts` | 808 | 954 | +146 |
| `electron/services/providers/catalog-august-2026.ts` | 153 | gone | −153 |
| `electron/ipc/chat-turn-settlement.test.ts` | 158 | 169 | +11 |
| `electron/services/finalize-turn.test.ts` | 130 | 151 | +21 |
| `electron/services/turn-interrupt.test.ts` | 155 | 176 | +21 |
| `electron/services/tool-unlock-state.test.ts` | 126 | 138 | +12 |
| `electron/services/headless-turn-settlement.test.ts` | — | 82 | new |
| `electron/services/operability-debt-safety.test.ts` | — | 46 | new |

## PLANNING root

11 markdown files at `PLANNING/*.md` before this file; 12 including
`OD_AFTER.md`. `PLANNING/archive/` holds 73 markdown files (72 moved +
`archive/README.md`).

`catalog-august-2026.ts` is gone. Registry has no overlay push-loop.

## Soft inventory (closed)

| # | Leftover | After |
|---|---------|-------|
| S1 | Live settlement behavioral tests | OD-1/2/3: cap → `failed`; cancel → `cancelled` + `turn.interrupted`; closer queues only on `completed`. Thin WC-8 kept. |
| S2 | Honest gaps with teeth | OD-4 lock file + OD-7 parked/non-goal wording. |
| S3 | Mid-round vs finalize comments | OD-5 comments + WC-8 comment lock. Drains not merged. |
| S4 | Loud-fail unlock persist | OD-6: missing-table no-ops; other errors rethrow. |
| S5 | CLAUDE/AGENTS Current State | OD-7 synced. v0.30.0 Current State entry is OD-14. |
| S6 | One catalog story | OD-8/9: August rows in `catalog.ts`; overlay deleted. |
| S7 | Archive + pointer | OD-10/11: spent trees in `PLANNING/archive/`; README names live canon. |

Authored and reviewed by Basho Parks, copyright 2026
