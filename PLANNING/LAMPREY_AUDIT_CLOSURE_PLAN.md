# LAMPREY_AUDIT_CLOSURE_PLAN.md — Audit Closure Phase (AC-0 … AC-42)

**Status: APPROVED 2026-08-22 — STS, three parallel tracks + wrap/Bucket.**
User instruction: split workload onto Delete / Improve / Addition session
branches; when those three are complete, a fourth fresh-context branch
hands off and Buckets **v0.29.0**. Execution protocol:
`PLANNING/AC_PARALLEL_HANDOFF.md`. This drafting session does not implement
product prompts.

Drafted 2026-08-22 from a three-pass live-tree audit (chat/turns, tools/providers,
dead-code/settings). The first draft cited `main` @ `fca7331`. This rewrite
re-verified every cited span against **`main` @ `e3b3a6a`**
(`Prepare v0.28.0 August catalog and Meta Muse release.`) after that ship
landed. Line counts at rewrite time: `electron/ipc/chat.ts` 1915,
`electron/services/providers/registry.ts` 2547, `electron/preload.ts` 1613.

**Source of findings:** the 2026-08-22 audit in this session (canvas
`code-audit.canvas.tsx` plus the three read-only passes). There is no separate
`LAMPREY_*_AUDIT.md` on disk; this file is the plan of record and carries the
evidence.

**Closest ancestors (format, not scope):**
`PLANNING/LAMPREY_JULY_2026_MAINTENANCE_PLAN.md` (audit → remediating STS),
`PLANNING/LAMPREY_SWEET_SPOT_PLAN.md` (evidence tables + K-register + expanded
prompts), `PLANNING/LAMPREY_UNBURDENING_PLAN.md` (delete / keep locks),
`PLANNING/PSPR_TEMPLATE.md` (§0 headings). Hygiene’s roster voice
(`PLANNING/LAMPREY_HYGIENE_PLAN.md`) is the prompt-body density target.

**Graft:** the repo graph is not built (`graft/` empty). Spans below are live
`rg` + file reads on `e3b3a6a`, not graph nodes.

**Target version:** **v0.29.0**. `package.json` is already `0.28.0`. A
forty-three-prompt correctness/operability phase is a minor, not a patch
(July Maintenance precedent: 0.15.6 → 0.16.0). Amend K14 before STS if you
want `0.28.1` instead.

This file is the P-SPR. A plan’s own “STS” wording is not approval. Only the
user’s explicit go-ahead fills the Approval state line.

---

## §0 — Governance

Same discipline as the July Maintenance / Sweet Spot / Unburdening / Hygiene
phases.

### Goal (one sentence)
Close every correctness, settlement, dual-authority, dead-code, settings, and
gate hole named in the 2026-08-22 audit — by deleting scar tissue, improving
the same product, and adding only the missing operability surfaces — without
rebuilding excised machinery and without adding research campaigns.

### Why this phase
Unburdening was the right cut. The product is not under-featured. It is
under-proven. A tool-round cap can ghost a transcript and still mark the turn
`completed`. Two CORE lists share a name and mean different things. Loop and
browser-dev tools stay on the model surface when their toggles are off.
`pre-push` treats a ref-delete like a release. Eighteen native-DB suites can
skip under Node while `verify:proof` prints green. That is the v0.9.2 class
of hole. One phase, one roster, every finding owned.

### Scope (what this phase touches)
- `electron/ipc/chat.ts` — cap settlement, cancel, ghost guard, dispatch extract, gated-pack strip
- `electron/services/finalize-turn.ts` (new) — one closer
- `electron/services/chat-tool-dispatch.ts` (new) — `resolveSingleToolCall` and the tool-window loop
- `electron/ipc/turn-control.ts`, `electron/services/turn-interrupt.ts`, `queued-follow-up-dispatch.ts`, `ghost-reply-guard.ts`
- `electron/services/context-compressor.ts`
- `electron/services/model-tool-surface.ts`, `providers/schema-normalizer.ts`, `core-tool-names.ts` (new), `tool-registry.ts`, `orchestration-tools.ts`, loop + browser-dev packs
- `electron/services/providers/registry.ts` and a new `providers/catalog.ts` — mechanical catalog move only
- `electron/services/default-app-settings.ts`, `src/stores/settings-store.ts`, `src/stores/ui-store.ts` (`SettingsTabId`), Settings UI
- `electron/services/system-prompt-builder.ts`, `conversation-store.ts`, `pipeline-orphans.ts`, `after-action-report.ts`, `failure-ledger.ts`
- `electron/preload.ts` — unused `contracts` namespace
- `scripts/hooks/pre-push`, `.github/workflows/*`, native-skip accounting
- `DEVLOG.md`, `CLAUDE.md` / `AGENTS.md` Current State, `README.md`, `package.json` (wrap only)
- `ARCHITECTURE/FUNCTION_CALLING.md` and OpenWiki refresh at wrap
- `PLANNING/AC_BASELINE.md` (AC-0) and `PLANNING/AC_AFTER.md` (AC-31)

### Non-goals (explicitly out of scope)
- Rebuilding the Planner→Coder→Reviewer pipeline, auto-router, runtime proof gate, or composer (Unburdening stays deleted).
- M4 / Code Mode (parked indefinitely).
- `noUncheckedIndexedAccess` (~700 errors; still deferred from JM-29).
- Authenticode cert / signed Windows builds (owner action).
- Live `supportsTools` probe of every catalog row (needs owner keys; remains an honest gap).
- Loop 24h soak and cheap-model playbook scoring (research-frontier campaigns; their own PSPRs).
- Renaming MCP tool ids (`serverId__tool`) — breaking for existing transcripts.
- Graft graph init (optional maintainer step, not product).
- New native tools, new providers, or growing the system prompt.
- Inventing a plugin-tool runtime. C11 already wired plugin skills, slash commands, and plugin-owned MCP connectors. Native `providerKind: 'plugin'` tools were never a runtime (`tool-registry.ts:267`).

### Decision register (stances — amend before STS if you disagree)

| # | Decision | Stance | Rationale |
|---|---------|--------|-----------|
| K1 | Dead code | **Delete** unused modules/exports. Keep historical DB columns/tables. | Unburdening K2. History is the archive; dormant writers are the torture. |
| K2 | Two CORE lists | Do **not** naively merge. Export `CORE_SURFACE_NAMES` (lazy always-on) and `CORE_NORMALIZE_NAMES` (fail-fast schema) from one module. A source-lock names both and forbids silent drift. | They are different jobs. `web_search` belongs on the lazy surface (`model-tool-surface.ts:24–39`). `verify_workspace` + `shell_*` belong in the fail-fast set (`schema-normalizer.ts:78–88`). Merging either way is a behavior change this phase does not want. |
| K3 | User stop status | One **settlement** status: **`cancelled`**. `interruptTurn` currently writes `interrupted` (`turn-interrupt.ts:173`, typed at `turn-control-types.ts:151`). Change that write + the result type to `cancelled`. Keep the audit event name `turn.interrupted` this phase (historical activity rows + `event-presentation.ts:32`). | Two terminal statuses for one user action. Unifying the event type is a wider activity migration; do it later if at all. |
| K4 | Unknown catalog id | `resolveModel` synthetic fallback: `supportsTools: false`. | Today `:1628` sets `true`. A typo must not get a full native tool payload. |
| K5 | Custom model tools | Typed customs default `supportsTools: false` unless explicitly true, matching live import (`model-import.ts:55`). | `readCustomModelDescriptors` uses `m.supportsTools !== false` (`registry.ts:1594`) — absent means true. Import path already defaults false. |
| K6 | `tool_search` unlocks | Persist per conversation. Restart must not forget unlocks. Clear on conversation delete. | In-memory today (`tool-unlock-state.ts`). Lazy surface is useless across a restart. |
| K7 | Browser developer toggle | Browser panel remains the control. Settings gets a one-line pointer, not a second toggle. | Dual authority is how the two CORE lists happened. |
| K8 | pre-push | Full `verify:proof` when the pushed range touches product paths. Skip (print why) on ref-delete-only and on docs/PLANNING/DEVLOG-only ranges. | `scripts/hooks/pre-push` is one line: `npm run verify:proof`. |
| K9 | Native DB tests | Add a CI job that runs the 18 ABI-guarded files under Electron’s Node. Local `verify:proof` keeps the honest skip banner. | The 18 files are listed in §2 G2. Green-and-skipped is the v0.9.2 hole. |
| K10 | Plugin tools | Do not invent a plugin-tool runtime. AC-40 tells the truth about C11 vs `providerKind: 'plugin'`. | C11 wired skills / commands / plugin MCP. `tool-registry.ts:267` still says plugin tools are “not yet wired.” |
| K11 | MCP approval | Replace `CHROME_DESTRUCTIVE` (`tool-registry.ts:274`, used at `:343`) with descriptor risk metadata. Do not newly require approval for ordinary MCP read tools. | Hardcode is the special case. Risk flags are the house rule. |
| K12 | Provider schema `_provider` | Apply only the already-documented Anthropic / Google / MiniMax wire deltas. No new invented quirks. | `schema-normalizer.ts:161–167` currently unused. |
| K13 | Research | Not in this roster. Named in Honest gaps at wrap. | Own PSPRs. |
| K14 | Version + ship | Phase wrap bumps to **v0.29.0** and **Buckets** from the fourth (wrap) branch. The three work tracks do not version-bump, push, or Bucket. | Approved 2026-08-22: “when fully complete, bucket a new v0.29 from a fourth Branch.” |
| K15 | Parallel STS | Three worktrees, one category each. File ownership in `PLANNING/AC_PARALLEL_HANDOFF.md` beats category when a prompt would edit another track’s files. Wrap owns AC-31, AC-33, AC-34, AC-37, AC-42. | House rule: parallel tracks use separate worktrees. `chat.ts` cannot be three-way-edited. |

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run <the test files this prompt touches>` — clean
4. Any prompt that touches `electron/ipc/chat.ts` also runs `npm run verify:proof -- --no-tests` — exits 0
5. Final phase gate (AC-42): full `npx vitest run` + `npm run build` + `npm run verify:proof`

### Commit discipline
- One commit per prompt. Present-tense imperative subject, ≤72 chars, prompt id in the subject (`fix(chat): AC-1 settle tool-round cap as failure`).
- DEVLOG entry per prompt under `## 2026-08-22 — Audit Closure Phase` (date the day the prompt lands).
- No squashing across prompts. No co-author trailer.
- Owner footer on every commit, own line: `Authored and reviewed by Basho Parks, copyright 2026`
- Never `--no-verify`. If a hook fails, fix the underlying issue.
- No push until the wrap prompt unless the user explicitly says push earlier.

