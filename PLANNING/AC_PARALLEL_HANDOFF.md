# AC_PARALLEL_HANDOFF.md — Audit Closure, three tracks + wrap

**Status:** binding protocol for the 2026-08-22 STS approval.
**Plan:** `PLANNING/LAMPREY_AUDIT_CLOSURE_PLAN.md` (APPROVED).
**Base at approval:** `main` @ `e3b3a6a` (v0.28.0). Re-read cited spans; they
may have moved if a track already landed.
**This file exists because** the drafting session is out of context room.
Do not ask that session to implement product prompts.

### Session commence titles (exact)

A new chat that is only one of these lines **is** that track. Read this
file and the plan, then start the first assigned prompt. Do not wait for
a longer opener.

| User prompt (verbatim) | Track | Branch | First prompt |
|------------------------|-------|--------|--------------|
| `Lamprey Audit Closure: Addition Branch` | Addition | `feat/audit-closure-add` | AC-0 |
| `Lamprey Audit Closure: Deletion Branch` | Deletion | `feat/audit-closure-delete` | AC-25 |
| `Lamprey Audit Closure: Improvement Branch` | Improvement | `feat/audit-closure-improve` | AC-1 |
| `Lamprey Audit Closure: Wrap Branch` | Wrap (later) | `feat/audit-closure-wrap` | merge, then AC-31 |

The wrap title is reserved for the fourth session. Do not start wrap
until the three work tracks are merged.

---

## What was approved

1. STS the Audit Closure P-SPR.
2. Split the work onto **three new session branches**, one per §1 category:
   Delete, Improve, Addition.
3. When those three are complete, a **fourth branch with fresh context**
   wraps and **Buckets v0.29.0**.

K-stances in the plan stand, including K3 (settlement `cancelled`, keep
event name `turn.interrupted`), K4/K5 (`supportsTools: false` defaults),
K7 (no second Browser Developer toggle), K10 (no plugin-tool runtime),
K14 (wrap Buckets v0.29.0).

---

## How to cut the trees

House rule: parallel tracks use **separate git worktrees**, not extra
checkouts of the same directory.

From repo root, after the approved plan + this handoff are on a shared base:

```text
git checkout main
git pull
git checkout -b feat/audit-closure
# commit the approved plan + this handoff if they are not already on main
git worktree add "../Lamprey-Harness-AC-Improve" -b feat/audit-closure-improve
git worktree add "../Lamprey-Harness-AC-Delete"  -b feat/audit-closure-delete
git worktree add "../Lamprey-Harness-AC-Add"     -b feat/audit-closure-add
```

Wrap tree is created later, from the merged base:

```text
git worktree add "../Lamprey-Harness-AC-Wrap" -b feat/audit-closure-wrap feat/audit-closure
```

Names can change. Ownership below is what must not change.

---

## File ownership (beats category)

If a prompt’s §1 category says Delete but the file is Improve-owned, the
Improve session does that prompt. That is how `chat.ts` does not get three
editors.

### Improve exclusive — do not touch from Delete or Add

- `electron/ipc/chat.ts`
- `electron/services/finalize-turn.ts` (created by AC-3)
- `electron/services/chat-tool-dispatch.ts` (created by AC-8)
- `electron/services/turn-interrupt.ts`
- `electron/services/turn-control-types.ts`
- `electron/ipc/turn-control.ts`
- `electron/services/queued-follow-up-dispatch.ts`
- `electron/services/ghost-reply-guard.ts`
- `electron/services/context-compressor.ts`
- `electron/services/core-tool-names.ts` (created by AC-11)
- `electron/services/model-tool-surface.ts`
- `electron/services/providers/schema-normalizer.ts`
- `electron/services/providers/registry.ts`
- `electron/services/providers/catalog.ts` (created by AC-41)
- `electron/services/orchestration-tools.ts` (and any sibling strip helper)
- `electron/services/tool-registry.ts`
- `electron/services/role-tool-access.ts`
- `electron/services/fallback-tool-parser.ts`
- `scripts/hooks/pre-push`

### Delete exclusive — do not touch from Improve or Add

