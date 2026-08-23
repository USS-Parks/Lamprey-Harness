# AC_BASELINE.md — Audit Closure measurement lock

**Prompt:** AC-0
**Captured:** 2026-08-22
**HEAD:** `482c371a704b8faff3130843fa7d7e82b9c2efa7`
**package.json version:** `0.28.0`
**Method:** physical line counts via `(Get-Content -LiteralPath <file>).Count`. ABI-guarded list from the same walk as `scripts/verify-proof.cjs` `listNativeGuardedTestFiles()` (`HAS_NATIVE_SQLITE` or `nativeOk()` under `electron/` and `src/`). `node scripts/verify-proof.cjs --list-native-skips` printed the loads banner on this machine (better-sqlite3 loads under this Node) and did not enumerate paths; the 18-file list below is that walk, not retyped from the plan.

## Line counts

| File | Lines |
|------|------:|
| `electron/ipc/chat.ts` | 1915 |
| `electron/services/providers/registry.ts` | 2547 |
| `electron/services/tool-registry.ts` | 1191 |
| `electron/preload.ts` | 1613 |

## ABI-guarded native-DB test files (18)

`node scripts/verify-proof.cjs --list-native-skips` output:

```
[verify:proof] better-sqlite3 native binding loads under this Node — 18 ABI-guarded test file(s) run their native-DB suites.
```

`listNativeGuardedTestFiles()` (same walk the script uses):

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
- electron/services/pipeline-orphans.test.ts
- electron/services/proof-receipts.test.ts
- electron/services/rag/embedder-meta.test.ts
- electron/services/schema-init.test.ts
- electron/services/sessions-search.test.ts
- electron/services/snip/apply.test.ts
- electron/services/snip/tracking.test.ts
- electron/services/turn-control-store.test.ts

The plan's §1 and §2 tables follow verbatim from `PLANNING/LAMPREY_AUDIT_CLOSURE_PLAN.md` at this HEAD.

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