### Worktree / branch
- Shared base: `feat/audit-closure` from `main` (plan + handoff only).
- Three STS worktrees, each a separate checkout (house rule):
  - `feat/audit-closure-delete`
  - `feat/audit-closure-improve`
  - `feat/audit-closure-add`
- Fourth wrap worktree after the three merge: `feat/audit-closure-wrap`
  (or merge the three into `feat/audit-closure` and wrap there). Fresh
  context. Owns AC-31 / AC-33 / AC-34 / AC-37 / AC-42 + Bucket.
- Prompt ownership and merge order: `PLANNING/AC_PARALLEL_HANDOFF.md`.

### Completion criteria
1. Every §1 Delete / Improve / Add row and every §2 finding is `[x]` on a roster prompt or listed under Non-goals / Honest gaps / Do-not-delete / Do-not-add.
2. All AC-0–AC-42 prompts `[x]`. No skipped numbers.
3. Final gate green. DEVLOG phase-complete entry. CLAUDE.md / AGENTS.md Current State updated. README “New in v0.29.0”. Version 0.29.0.
4. Absence locks exist for: cap path is not `completed`; CORE lists live in one module; gated packs stripped in dispatch; unknown model `supportsTools === false`; `suppressDoneEvent` absent; `pipeline-orphans` not imported from production `electron/`.
5. `PLANNING/AC_BASELINE.md` and `PLANNING/AC_AFTER.md` both exist, same measurement method both sides.

### Approval state
- **APPROVED 2026-08-22** by user: STS on three parallel category branches
  (Delete / Improve / Addition); wrap + Bucket v0.29.0 on a fourth fresh
  branch. K14/K15 amended to match. Drafting session is handoff-only.

---

## §1 — Deletions, Improvements, Additions

These three buckets are the audit’s action catalog. They are not a second
roster. Each row names the change, the live evidence, and the prompt that
executes it. Keep and Refuse rows are locks: STS must not delete or add them.

### Deletions

Remove unused code, dead flags, unused renderer surfaces, and sentences that
describe excised UI. Do not drop historical DB columns or live writers.

| ID | Delete | Evidence | Prompt |
|----|--------|----------|--------|
| DEL-1 | `suppressDoneEvent` and every pass-through | `chat.ts:541–548` comment block; param at `:582`, `:731`, `:860`; emits gated at `:1135`, `:1168`, `:1345` | AC-7 |
| DEL-2 | `void FabricatedCitationError` no-op | `chat.ts:395–396` | AC-7 |
| DEL-3 | Prompt 11 / per-stage / pipeline comments in `chat.ts` | `:537–548` (Prompt 11 agent-pipeline); other leftover pipeline comments as found | AC-7 |
| DEL-4 | Duplicate ghost-reply block in `chat:send` catch | `:461–483` duplicates `:746–768` | AC-4 |
| DEL-5 | Extra pending-doc / artifact drains outside `finalizeTurn` | `:347–348`, `:413–414`, `:440–441` plus the finally at `:785–786` | AC-10 |
| DEL-6 | Phantom `onActivity` watchdog as if live | zero `onActivity` matches under `electron/` at rewrite | AC-10 |
| DEL-7 | `pipeline-orphans.ts` + its test | `electron/services/pipeline-orphans.ts`; test is skip-guarded; no production importer | AC-25 |
| DEL-8 | `buildComposerSystemPrompt()` unused export | `system-prompt-builder.ts:128` | AC-26 |
| DEL-9 | Composer-injection comments that imply `PSEUDO_TAG_GUARD` is still appended | export at `:92`; L6 comments at `:108`, `:340`; tests already lock absence | AC-26 |
| DEL-10 | `setMessageProofStatus()` | `conversation-store.ts:849–859`; WC-5 waiver path, no production caller | AC-27 |
| DEL-11 | Renderer `window.api.contracts` preload namespace | `preload.ts:602–611`; zero `src/` callers | AC-29 |
| DEL-12 | `getOpenAITools()` if still unused, else one-line alias | `tool-registry.ts:440`; stale comments `:267`, `:329`, `:488`; `tool-search.ts:11`; `ipc/tools.ts:7` | AC-14 |
| DEL-13 | `filterToolsForRole` + planner/reviewer allowlists if only `'coder'` remains | `chat.ts:819`, `:844` always pass `'coder'`; `tool-registry.ts:509–510` | AC-15 |
| DEL-14 | `proof.gate.passed` / `proof.gate.failed` scoring in after-action | `after-action-report.ts:211–213`; no live producers of passed/failed | AC-30 |
| DEL-15 | “Settings → Agents” sentence | `default-app-settings.ts:22` | AC-32 |
| DEL-16 | `proof-gate.ts` name in `failure-ledger.ts` | `:239` | AC-32 |
| DEL-17 | Planner / Reviewer / “Show pipeline trace” copy | `ReasoningAuditSettings.tsx:27–33` | AC-32 |
| DEL-18 | OpenWiki “plugins are future scaffolding” / `getOpenAITools` as hot path | `openwiki/tools/skills-and-plugins.md:177`; `ARCHITECTURE/FUNCTION_CALLING.md:27`, `:224` | AC-33 |
| DEL-19 | Stale `getOpenAITools` authority in FUNCTION_CALLING.md | same file as DEL-18 | AC-34 |
| DEL-20 | Dead plugin-**tool** hook, if grep finds one | `tool-registry.ts:267` “plugin tools (not yet wired)”. C11 skills/commands/MCP stay. | AC-40 |

#### Do not delete

| Keep | Why |
|------|-----|
| `proof_receipts` / `change_contracts` tables and `verify_workspace` receipt writes | Unburdening K2; the tool still writes |
| `messages.proof_status`, `message_stage_metrics` DDL | Historical rows; AC-28 locks no writer (`schema-init.ts:649–667`) |
| Inert `agentMode` / `proofGate` keys in user `settings.json` | Already locked inert (`default-app-settings.ts:27–30`) |
| `multi_agent_run`, loops, orchestration | Live, opt-in; not scar tissue |
| Persist-side `sanitizePseudoTags` | Safety net; not prompt injection |
| Ghost-reply guard (the remaining one) | Load-bearing settlement |
| C11 plugin skills, slash commands, plugin-owned MCP connectors | Wired. Not the same as plugin native tools. |
| Single-turn seam, IPC envelope, era default of a plain reply | Architecture contract |
| Audit event type `turn.interrupted` | K3: settlement unifies; event name stays this phase |

### Improvements

Same product, fewer dual authorities, honest settlement, cheaper gates.