- `electron/services/pipeline-orphans.ts` + `pipeline-orphans.test.ts` (delete)
- `electron/services/system-prompt-builder.ts` (composer leftovers only)
- `electron/preload.ts` (`contracts` namespace only)
- `electron/ipc/contracts.ts` (only if AC-29’s grep says the IPC is unused)
- `electron/services/after-action-report.ts`
- `electron/services/failure-ledger.ts` (comment only)
- `src/components/settings/ReasoningAuditSettings.tsx` (copy only)
- `electron/services/schema-init.ts` (DDL comment + no-writer lock only)

### Add exclusive — do not touch from Improve or Delete

- `PLANNING/AC_BASELINE.md` (AC-0)
- `electron/services/default-app-settings.ts` (keys **and** the Settings → Agents comment)
- `src/stores/settings-store.ts`
- `src/stores/ui-store.ts` (`SettingsTabId`)
- `src/components/settings/SettingsDialog.tsx`
- new Settings → Tools component
- `src/components/settings/LoopSettings.tsx`
- `src/components/settings/StreamingTimeoutsSettings.tsx` (default read only)
- renderer tool-card mapping for `tool_search`
- `electron/services/tool-unlock-state.ts` + conversation-delete cleanup for unlocks
- `.github/workflows/*` and `package.json` **script only** for `test:native-db`
  (wrap owns the version field)

### Shared with care (coordinate, do not race)

| File | Who | Rule |
|------|-----|------|
| `electron/services/conversation-store.ts` | Delete AC-27 removes `setMessageProofStatus`. Add AC-19 adds unlock cleanup next to the existing delete path. | Different functions. Do not reformat the file. |
| `electron/services/mcp-manager.ts` | Add AC-21 may point timeout default at `DEFAULT_APP_SETTINGS`. | One-line read. Do not refactor. |
| `DEVLOG.md` | All four | Append only, under `## 2026-08-22 — Audit Closure Phase`. Never rewrite another track’s entry. |
| `PLANNING/LAMPREY_AUDIT_CLOSURE_PLAN.md` | All four | Check `[x]` on **your** prompts only. Do not restyle the file. |
| `package.json` | Add may add `test:native-db`. Wrap bumps version to 0.29.0. | Do not bump version on a work track. |

---

## Prompt assignment

Inside a track, execute **in the order listed**. One prompt, one commit.
Do not start the next prompt until the current one is `[x]` + committed.

### Improve — `feat/audit-closure-improve`

Settlement, dual-authority, extracts. Owns `chat.ts`.

| Order | Prompt | Notes |
|------:|--------|-------|
| 1 | AC-1 | Cap settles `failed`. |
| 2 | AC-2 | Cancel awaits; settlement `cancelled`. |
| 3 | AC-3 | `finalizeTurn()`. |
| 4 | AC-4 | Ghost guard once (category Delete, file is chat.ts). |
| 5 | AC-5 | Queue register conflict. |
| 6 | AC-6 | Orphan turn state. |
| 7 | AC-7 | Delete `suppressDoneEvent` + Prompt 11 comments (category Delete, file is chat.ts). |
| 8 | AC-8 | Extract `resolveSingleToolCall`. |
| 9 | AC-9 | Compressor counts the real stack. |
| 10 | AC-10 | Single drain (category Delete, file is chat.ts). |
| 11 | AC-11 | Both CORE lists, one module. |
| 12 | AC-12 | Fallback parser uses dispatch list. |
| 13 | AC-13 | Strip loop + browser-dev packs. |
| 14 | AC-14 | Kill/alias `getOpenAITools` (category Delete, file is tool-registry). |
| 15 | AC-15 | Drop dead `'coder'` role filter. |
| 16 | AC-16 | Move inline handlers to packs. |
| 17 | AC-17 | Unknown id `supportsTools: false`. Flip the test that locks the opposite. |
| 18 | AC-18 | Custom models default tools off. Skip `ModelSettings.tsx` if Add already owns that draft default — then only change `registry.ts`. |
| 19 | AC-35 | Honest pre-push. |
| 20 | AC-38 | MCP approval from risk metadata. |
| 21 | AC-39 | Documented `_provider` deltas only. |
| 22 | AC-41 | `MODEL_CATALOG` → `catalog.ts`. Do not edit rows. |