| ID | Improve | Evidence | Prompt |
|----|---------|----------|--------|
| IMP-1 | Tool-round cap settles `failed`, ghosts the notice, IPC is not success, no queued follow-up | `chat.ts:186`, `:884–893`, `:606`, `:738`, `:784–788` | AC-1 |
| IMP-2 | One cancel IPC that awaits and returns the envelope; settlement `cancelled` | `chat.ts:488–492` fire-and-forget + hardcoded success; `turn-interrupt.ts:173` returns `interrupted` | AC-2 |
| IMP-3 | One `finalizeTurn()` for settle / recover / drain / queue-dispatch | finally `:770–789`; research/send drains at `:347–348`, `:413–414`, `:440–441` | AC-3 |
| IMP-4 | Ghost guard once | `:461–483` and `:746–768` | AC-4 |
| IMP-5 | Queue `registerTurn` conflict is recovered, not thrown past the user | `queued-follow-up-dispatch.ts:152`; throw before `:158` leaves the item queued and returns `failed` | AC-5 |
| IMP-6 | `turn:getState` reports process-dead orphans instead of `activeTurn: null` | `turn-control.ts:377–392` | AC-6 |
| IMP-7 | Extract `resolveSingleToolCall` out of `chat.ts` | `:1437–1915` (479 lines) | AC-8 |
| IMP-8 | Compressor counts `tool_calls` + `reasoning`; skip DB load under a cheap in-memory estimate | `context-compressor.ts:101–105` sums `content` only; `:84–93` hits SQLite every call | AC-9 |
| IMP-9 | Pending docs/artifacts drain once | see DEL-5 | AC-10 |
| IMP-10 | Export both CORE lists from one module; source-lock forbids silent merge | `model-tool-surface.ts:24–39` vs `schema-normalizer.ts:78–88` | AC-11 |
| IMP-11 | Fallback parser validates against the dispatch/contract list | `chat.ts:1014–1015` passes `getDescriptors()` | AC-12 |
| IMP-12 | Strip loop + browser-dev packs at dispatch when off | `orchestration-tools.ts:8–10` names the loop hole; `buildDispatchTools` (`:800–819`) only strips orch | AC-13 |
| IMP-13 | Inline chat handlers move to registry/pack handlers | `chat.ts:1700` `memory_add`; `:1730` `enter_plan_mode`; `:1783` `ask_user_question` | AC-16 |
| IMP-14 | Unknown `resolveModel` id: `supportsTools: false` | `registry.ts:1621–1632`; test locks the opposite (`supports-tools-audit.test.ts:55–57`) | AC-17 |
| IMP-15 | Typed custom models default `supportsTools: false` until proven | `registry.ts:1594` vs `model-import.ts:55` | AC-18 |
| IMP-16 | `tool_search` unlocks persist per conversation; clear on delete | `tool-unlock-state.ts` in-memory | AC-19 |
| IMP-17 | Timeout defaults live only in `DEFAULT_APP_SETTINGS` | keys exist on `AppSettings` (`types.ts:530`) but not on `DefaultAppSettings` (`default-app-settings.ts:31–75`) | AC-21 |
| IMP-18 | Loop Settings copy names chars/4 and multi-round undercount | current hint `LoopSettings.tsx:162` says “soft guard” but not `/4` or the undercount documented at `chat.ts:557–558` | AC-22 |
| IMP-19 | Honest pre-push | `scripts/hooks/pre-push` is `npm run verify:proof` | AC-35 |
| IMP-20 | MCP Chrome-destructive hardcode → risk metadata | `tool-registry.ts:274`, `:343` | AC-38 |
| IMP-21 | Schema normalizer applies documented `_provider` deltas only | `schema-normalizer.ts:161–167` | AC-39 |
| IMP-22 | `MODEL_CATALOG` leaves `registry.ts` | array starts `registry.ts:452`; file is 2547 lines. `catalog-august-2026.ts` is a pin overlay, not this extract. | AC-41 |
| IMP-23 | Source-lock the new invariants in one safety file | new test | AC-37 |

### Additions

Operability surfaces the product already implies. No new native tools, no new
providers, no system-prompt growth, no research campaigns.

| ID | Add | Prompt | Notes |
|----|-----|--------|-------|
| ADD-1 | `PLANNING/AC_BASELINE.md` | AC-0 | Measurement only |
| ADD-2 | Settings → Tools: `toolSurface` (`full` \| `lazy`) | AC-20 | Era default stays `full` (`default-app-settings.ts:91`) |
| ADD-3 | Settings → Tools: `toolResultSpill` + `toolResultSpillBytes` in `DEFAULT_APP_SETTINGS` | AC-20 | Defaults: on, 8192. Keys exist on `AppSettings` (`types.ts:501–502`) and are read in `chat.ts:1246–1249` but are absent from the canonical defaults object. |
| ADD-4 | Transcript card for `tool_search` (name + matches) | AC-23 | Handler at `chat.ts:1503–1522`; no dedicated card |
| ADD-5 | Settings one-line pointer to Browser Developer Mode | AC-24 | K7. Panel remains the control (`browser.ts:155`). |
| ADD-6 | Durable per-conversation unlock store | AC-19 | Same prompt as IMP-16 |
| ADD-7 | `electron/services/finalize-turn.ts` | AC-3 | Extract, not a new behavior |
| ADD-8 | `electron/services/chat-tool-dispatch.ts` | AC-8 | Extract |
| ADD-9 | `electron/services/core-tool-names.ts` | AC-11 | Two named lists, one module |
| ADD-10 | `electron/services/providers/catalog.ts` | AC-41 | Mechanical move of `MODEL_CATALOG` + `RETIRED_MODEL_MAP` if it travels with the array |
| ADD-11 | CI job + `test:native-db` for the 18 ABI-guarded files | AC-36 | Listed in §2 G2 |
| ADD-12 | `audit-closure-safety.test.ts` | AC-37 | Absence + identity locks |
| ADD-13 | Loop Settings honesty copy (chars/4 + undercount) | AC-22 | Hint already calls it a soft guard; finish the sentence |
| ADD-14 | `SettingsTabId` widened to match `SettingsDialog` `TABS` | AC-20 | `ui-store.ts:151–166` is a stale subset (no `loops`, `orchestration`, `reasoning`, `rag`, `snip`, …). Dialog has 24 tabs (`SettingsDialog.tsx:31–55`). |
| ADD-15 | `PLANNING/AC_AFTER.md` | AC-31 | Same method as baseline |

#### Do not add (this phase)

| Refuse | Why |
|--------|-----|
| New native tools, new providers, system-prompt growth | Non-goals |
| Second Browser Developer toggle in Settings | K7 |
| Plugin-tool runtime built from scratch | K10 |
| Planner→Coder→Reviewer, auto-router, runtime proof gate, composer | Unburdening stays deleted |
| M4 / Code Mode | Parked indefinitely |
| Loop 24h soak, cheap-model playbook scoring | Research; own PSPRs (R1, R2) |
| Live `supportsTools` probe of every catalog row | Needs owner keys (TL15) |
| MCP tool-id rename (`serverId__tool`) | Breaking for existing transcripts |
| `noUncheckedIndexedAccess` | ~700 errors; still deferred |
| Authenticode / signed Windows builds | Owner action |
| Graft graph init | Maintainer step, not product |
| Bucket / push at wrap | Only if the user says so (K14) |

---

## §2 — Audit evidence (finding coverage lock)

Every audit row. Owner prompt is `AC-N`. `NG` is Non-goals. Evidence is
`file:line` on `e3b3a6a` unless noted.

### Turn / settlement

| ID | Finding | Evidence | Sev | Prompt |
|----|---------|----------|-----|--------|
| T1 | `MAX_TOOL_ROUNDS` returns null, settles `completed`, no ghost notice, IPC success | Cap at `chat.ts:186`, `:884–893`. Null treated as success `:738`. Settlement inits `'completed'` `:606` and finally settles that status `:784`. Ghost guard is catch-only `:743–768`. Tool-only rows still ghost (`ghost-reply-guard.ts:38–43` — only `system` or non-planner `assistant` counts as a reply). | P0 | AC-1 |
| T2 | `chat:cancel` fire-and-forget; `interrupted` vs `cancelled` | `chat.ts:488–492` does not `await` and always `{ success: true }`. `interruptTurn` returns `status: 'interrupted'` (`turn-interrupt.ts:173`, type `:151`). Abort in headless catch settles `'cancelled'` (`chat.ts:745`). | High | AC-2 |
| T3 | Settlement spread across chat / interrupt / queue / research | Headless finally `:770–789`; research drains `:347–348`; send success/error drains `:413–414`, `:440–441`; `turn-interrupt.ts:185` drains documents itself. | High | AC-3 |
| T4 | Duplicate ghost guard | `chat.ts:461–483` and `:746–768` | Med | AC-4 |
| T5 | Queue `registerTurn` race / throw | `queued-follow-up-dispatch.ts:152` then `:158`. If register throws, `accepted` is still null, catch returns `failed` (`:178–179`) and the queued row is untouched. | High | AC-5 |
| T6 | `turn:getState` hides a DB `running` row when the process has no runtime | `turn-control.ts:377–392` reports `activeTurn: null` unless both store and runtime agree. | Med | AC-6 |
| T7 | `suppressDoneEvent` dead; Prompt 11 comments | `chat.ts:537–548`, `:582`, `:731`, `:860` | Med | AC-7 |
| T8 | `void FabricatedCitationError` no-op | `chat.ts:395–396`. The class is live in `research/synthesizer.ts:49` and rethrown at `chat.ts:392`. | Low | AC-7 |
| T9 | `chat.ts` monolith; `resolveSingleToolCall` inline | File 1915 lines. Function `:1437–1915`. | High | AC-8 |
| T10 | Compressor counts `content` only; loads DB every turn | `context-compressor.ts:84–93`, `:101–105`. `runChatRound` already has a `charCounter` for sent+received (`chat.ts:869–872`, `:741`). | Med | AC-9 |
| T11 | Double drain of pending docs/artifacts | `chat.ts:347–348`, `:413–414`, `:440–441`, `:785–786`, plus mid-round `:1104–1105`, `:1332–1333` | Med | AC-10 |
| T12 | `onActivity` watchdog referenced as if live | Zero `onActivity` matches under `electron/` at rewrite. Do not rewire. | Low | AC-10 |
| T13 | Three `TurnControlStore()` wrappers | `queued-follow-up-dispatch.ts:80`, `turn-runtime.ts:363`, `turn-control.ts:566`, plus task-graph/query/delivery constructors. One finalize path; stores stay if they share DB. | Low | AC-3 |

### Tools / providers

| ID | Finding | Evidence | Sev | Prompt |
|----|---------|----------|-----|--------|
| TL1 | Two incompatible CORE lists, same name | Surface: `model-tool-surface.ts:24–39` (`web_search`, plan tools, `read_tool_result`, `skill_open`). Normalize: `schema-normalizer.ts:78–88` (`verify_workspace`, `shell_list/monitor/stop/output`). Both named `CORE_TOOL_NAMES`. | High | AC-11 |
| TL2 | Fallback parser uses full catalog; contract uses dispatch subset | `chat.ts:1014–1015` | High | AC-12 |
| TL3 | Loop + browser-dev tools stay on the model surface when off | `orchestration-tools.ts:8–10` states the loop hole in comments. `buildDispatchTools` (`chat.ts:800–819`) only calls `filterOrchestrationTools`. | High | AC-13 |
| TL4 | `getOpenAITools()` dead; stale comments/docs | `tool-registry.ts:267`, `:329`, `:440`, `:488`; `ARCHITECTURE/FUNCTION_CALLING.md:27`, `:224` | Med | AC-14 |
| TL5 | `filterToolsForRole` always `'coder'` on the hot path | `chat.ts:819`, `:844` | Med | AC-15 |
| TL6 | Inline chat handlers vs registry handlers | `chat.ts:1700`, `:1730`, `:1783` | Med | AC-16 |
| TL7 | Unknown `resolveModel` id gets `supportsTools: true` | `registry.ts:1621–1632`; `supports-tools-audit.test.ts:55–57` locks that default | High | AC-17 |
| TL8 | Custom-model vs import `supportsTools` default mismatch | `registry.ts:1594` vs `model-import.ts:55` | Med | AC-18 |
| TL9 | `tool_search` unlocks ephemeral | `tool-unlock-state.ts` (module comment `:4`; `unlockTools` at `:38`) | Med | AC-19 |
| TL10 | MCP Chrome-destructive hardcode | `tool-registry.ts:274`, `:343` | Med | AC-38 |
| TL11 | Schema normalizer ignores `_provider` | `schema-normalizer.ts:161–167` | Med | AC-39 |
| TL12 | Plugin `providerKind` never populated for plugin-native tools | `tool-registry.ts:267`; C11 wired skills/commands/plugin MCP (`skill-loader.ts`, `slash-commands.ts`, `mcp-manager.ts` C11 comments) | Med | AC-40 |
| TL13 | MCP id `serverId__tool` length | `tool-registry.ts:342` | — | NG (breaking rename) |
| TL14 | FC-10 downgrade + lazy unlock interaction | Downgrade at `chat.ts:900`; lazy rebuild `:828–848`; unlocks `:1522` | Med | AC-12 + AC-19 |
| TL15 | Live per-model `supportsTools` probe | Needs owner keys | — | NG |

### Settings / defaults

| ID | Finding | Evidence | Sev | Prompt |
|----|---------|----------|-----|--------|
| S1 | `toolSurface` has no Settings UI | Key in `DEFAULT_APP_SETTINGS` (`:45`, `:91`). `SettingsDialog.tsx:31–55` has no Tools tab. | Med | AC-20 |
| S2 | Spill keys used at runtime, missing from canonical defaults | Read at `chat.ts:1246–1249`; typed on `AppSettings` (`types.ts:501–502`); absent from `DefaultAppSettings` (`default-app-settings.ts:31–75`) | Med | AC-20 |
| S3 | Timeout defaults not in `DEFAULT_APP_SETTINGS` | `streamInactivityMs` on `AppSettings` (`types.ts:530`); local read in `registry.ts:51–52`; Timeouts tab exists (`SettingsDialog.tsx:50`) | Med | AC-21 |
| S4 | Loop `tokenBudget` looks hard, is /4; multi-round undercount | Soft-guard hint already at `LoopSettings.tsx:162`. Undercount documented `chat.ts:557–558`. Copy does not say chars/4 or the undercount. | Med | AC-22 |
| S5 | `tool_search` has no transcript card | Handler `chat.ts:1503–1522` | Med | AC-23 |
| S6 | Browser developer not in Settings as a pointer | Toggle lives in Browser panel IPC (`browser.ts:155`). No Settings note. | Low | AC-24 |
| S7 | Stale `agentMode` / `proofGate` keys in user `settings.json` | Inert by design (`default-app-settings.ts:27–30`) | — | Keep inert |
| S8 | `SettingsTabId` is a stale subset of dialog tabs | `ui-store.ts:151–166` vs `SettingsDialog.tsx:31–55` (dialog has `loops`, `orchestration`, `reasoning`, `rag`, `snip`, `persistence`, `activity`, `library`) | Med | AC-20 |

### Dead / stale

| ID | Finding | Evidence | Sev | Prompt |
|----|---------|----------|-----|--------|
| D1 | `pipeline-orphans.ts` production-unwired | module + skip-guarded test; no `electron/` importer | Med | AC-25 |
| D2 | `buildComposerSystemPrompt()` zero callers | `system-prompt-builder.ts:128` | Med | AC-26 |
| D3 | `setMessageProofStatus()` zero callers | `conversation-store.ts:849` | Med | AC-27 |
| D4 | `message_stage_metrics` DDL, no INSERT | `schema-init.ts:649–667` | Low | AC-28 |
| D5 | `window.api.contracts.*` unused in renderer | `preload.ts:602–611`; zero `src/` hits | Med | AC-29 |
| D6 | `proof.gate.passed/failed` no producers; after-action still scores them | `after-action-report.ts:211–213`. `proof.gate.waived` still emitted from `change-contract-store.ts:536` | Med | AC-30 |
| D7 | `PSEUDO_TAG_GUARD` exported, never injected | `system-prompt-builder.ts:92`; absence tests already exist | Low | AC-26 |
| D8 | `COMPOSER_SYSTEM` tests-only | keep smallest absence-lock | Low | AC-26 |
| D9 | Reasoning Audit settings still describes the pipeline | `ReasoningAuditSettings.tsx:27–33` | Med | AC-32 |
| D10 | `default-app-settings.ts` Settings → Agents sentence | `:22` | Med | AC-32 |
| D11 | `failure-ledger.ts` names `proof-gate.ts` | `:239` | Low | AC-32 |
| D12 | OpenWiki plugins “future scaffolding”; function-calling `getOpenAITools` | `openwiki/tools/skills-and-plugins.md:177`; `ARCHITECTURE/FUNCTION_CALLING.md:27` | Med | AC-33 |
| D13 | `messages.proof_status` always NULL on new rows | Keep column (K1); AC-27 removes the setter | — | Keep column |

### Gates / operability

| ID | Finding | Evidence | Sev | Prompt |
|----|---------|----------|-----|--------|
| G1 | pre-push always full `verify:proof` | `scripts/hooks/pre-push` (entire file: `npm run verify:proof`) | High | AC-35 |
| G2 | 18 native-DB suites skip under Node | Files with `HAS_NATIVE_SQLITE`: `db-migrations`, `artifact-store`, `artifact-edit-store`, `conversation-store-sanitize`, `schema-init`, `turn-control-store`, `loop-store`, `proof-receipts`, `failure-ledger`, `snip/tracking`, `snip/apply`, `sessions-search`, `rag/embedder-meta`, `pipeline-orphans`, `loop-runner`, `database-integrity`, `database-checkpoint`, `backup-runner` (all under `electron/services/**/*.test.ts`). Banner logic: `scripts/verify-proof.cjs:51–109`. | High | AC-36 |
| G3 | Need source-locks for the new invariants | none yet | Med | AC-37 |

### Split / catalog

| ID | Finding | Evidence | Sev | Prompt |
|----|---------|----------|-----|--------|
| P1 | `MODEL_CATALOG` inside a 2547-line registry | `registry.ts:452` starts the array; `resolveModel` `:1607`; `chatStream` / `chatOnce` live in the same file. `catalog-august-2026.ts` is a pin overlay, not the extract. | Med | AC-41 |

### Named and refused (research / owner)

| ID | Finding | Prompt |
|----|---------|--------|
| R1 | Loop 24h soak | NG / K13 |
| R2 | Cheap-model playbook scoring | NG / K13 |
| R3 | Unsigned Windows builds | NG |
| R4 | `noUncheckedIndexedAccess` | NG |

---

## §3 — Prompt Roster

Execute in order. Do not batch. Each prompt is one commit. Finding IDs in
the title are the coverage lock (July Maintenance style). Bodies are the
review text (Hygiene / Sweet Spot density).

### Baseline

### **AC-0 — Lock the baseline → `PLANNING/AC_BASELINE.md`**
- [ ] Write `PLANNING/AC_BASELINE.md` with, and only with: (a) line counts for `electron/ipc/chat.ts`, `electron/services/providers/registry.ts`, `electron/services/tool-registry.ts`, `electron/preload.ts`; (b) the 18-file ABI-guarded list from `node scripts/verify-proof.cjs --list-native-skips` (paste the script’s list, do not retype from memory); (c) this plan’s §1 and §2 tables verbatim; (d) `package.json` version (`0.28.0` at rewrite); (e) HEAD SHA at the moment AC-0 commits. No product code. No behavior change.
- **Closes:** ADD-1
- **Files:** `PLANNING/AC_BASELINE.md` only
- **Verify:** file exists; no tsc delta
- **Does not:** start `feat/audit-closure` implementation; that begins at AC-1 after the branch exists. Create the branch as part of this commit or immediately before it.