Do **not** do AC-19 (Add), AC-37 (Wrap), AC-42 (Wrap).

### Delete — `feat/audit-closure-delete`

Scar tissue that does not live in Improve’s files.

| Order | Prompt | Notes |
|------:|--------|-------|
| 1 | AC-25 | Delete `pipeline-orphans` + test. |
| 2 | AC-26 | Composer leftovers in `system-prompt-builder.ts`. |
| 3 | AC-27 | Delete `setMessageProofStatus`. Column stays. |
| 4 | AC-28 | Lock `message_stage_metrics` write-less. |
| 5 | AC-29 | Drop unused `window.api.contracts` preload. |
| 6 | AC-30 | After-action stops scoring dead `proof.gate.passed/failed`. |
| 7 | AC-32 | **Only** `failure-ledger.ts` + `ReasoningAuditSettings.tsx`. The Settings → Agents comment is Add (AC-20), because Add owns `default-app-settings.ts`. |
| 8 | AC-40 | Tell the truth about C11 vs plugin-native tools. No new runtime. Docs that wrap will refresh (AC-33/34) can wait; fix the lying comment in `tool-registry.ts` **only if Improve has not already** — if the file is mid-edit on Improve, put the comment fix in DEVLOG as `blocked-on-improve` and leave AC-40’s code comment for wrap. Prefer: change only `plugin-loader.ts` / OpenWiki-adjacent prose you own, and leave `tool-registry.ts:267` to Improve’s AC-14 pass (Improve must fix that sentence while it is in the file). |

If AC-40 cannot touch `tool-registry.ts` without a collision, Delete’s AC-40
is: grep, DEVLOG the finding, no file fight. Wrap finishes the comment.

Do **not** edit `chat.ts`. AC-4 / AC-7 / AC-10 are Improve’s.

### Add — `feat/audit-closure-add`

Operability surfaces. AC-0 first so AFTER has a baseline.

| Order | Prompt | Notes |
|------:|--------|-------|
| 1 | AC-0 | `PLANNING/AC_BASELINE.md` only. Run `node scripts/verify-proof.cjs --list-native-skips` and paste that list. |
| 2 | AC-20 | Settings → Tools + widen `SettingsTabId`. Also delete the Settings → Agents sentence in `default-app-settings.ts:22` (was AC-32). |
| 3 | AC-21 | Timeout defaults into `DEFAULT_APP_SETTINGS`. |
| 4 | AC-22 | Loop Settings: name chars/4 and the multi-round undercount. Hint already says “soft guard.” |
| 5 | AC-23 | `tool_search` transcript card. |
| 6 | AC-24 | Settings pointer to Browser Developer. No second toggle. |
| 7 | AC-19 | Persist `tool_search` unlocks. Clear on conversation delete. TL14 test. |
| 8 | AC-36 | `test:native-db` + CI job. Do not bump `package.json` version. |

Do **not** do AC-31 or AC-37 (Wrap).

### Wrap — `feat/audit-closure-wrap` (fourth session, fresh context)

Create this tree only after Improve, Delete, and Add have each finished their
tables and the three branches are merged (order below).

| Order | Prompt | Notes |
|------:|--------|-------|
| 1 | Merge Improve, then Delete, then Add into the wrap branch. Resolve conflicts. Improve wins on `chat.ts` and `tool-registry.ts` unless Delete/Add hunks are clearly disjoint. |
| 2 | AC-31 | `PLANNING/AC_AFTER.md`. Same method as AC-0. |
| 3 | AC-33 | OpenWiki refresh. `user-verification-needed` if CLI/MCP is down. |
| 4 | AC-34 | `ARCHITECTURE/FUNCTION_CALLING.md` WC-9 citations. |
| 5 | AC-37 | Source-lock the merged invariants. Must see the merged tree. |
| 6 | AC-42 | Full gate, version **0.29.0**, CLAUDE.md / AGENTS.md / README / DEVLOG. |
| 7 | Bucket | `pwsh scripts\bucket.ps1`. User authorized this for wrap only. |