### Track A — Turn settlement

### **AC-1 — T1: Settle the tool-round cap as failure**
- [x] When `runChatRound` hits `round >= MAX_TOOL_ROUNDS` (`electron/ipc/chat.ts:884–893`) it emits `chat:error` and `return null`. `runHeadlessTurn` treats that null as a clean end (`:738` `if (!result) return null`) and the `finally` at `:784–788` settles whatever `settlementStatus` is — initialized to `'completed'` at `:606`. The ghost-reply guard only runs in `catch` (`:743–768`). `chat:send` therefore returns success. Tool rows are not a visible reply: `turnEndedGhosted` (`ghost-reply-guard.ts:38–43`) only stands down for `role:'system'` or a non-planner `assistant`.

  Change that path only:
  1. The cap must not be a quiet `null`. Throw a small typed error (preferred) or return a failure object that `runHeadlessTurn` cannot confuse with a clean null. Name it so tests can `instanceof` it.
  2. `runHeadlessTurn` catch sets `settlementStatus = 'failed'` (not `'cancelled'` — this is not a user abort).
  3. The existing ghost-reply persist runs. The cap message already tells the user to re-prompt with “continue”; keep that advice, and make it true (partial tool rows stay).
  4. `chat:send` returns `{ success: false, error: <cap message> }`.
  5. Queued follow-ups do not dispatch. The finally already gates on `completed`; keep that.
  6. Source-lock: a test that a cap return is not settled `completed`.

  Do not raise or lower `MAX_TOOL_ROUNDS` (50, `:186`). Do not invent a new user-facing banner.
- **Closes:** T1, IMP-1
- **Files:** `electron/ipc/chat.ts`, `electron/services/ghost-reply-guard.ts` (reuse only), new or extended chat/turn test
- **Verify:** tsc ×2; targeted vitest; `npm run verify:proof -- --no-tests`

### **AC-2 — T2: One cancel path, one settlement status**
- [x] `chat:cancel` (`chat.ts:488–492`) looks up the runtime, fire-and-forgets `interruptTurn`, and returns `{ success: true, data: null }` even when there is no run. `interruptTurn` settles and returns `status: 'interrupted'` (`turn-interrupt.ts:173`; result type `turn-control-types.ts:151`). The headless abort path settles `'cancelled'` (`chat.ts:745`). Two terminals for one user action.

  Per K3:
  1. `chat:cancel` `await`s `interruptTurn` and returns that envelope. If there is no active run, return an honest “nothing to cancel” success or the interrupt envelope’s empty case — do not invent a fake settle.
  2. `interruptTurn` writes settlement `'cancelled'` and the result type becomes `'cancelled'`. Update `turn-interrupt.test.ts` and any source-lock that asserts the string `'interrupted'` as a **settlement** status (`turn-interrupt-wiring.test.ts` is a start).
  3. Preload `turn.interrupt` remains the authority; `chat.cancel` is a thin wrapper (`preload.ts:79`). Renderer keeps working (`TaskControlPanel.tsx:131` toast copy may still say “interrupted” in English).
  4. Do **not** rename the audit event `turn.interrupted` (`event-log.ts:54`, `event-presentation.ts:32`). That is a historical activity row. Note the leftover in DEVLOG.

  Source-lock: the cancel handler contains `await` and does not hardcode `{ success: true, data: null }` before the interrupt result.
- **Closes:** T2, IMP-2
- **Files:** `electron/ipc/chat.ts`, `electron/services/turn-interrupt.ts`, `electron/services/turn-control-types.ts`, preload if the wrapper type changes, the interrupt tests
- **Verify:** tsc ×2; turn-interrupt + chat tests; `npm run verify:proof -- --no-tests`

### **AC-3 — T3/T13: `finalizeTurn()`**
- [x] One function owns the closer that today is copy-pasted: settle the runtime, recover pending steers, drain pending documents, drain pending artifacts, dispatch queued follow-ups only when the settlement is `'completed'`. Call it from `runHeadlessTurn` finally (`chat.ts:770–789`), from `chat:send`’s success and error drains (`:413–414`, `:440–441`), from the research success drain (`:347–348`), from `interruptTurn` (today it drains documents itself at `turn-interrupt.ts:185`), and from queue prep/commit failure (`queued-follow-up-dispatch.ts` `settleTurn`).

  Mid-round drains inside `runChatRound` (`:1104–1105`, `:1332–1333`) stay — those attach documents/artifacts to the in-flight assistant row, they are not turn-closers. Do not merge them into `finalizeTurn`.

  Three `TurnControlStore()` wrappers (T13) are not collapsed in this prompt. One finalize path is the settlement fix; store identity is a later cleanup if a prompt is blocked by it.

  Tests: every call site listed above goes through the new function (source-lock or injected seam). Research behavior is unchanged except for the closer.
- **Closes:** T3, T13 (finalize only), IMP-3, ADD-7
- **Files:** new `electron/services/finalize-turn.ts`, the call sites above
- **Verify:** tsc ×2; targeted tests; `npm run verify:proof -- --no-tests` if `chat.ts` is touched

### **AC-4 — T4: Ghost guard once**
- [x] After AC-1 and AC-3, the guard must run in `runHeadlessTurn` only (`chat.ts:746–768`). Delete the duplicate block in `chat:send` catch (`:461–483`). `chat:send` catch still handles failures that never entered headless (pre-registration). Existing tests that hit either path still pass — `loop-turn-wiring.test.ts` already source-locks `turnEndedGhosted(rows)` in the headless path.
- **Closes:** T4, IMP-4, DEL-4
- **Files:** `electron/ipc/chat.ts`
- **Verify:** tsc ×2; ghost-reply + chat + loop-turn-wiring tests; `npm run verify:proof -- --no-tests`

### **AC-5 — T5: Queue dispatch must not throw past the user**
- [x] `dispatchNextQueuedFollowUp` (`queued-follow-up-dispatch.ts:145`) calls `deps.registerTurn` at `:152` before claiming the follow-up at `:158`. If a turn is already running, `turnRuntimeRegistry.register` throws. `accepted` is still null, so the catch (`:163–179`) cannot reject the row; it returns `{ status: 'failed' }` and the queued item stays queued.

  If `registerTurn` refuses because a turn is already running, mark the follow-up rejected or recovered with an honest reason (`turn still running` / `register conflict`). Do not leave a thrown conflict as a stalled queue item. Do not dispatch a second turn on top of a live one.

  Test the conflict. The existing suite (`queued-follow-up-dispatch.test.ts`) is the home.
- **Closes:** T5, IMP-5
- **Files:** `electron/services/queued-follow-up-dispatch.ts`, its tests
- **Verify:** tsc ×2; that suite

### **AC-6 — T6: Honest orphan turn state**
- [ ] `getState` (`turn-control.ts:360–392`) returns `activeTurn: null` unless the DB row is `running` **and** the process has a matching runtime. After a crash, Activity/UI therefore says nothing is running while `conversation_turns` still says `running`. `recoverOrphans` remains the sweeper; this prompt only makes the read honest.

  Surface `orphaned: true` (or an equivalent field on the envelope) when the store has `running` and `lookupActive` is empty. Do not auto-settle in this prompt. Types and the renderer must not crash if they ignore the new field; Activity may show the orphan when it already renders turn state.
- **Closes:** T6, IMP-6
- **Files:** `electron/ipc/turn-control.ts`, turn-control types, a turn-control test
- **Verify:** tsc ×2; turn-control tests

### Track B — chat.ts scar and compressor

### **AC-7 — T7/T8: Delete dead turn flags and comments**
- [ ] Remove `suppressDoneEvent` from `runChatRound` / `runHeadlessTurn` and every recursive pass-through (`chat.ts:541–548`, `:582`, `:731`, `:860`, and the three emit gates). Delete the Prompt 11 agent-pipeline comment block (`:537–548`). Delete `void FabricatedCitationError` and `void DeepResearchCancelledError` (`:395–396`). The classes stay — research still throws them (`:389–392`, `research/synthesizer.ts:49`). Delete leftover per-stage / pipeline comments in `chat.ts` that describe excised behavior. A source-lock forbids the identifier `suppressDoneEvent` under `electron/`.
- **Closes:** T7, T8, DEL-1, DEL-2, DEL-3
- **Files:** `electron/ipc/chat.ts`, any test that passed the flag
- **Verify:** tsc ×2; `npm run verify:proof -- --no-tests`; grep lock in a small test

### **AC-8 — T9: Extract tool dispatch from chat.ts**
- [ ] Move `resolveSingleToolCall` (`chat.ts:1437–1915`) and the tool-window loop that calls it (`:1217`, `:1231`) into `electron/services/chat-tool-dispatch.ts`. `chat.ts` keeps IPC, `runHeadlessTurn`, `runChatRound` orchestration. Behavior byte-compatible: same approval, fallback ids, MCP `__` split, `tool_search` unlock handler (`:1503–1522` may move with it or stay as a named function the dispatch module calls). Target: `chat.ts` loses the 479-line function. Do not “clean up” adjacent comments while moving. `steering-boundary-wiring.test.ts:43` source-locks the name `resolveSingleToolCall(` — update that lock to the new module or keep a thin re-export.
- **Closes:** T9, IMP-7, ADD-8
- **Files:** new dispatch module, `chat.ts`, existing tool/chat/steering wiring tests
- **Verify:** tsc ×2; tool + chat tests; `npm run verify:proof -- --no-tests`

### **AC-9 — T10: Compressor counts the stack it actually sends**
- [ ] `projectedTokens` (`context-compressor.ts:101–105`) sums `content` only and `loadRawMessages` (`:84–93`) hits SQLite on every call. `shouldCompress` (`:114–121`) therefore undercounts turns that are mostly `tool_calls` + `reasoning`, then pays a DB round-trip to learn it was under threshold.

  `projectedTokens` / the compress threshold must include `tool_calls` and `reasoning` (same fields `charCounter` already counts in `runChatRound`). If a cheap in-memory estimate from the stack already in hand is under the compress threshold, do not `loadRawMessages`. Test: under-threshold path does not call the loader (inject or source-lock the guard). Do not change the compressor’s summary algorithm in this prompt.
- **Closes:** T10, IMP-8
- **Files:** `electron/services/context-compressor.ts`, `chat.ts` call site if the skip lives there
- **Verify:** tsc ×2; compressor tests; `npm run verify:proof -- --no-tests` if `chat.ts` is touched

### **AC-10 — T11/T12: Single drain; retire the phantom watchdog**
- [ ] After AC-3, pending document/artifact **turn-close** drain happens only in `finalizeTurn`. Remove the extra close-drains in `chat:send` success/error and the research success path (`chat.ts:347–348`, `:413–414`, `:440–441`). Keep mid-round drains (`:1104–1105`, `:1332–1333`).

  `onActivity` has zero `electron/` matches. Add a one-line comment at the old watchdog mention in docs only if one still claims it is live (CLAUDE/AGENTS historical entries stay historical). No new timer. Do not rewire a stage inactivity watchdog.
- **Closes:** T11, T12, DEL-5, DEL-6, IMP-9
- **Files:** `electron/ipc/chat.ts`
- **Verify:** tsc ×2; `npm run verify:proof -- --no-tests`

### Track C — Tool surface

### **AC-11 — TL1: Name both CORE lists in one module**
- [ ] Today both lists are named `CORE_TOOL_NAMES` and they disagree. Lazy always-on (`model-tool-surface.ts:24–39`): `shell_command`, `apply_patch`, `workspace_context`, `view_image`, `web_search`, `ask_user_question`, `update_plan`, `enter_plan_mode`, `exit_plan_mode`, `get_goal`, `read_tool_result`, `skill_open`. Fail-fast normalize (`schema-normalizer.ts:78–88`): `workspace_context`, `view_image`, `shell_command`, `apply_patch`, `verify_workspace`, `shell_list`, `shell_monitor`, `shell_stop`, `shell_output`.

  Move them to `electron/services/core-tool-names.ts` as `CORE_SURFACE_NAMES` and `CORE_NORMALIZE_NAMES`. Both call sites import from there. Source-lock lists both arrays verbatim. Per K2: do not add `web_search` to the normalizer fail-fast set; do not drop `verify_workspace` from it; do not silently union them.
- **Closes:** TL1, IMP-10, ADD-9
- **Files:** new `electron/services/core-tool-names.ts`, the two callers, their tests
- **Verify:** tsc ×2; model-tool-surface + schema-normalizer tests

### **AC-12 — TL2/TL14: Fallback parser sees the same tools as the contract**
- [ ] `parseFallbackToolCalls` is fed `toolRegistry.getDescriptors()` (`chat.ts:1014–1015`) — the full catalog — while the fallback contract and the native `tools` array are the dispatch subset (lazy CORE + unlocks, or full). A fallback model can therefore “call” a name the contract never listed.

  Validation uses the dispatch `tools` list for that round, not `getDescriptors()`. Mid-conversation FC-10 downgrade (`chat.ts:900`) still injects the contract for the tools that round will accept. Test: a name absent from the contract cannot dispatch via fallback. Pair with AC-19’s unlock leak test (TL14).
- **Closes:** TL2, part of TL14, IMP-11
- **Files:** `electron/ipc/chat.ts` or `chat-tool-dispatch.ts`, `fallback-tool-parser.ts`
- **Verify:** tsc ×2; fallback + chat tests; `npm run verify:proof -- --no-tests`

### **AC-13 — TL3: Strip gated packs at dispatch**
- [ ] `filterOrchestrationTools` (`orchestration-tools.ts:23–30`) already strips `agent_fanout` / `agent_critique` / `agent_advisor` when orchestration is off. The file’s own comment (`:8–10`) says loop tools “stay in the surface and refuse at the handler.” `buildDispatchTools` (`chat.ts:800–819`) only applies the orch filter.

  When `loopsEnabled` is false, loop tools are absent from the model surface (same pattern, same helper shape). When `browserDeveloperModeEnabled` is false, browser-dev tools are absent. Handlers remain fail-closed as a second belt. Source-lock: `buildDispatchTools` (or successor) contains both filters. Do not change defaults (`loopsEnabled: false`, `browserDeveloperModeEnabled: false`).
- **Closes:** TL3, IMP-12
- **Files:** `electron/ipc/chat.ts` or dispatch helper, `orchestration-tools.ts` or a sibling filter, loop + browser packs, safety tests
- **Verify:** tsc ×2; loop-safety + browser + chat tests; `npm run verify:proof -- --no-tests`

### **AC-14 — TL4: Kill or alias `getOpenAITools()`**
- [ ] Delete the unused function (`tool-registry.ts:440`) **or** make it a one-line wrapper over `getNormalizedToolsForProvider`. Fix stale comments in `tool-registry.ts:267`, `:329`, `:488`; `tool-search.ts:11`; `electron/ipc/tools.ts:7`. Production call sites stay `getNormalizedToolsForRole` / `getModelToolSurface`. Architecture doc rewrite waits for AC-34; this prompt only stops the code comments from lying.
- **Closes:** TL4, DEL-12
- **Files:** those four plus any test that named the old function
- **Verify:** tsc ×2; tool-registry tests

### **AC-15 — TL5: Drop the dead role filter on the hot path**
- [ ] Chat dispatch always passes `'coder'` (`chat.ts:819`, `:844`). Grep production callers of `filterToolsForRole` / `getNormalizedToolsForRole`. If the only production caller is that `'coder'` hot path, delete the role filter and the planner/reviewer allowlists (`role-tool-access.ts:84`) and call `getNormalizedToolsForProvider` (or equivalent) directly. If `multi_agent_run` still needs planner/reviewer subsets, keep the helper and stop pretending chat uses it — chat calls the provider path. Tests become absence locks or the remaining subset tests. WC-2’s “wired into tool prep” comments get corrected.
- **Closes:** TL5, DEL-13
- **Files:** `tool-registry.ts`, `role-tool-access.ts`, `chat.ts`
- **Verify:** tsc ×2; tool-registry tests; `npm run verify:proof -- --no-tests`

### **AC-16 — TL6: Registry owns native handlers that chat currently inlines**
- [ ] `memory_add` (`chat.ts:1700`), `enter_plan_mode` (`:1730`), `exit_plan_mode` (adjacent), `ask_user_question` (`:1783`), and `create_document` if it is still inlined, dispatch through registry/pack handlers like the other natives. `tool_search` may stay a chat-adjacent handler (it unlocks conversation state) but it must be a named function in the dispatch module, not a buried branch. Same approval and result shapes. No new tools.
- **Closes:** TL6, IMP-13
- **Files:** packs under `electron/services/`, `chat-tool-dispatch.ts`, tests
- **Verify:** tsc ×2; the moved tools’ tests; `npm run verify:proof -- --no-tests`

### **AC-17 — TL7: Unknown model ids do not get native tools**
- [ ] Synthetic `resolveModel` fallback (`registry.ts:1621–1632`) currently sets `supportsTools: true`. The audit test `supports-tools-audit.test.ts:55–57` **locks that default**. Flip the fallback to `supportsTools: false` (K4) and flip the test. A nonsense id does not produce `supportsTools: true`. Retired-map hits (`:1611–1615`) still return the mapped catalog row unchanged. Custom models still win over the fallback (`:1617–1619`).
- **Closes:** TL7, IMP-14
- **Files:** `electron/services/providers/registry.ts`, `supports-tools-audit.test.ts`, catalog-invariants if they mention the fallback
- **Verify:** tsc ×2; those tests

### **AC-18 — TL8: Custom models default tools off until proven**
- [ ] `readCustomModelDescriptors` uses `m.supportsTools !== false` (`registry.ts:1594`) — omitted means true. Live import already defaults false (`model-import.ts:55`). Typed `settings.json` custom models match the import path: `supportsTools` defaults false unless explicitly true (K5). Existing users who set true keep it. `ModelSettings.tsx` draft default (`:53` and `:185`) must not silently re-check the box for new customs. Test the default.
- **Closes:** TL8, IMP-15
- **Files:** `registry.ts`, `ModelSettings.tsx` if its draft default disagrees, model-import if needed, tests
- **Verify:** tsc ×2; resolve/import tests; tsc web if the settings draft changes