---

## Merge order

```text
feat/audit-closure
        │
        ├── improve  ──┐
        ├── delete   ──┼──►  wrap  ──►  v0.29.0 + Bucket
        └── add      ──┘
```

1. Merge **Improve** first (settlement + `chat.ts`).
2. Merge **Delete** second.
3. Merge **Add** third.
4. Wrap session starts from that merge, not from `main`.

Do not merge a work track to `main`. Wrap / Bucket is the publish path.

---

## Session commence (what those titles mean)

The user will start each work session with **only** the title below.
That title is the whole instruction. The assigned session:

1. Confirms it is in the matching worktree (not this drafting checkout).
2. Reads `PLANNING/LAMPREY_AUDIT_CLOSURE_PLAN.md` and this file.
3. Starts the first prompt in its table. One prompt, one gate, one commit.
4. Stops when its table is all `[x]`. No version bump. No Bucket.

**`Lamprey Audit Closure: Improvement Branch`**
Worktree `feat/audit-closure-improve`. Exclusive files + Improve table.
Order: AC-1 → AC-18, AC-35, AC-38, AC-39, AC-41.

**`Lamprey Audit Closure: Deletion Branch`**
Worktree `feat/audit-closure-delete`. Exclusive files + Delete table.
Order: AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-32 (ledger +
Reasoning Audit copy only), AC-40. Do not edit `chat.ts` or
`default-app-settings.ts`.

**`Lamprey Audit Closure: Addition Branch`**
Worktree `feat/audit-closure-add`. Exclusive files + Add table.
Order: AC-0, AC-20, AC-21, AC-22, AC-23, AC-24, AC-19, AC-36.
AC-20 also removes the Settings → Agents sentence.

**`Lamprey Audit Closure: Wrap Branch`** (fourth session, after merge)
Worktree `feat/audit-closure-wrap`. Merge Improve, then Delete, then Add.
Then AC-31, AC-33, AC-34, AC-37, AC-42, then Bucket v0.29.0.

---

## What the drafting session already knows (do not re-derive)

- Graft graph is **not** built. Use `rg` + file reads. Spans in the plan
  were verified on `e3b3a6a`.
- `MAX_TOOL_ROUNDS` is 50 at `electron/ipc/chat.ts:186`. Cap returns null
  at `:884–893`. Settlement inits `'completed'` at `:606`.
- `chat:cancel` is fire-and-forget at `:488–492`. `interruptTurn` returns
  `interrupted` (`turn-interrupt.ts:173`).
- Two CORE lists, both named `CORE_TOOL_NAMES`:
  `model-tool-surface.ts:24–39` vs `schema-normalizer.ts:78–88`. Do not merge.
- `buildDispatchTools` only strips orchestration (`chat.ts:800–819`).
  Loop hole is named in `orchestration-tools.ts:8–10`.
- Unknown `resolveModel` fallback is `supportsTools: true` at
  `registry.ts:1628`. `supports-tools-audit.test.ts:55–57` locks that — flip it.
- 18 ABI-guarded files are listed in the plan §2 G2. AC-25 will drop
  `pipeline-orphans.test.ts` from that set.
- C11 already wired plugin skills, commands, and plugin MCP. There is no
  plugin-native-tool runtime. Do not invent one.
- Loop Settings already calls token budget a soft guard
  (`LoopSettings.tsx:162`). Add only chars/4 + undercount (`chat.ts:557–558`).
- `SettingsTabId` (`src/stores/ui-store.ts:151`) is a stale subset of
  `SettingsDialog` `TABS` (24 tabs). That is S8, Add’s AC-20.

---

## Halt rules (every track)

- Third verify failure on one prompt: stop, blocked DEVLOG, report. Do not
  skip ahead.
- New product decision: stop. K-register is closed unless the user amends it.
- Merge conflict on an exclusive file: the file’s owner wins. The other
  track redoes its hunk on top, or wrap does.
- Never `--no-verify`. Never push from a work track unless the user says push.
- Never Bucket except wrap.

---

Authored and reviewed by Basho Parks, copyright 2026