### **AC-19 — TL9/TL14: Persist `tool_search` unlocks**
- [ ] Unlock set is in-memory (`tool-unlock-state.ts`). A restart forgets every unlock. Persist per `conversationId` (K6): small table or an existing conversation-scoped blob. Survive process restart. Clear on conversation delete (JM-11 already clears capability state — extend that path). Test a restart-shaped reload.

  FC-10 downgrade + lazy (TL14): one test that unlock state does not leak tools the downgraded round must not see. AC-12’s contract list is the other half of TL14.
- **Closes:** TL9, rest of TL14, IMP-16, ADD-6
- **Files:** `tool-unlock-state.ts`, conversation delete path, schema/migration if a table is required, tests
- **Verify:** tsc ×2; unlock + delete tests. If a migration is added, name it in DEVLOG and keep it additive.

### Track D — Settings and honesty

### **AC-20 — S1/S2/S8: Settings → Tools (surface, spill, tab types)**
- [ ] New Settings tab (or a section on an existing tab — prefer a **Tools** tab next to Timeouts): `toolSurface` (`full` | `lazy`), `toolResultSpill` (on/off), `toolResultSpillBytes`. Add the spill keys to `DEFAULT_APP_SETTINGS` and the renderer literal; `default-app-settings.test.ts` parity must pass. Defaults stay era: surface `full` (`:91`), spill on, 8192 bytes.

  Widen `SettingsTabId` (`ui-store.ts:151–166`) to match `SettingsDialog` `TABS` (`SettingsDialog.tsx:31–55`) so deep-links to Loops / Orchestration / Reasoning / RAG / Snip / Persistence / Activity / Library type-check. That is S8. Do not redesign the dialog.
- **Closes:** S1, S2, S8, ADD-2, ADD-3, ADD-14
- **Files:** `default-app-settings.ts`, `settings-store.ts`, `ui-store.ts`, new settings component, `SettingsDialog.tsx`, `default-app-settings.test.ts`
- **Verify:** tsc ×2; default-app-settings + settings component tests

### **AC-21 — S3: Timeout defaults belong in DEFAULT_APP_SETTINGS**
- [ ] `streamInactivityMs` and `mcpCallTimeoutMs` live in the canonical defaults object (current 60s / 120s, already the Timeouts panel’s working numbers). `StreamingTimeoutsSettings.tsx`, `registry.ts:51–52`, and `mcp-manager.ts` read those defaults — no third local constant. Parity test extended. Do not change the numbers.
- **Closes:** S3, IMP-17
- **Files:** `default-app-settings.ts`, `settings-store.ts`, `StreamingTimeoutsSettings.tsx`, `registry.ts`, `mcp-manager.ts`, parity test
- **Verify:** tsc ×2; `default-app-settings.test.ts`

### **AC-22 — S4: Loop Settings tells the truth about tokens**
- [ ] `LoopSettings.tsx:162` already says the token budget is a soft guard and that iteration + wall-clock are the hard caps. It does not say the estimate is chars/4, and it does not say multi-round tool turns undercount (documented at `chat.ts:557–558`). Finish the hint. No formula change in this prompt.
- **Closes:** S4, IMP-18, ADD-13
- **Files:** `src/components/settings/LoopSettings.tsx`
- **Verify:** tsc web; a source-lock string test if one exists for that panel

### **AC-23 — S5: `tool_search` card in the transcript**
- [ ] Unlock / search tool calls render a real tool card (name + matches), not an invisible meta-round. Reuse existing tool-card chrome (`ToolUseCard.tsx`). Handler stays at the named function from AC-8/AC-16 (`chat.ts:1503–1522` today). No new panel. No new pill.
- **Closes:** S5, ADD-4
- **Files:** renderer tool-card mapping, types if needed
- **Verify:** tsc web; era-chrome or tool-card test

### **AC-24 — S6: Settings pointer to Browser Developer**
- [ ] Per K7: no second toggle. Settings gets a short note that Browser Developer Mode is armed from the Browser panel (`browser.ts:155`). Optional deep-link if the app already has panel routing. One line, not a new tab.
- **Closes:** S6, ADD-5
- **Files:** Settings dialog or a small settings snippet
- **Verify:** tsc web

### Track E — Dead code

### **AC-25 — D1: Delete `pipeline-orphans`**
- [x] Remove `electron/services/pipeline-orphans.ts` and `pipeline-orphans.test.ts`. No production importer remains (already true). Absence lock: production `electron/` does not import that path. This also drops one of the 18 ABI-guarded files; AC-0’s list in AFTER (AC-31) will show 17 unless another file is added. That is correct, not a regression.
- **Closes:** D1, DEL-7
- **Files:** the two pipeline-orphans files (deleted)
- **Verify:** tsc ×2; grep lock

### **AC-26 — D2/D7/D8: Composer leftovers**
- [x] Delete `buildComposerSystemPrompt` (`system-prompt-builder.ts:128`) if still unused. If `COMPOSER_SYSTEM` exists only to prove the composer is gone, keep the smallest absence-lock test and drop the unused export. `PSEUDO_TAG_GUARD` (`:92`): keep the string if tests lock “not injected” (`system-prompt-builder.test.ts:552–567`); delete any comment that implies it is still appended to prompts (`:108`, `:340`).
- **Closes:** D2, D7, D8, DEL-8, DEL-9
- **Files:** `system-prompt-builder.ts` + tests
- **Verify:** tsc ×2; system-prompt-builder tests

### **AC-27 — D3: Delete `setMessageProofStatus`**
- [x] Remove the unused store function (`conversation-store.ts:849–859`). Column `messages.proof_status` stays. Chat continues to omit writes on new rows. `contracts:waive` comments that name this setter get corrected if the IPC still exists for historical contracts (AC-29 decides the IPC).
- **Closes:** D3, D13 (setter only), DEL-10
- **Files:** `conversation-store.ts` + any test that called the setter
- **Verify:** tsc ×2; conversation-store tests (node:sqlite or skip-honest)

### **AC-28 — D4: Lock `message_stage_metrics` as write-less**
- [x] Keep the table (`schema-init.ts:649–667`, K1). Add a source-lock test: no `INSERT INTO message_stage_metrics` under `electron/` except schema. Comment on the DDL: historical RT2, no writer since Unburdening.
- **Closes:** D4
- **Files:** `schema-init.ts`, a small source-lock test
- **Verify:** tsc ×2; that test

### **AC-29 — D5: Drop unused contracts preload**
- [x] `src/` has zero `api.contracts` callers. Remove the preload `contracts` namespace (`preload.ts:602–611`). Keep main-process `contracts:*` IPC (`electron/ipc/contracts.ts`) if any model tool still uses it; if the IPC is also unused, delete the renderer-facing half and document the main IPC as tool-only, or delete both in this prompt after grep. Do not drop `change_contracts` tables. `proof.gate.waived` from `change-contract-store.ts:536` is AC-30’s problem, not this one’s.
- **Closes:** D5, DEL-11
- **Files:** `electron/preload.ts`, possibly `electron/ipc/contracts.ts`
- **Verify:** tsc ×2; preload/contracts tests if any

### **AC-30 — D6: After-action stops scoring dead proof.gate events**
- [x] `after-action-report.ts:211–213` still counts `proof.gate.passed` / `failed` / `waived`. Passed and failed have no producers. `proof.gate.waived` is still emitted (`change-contract-store.ts:536`). Stop treating passed/failed as live signals. Historical rows may still be listed as legacy if present. Keep waived scoring only if that emit remains after AC-29’s grep; otherwise drop that score too and say so in DEVLOG.
- **Closes:** D6, DEL-14
- **Files:** `after-action-report.ts` + tests
- **Verify:** tsc ×2; after-action tests

### Track F — Measurement, comments, generated docs

### **AC-31 — ADD-15: After snapshot → `PLANNING/AC_AFTER.md`**
- [ ] Re-run the AC-0 measurements with the same method: line counts for the four files, the ABI-guarded list from `verify:proof --list-native-skips`, HEAD SHA, `package.json` version (still 0.28.0 until AC-42). Walk every §1 and §2 row and mark landed / not-yet (AC-32–AC-42 remain). Record surprises (for example AC-25 dropping `pipeline-orphans.test.ts` from the skip list). No product code.
- **Closes:** ADD-15
- **Files:** `PLANNING/AC_AFTER.md`
- **Verify:** file exists; method matches AC-0

### **AC-32 — D9/D10/D11: Stale UI and comment copy**
- [x] Fix `default-app-settings.ts:22` (no Settings → Agents; those modes were deleted in UB-7). Fix `failure-ledger.ts:239` (`proof-gate.ts` is gone). Fix `ReasoningAuditSettings.tsx:27–33` Planner/Reviewer / “Show pipeline trace” copy to match current single-agent + reasoning-trail behavior. Historical CLAUDE.md / AGENTS.md phase entries stay historical.
- **Closes:** D9, D10, D11, DEL-15, DEL-16, DEL-17
- **Files:** those three
- **Verify:** tsc ×2; era-chrome / settings tests if they lock copy

### **AC-33 — D12: OpenWiki refresh**
- [ ] After the code prompts above, run the repo OpenWiki update (`openwiki --update -p` or MCP lifecycle) so `openwiki/tools/skills-and-plugins.md:177` no longer calls plugins “future scaffolding” and function-calling pages no longer claim `getOpenAITools` as the hot path. Do not hand-edit generated claims sidecars. If the CLI/MCP is unavailable, record `user-verification-needed` and still correct `ARCHITECTURE/FUNCTION_CALLING.md` in AC-34.
- **Closes:** D12, DEL-18
- **Files:** OpenWiki-owned pages via the official update path
- **Verify:** the two pages on disk match the code; no new invented pages

### **AC-34 — DEL-19: ARCHITECTURE/FUNCTION_CALLING.md**
- [ ] Cite real `Invoked from: <file>:<line>` sites for the normalized path (`getNormalizedToolsForProvider` / `getModelToolSurface` / `buildDispatchTools`). Remove or footnote `getOpenAITools` (`ARCHITECTURE/FUNCTION_CALLING.md:27`, `:224`). WC-9 standard. Do not claim live `supportsTools` probes this phase did not run.
- **Closes:** DEL-19
- **Files:** `ARCHITECTURE/FUNCTION_CALLING.md`
- **Verify:** file review; no tsc

### Track G — Gates

### **AC-35 — G1: Honest pre-push**
- [ ] Implement K8 in `scripts/hooks/pre-push`: full `verify:proof` when the pushed commit range touches product paths; skip (print why) on ref-delete-only and on docs/PLANNING/DEVLOG-only ranges. Product paths mean anything outside `PLANNING/`, `DEVLOG.md`, `README.md`, `RELEASE_NOTES/`, `openwiki/`, `*.md` at repo root, and similar doc-only trees — be explicit in the hook. Add a small node test or a documented dry-run example in the hook comment. Do not weaken pre-commit. Do not skip on mixed ranges that include `electron/` or `src/`.
- **Closes:** G1, IMP-19
- **Files:** `scripts/hooks/pre-push`, maybe a `scripts/` helper
- **Verify:** the helper’s unit test if extracted; manual dry-run notes in DEVLOG

### **AC-36 — G2: Native-DB CI under Electron ABI**
- [ ] CI job runs the 18 (or post-AC-25, 17) skip-listed files in an environment where better-sqlite3 loads (Electron’s ABI, or `electron-rebuild` + the same Node Electron uses). Local `verify:proof` keeps the skip banner (`scripts/verify-proof.cjs:89–109`). Job failure is red, not skip. Add `npm run test:native-db` that names the files. DEVLOG records whether the job was proven on a real runner this prompt or is `user-verification-needed`.
- **Closes:** G2, ADD-11
- **Files:** `.github/workflows/*`, `package.json` script, maybe a thin wrapper
- **Verify:** workflow file present; script listed in `package.json`

### **AC-37 — G3: Source-lock the new invariants**
- [ ] One test file (or additions to existing safety tests) that locks: cap path is not `completed`; CORE lists live in one module and are not silently equal; gated packs stripped in dispatch; unknown model `supportsTools === false`; `suppressDoneEvent` absent; `pipeline-orphans` not imported from production `electron/`. This is the phase’s absence-lock file, same job `era-chrome.test.ts` and `loop-safety.test.ts` do for their phases.
- **Closes:** G3, IMP-23, ADD-12
- **Files:** e.g. `electron/services/audit-closure-safety.test.ts`
- **Verify:** tsc ×2; that file

### Track H — Provider / MCP (narrow)

### **AC-38 — TL10: MCP approval from risk metadata**
- [ ] Replace `CHROME_DESTRUCTIVE` (`tool-registry.ts:274`) and the `serverId === 'chrome' && CHROME_DESTRUCTIVE.has(tool.name)` special case (`:343`) with the same risk flags other tools use (K11). Chrome destructive tools must still require approval. Test the Chrome set still gates; a non-Chrome MCP tool without write/destructive risk does not newly start requiring approval.
- **Closes:** TL10, IMP-20
- **Files:** `tool-registry.ts`, permissions tests
- **Verify:** tsc ×2; those tests

### **AC-39 — TL11: Documented `_provider` wire deltas only**
- [ ] Schema normalizer reads `_provider` (`schema-normalizer.ts:161–167` currently unused) and applies only the already-written Anthropic / Google / MiniMax notes in `registry.ts` / `ARCHITECTURE/FUNCTION_CALLING.md` (K12). Test one documented delta. No new provider behavior. If the documented deltas are comments-only and have no concrete transform, implement the documented ones or record in DEVLOG that the notes were comments and this prompt is a no-op plus a test that unused `_provider` is now read. Do not invent a third provider quirk to look busy.
- **Closes:** TL11, IMP-21
- **Files:** `schema-normalizer.ts`, tests
- **Verify:** tsc ×2; normalizer tests

### **AC-40 — TL12: Plugin tools: tell the truth**
- [x] C11 already hooks plugin skills (`skill-loader.ts`), slash commands (`slash-commands.ts`), and plugin-owned MCP servers (`mcp-manager.ts` C11 comments). `tool-registry.ts:267` still says “plugin tools (not yet wired).” There is no `providerKind: 'plugin'` native-tool loader.

  Grep for a dead plugin-tool registration hook. If one exists and is dead, delete it. If it never existed, correct ARCHITECTURE + OpenWiki (with AC-33) so “plugin tools” is not a load-bearing claim. Update the `tool-registry.ts:267` comment to name what C11 actually wired. Do not build a new plugin-tool runtime (K10). DEVLOG records which branch was taken.
- **Closes:** TL12, DEL-20
- **Files:** plugin-loader / tool-registry / docs as the grep decides
- **Verify:** tsc ×2; honest DEVLOG note

### Track I — Catalog extract

### **AC-41 — P1: `MODEL_CATALOG` leaves registry.ts**
- [ ] Mechanical move of the catalog array starting at `registry.ts:452` (and `RETIRED_MODEL_MAP` at `:1545` if it is only used there) to `electron/services/providers/catalog.ts`. `registry.ts` keeps `resolveModel` (`:1607`), `chatStream`, `chatOnce`, descriptors. `catalog-august-2026.ts` stays a pin overlay — do not fold it in or edit rows. `catalog-invariants.test.ts`, `supports-tools-audit.test.ts`, and August catalog tests keep passing. No catalog row edits in this prompt.
- **Closes:** P1, IMP-22, ADD-10
- **Files:** new catalog module, `registry.ts`, tests
- **Verify:** tsc ×2; catalog-invariants + provider-parity + August catalog tests

### Wrap

### **AC-42 — Phase wrap**
- [ ] Full gate: lint, tsc ×2, full vitest, build, `verify:proof`. Bump `package.json` to **0.29.0**. Update CLAUDE.md + AGENTS.md Current State (this phase; honest gaps: R1–R4, live `supportsTools`, unsigned builds, `turn.interrupted` event-name leftover). README “New in v0.29.0”. DEVLOG phase-complete entry with the house tail (`Final gate:` + `Honest gaps:`). Append any last-row checkmarks that AC-31 marked not-yet. **Bucket** (`pwsh scripts\bucket.ps1`) from this wrap branch. The three work tracks must already be merged.
- **Closes:** K14, completion criteria 2–5
- **Files:** `package.json`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `DEVLOG.md`, this plan
- **Verify:** §0 item 5

---

## §4 — STS execution

**This phase is not one linear session.** Follow `PLANNING/AC_PARALLEL_HANDOFF.md`.
Summary:

1. Shared base `feat/audit-closure` from `main` holds this approved plan + the handoff. No product prompts on the base except AC-0 if the Add track has not started yet.
2. Three worktrees, one category. Inside a track, still one prompt at a time, in the handoff’s order, one commit each.
3. File ownership in the handoff beats §1 category. Do not edit another track’s exclusive files.
4. Per prompt: read the listed files at the cited lines → implement only that prompt → run its verify gate → on fail, fix and retry up to 2 times; on the third failure halt, write a blocked DEVLOG entry, and report → on pass, mark `[x]`, write DEVLOG, commit.
5. §1 Keep and Refuse rows are locks. Do not delete proof tables, `multi_agent_run`, loops, orchestration, or C11 skills/commands/plugin MCP. Do not add research campaigns, a second Browser Developer toggle, or a plugin-tool runtime.
6. Merge order into wrap: Improve, then Delete, then Add. Wrap owns AC-31, AC-33, AC-34, AC-37, AC-42 + Bucket.
7. AC-33 may no-op if OpenWiki CLI is unavailable; then record `user-verification-needed` and still correct ARCHITECTURE in AC-34.
8. AC-36 may land the workflow without a green Actions run in-session; that is an honest gap, not a fake green.
9. Chat.ts-touching prompts always run `verify:proof --no-tests` in addition to tsc ×2.
10. Do not ask further product questions unless a prompt is blocked by a K-stance the user has not taken. The register above is the stance.

### DEVLOG entry format (use verbatim)

```markdown
## [Audit Closure — Prompt AC-N] <Title>  —  <YYYY-MM-DD>

**Files changed:** <list>
**Verify gate:**
- tsc node ✓
- tsc web ✓
- vitest <subset> ✓ (N tests)
- <manual smoke steps + result, OR "user-verification-needed: <what to check>">

**Notes:** <anything surprising, deferred, or worth knowing>

**Commit:** <SHA>
```

---

Authored and reviewed by Basho Parks, copyright 2026
