# TL_BASELINE.md — Triple Lane measurement lock (before)

**Prompt:** TL-0
**Captured:** 2026-08-23
**HEAD at measurement:** `8364ba3` (`docs(planning): approve Triple Lane P-SPR for STS`)
**package.json version:** `0.30.1`
**P-SPR:** `PLANNING/LAMPREY_TRIPLE_LANE_PLAN.md`

## 1. Tip + version

| Field | Value |
|-------|-------|
| `git rev-parse HEAD` | `8364ba3be19087a96553977b10e5eae3b4862ea4` |
| `package.json` version | `0.30.1` |

## 2. Lane goals (this phase)

| Lane | Goal |
|------|------|
| A | Pin current Claude Code evidence, inventory vs Lamprey tip, pick ≤5 High-ROI Low/Med-risk deltas or an empty wont table (K12). |
| B | OpenRouter-only routing depth: fallbacks + provider prefs + optional auto. Direct-provider default stays (K4). |
| C | Local OpenAI-compatible polish: Ollama / LM Studio / Unsloth Studio API presets, health probe, capability posture. No training UI (K6). |

## 3. CJ26 Claude Code refresh seed

Cited from `PLANNING/CJ26_FOLLOW_ON_CANDIDATES.md` (candidates only; not a P-SPR of its own):

| Candidate | Bounded question | First gate |
|-----------|------------------|------------|
| `LAMPREY_CLAUDE_CODE_REFRESH_PSPR.md` | Refresh the Claude Code target against a pinned current release and adjudicate Lamprey's historical Claude-focused parity documents. | Official/version-pinned Claude inventory plus owner traces; mark every June claim retained, narrowed, stale, or superseded. |

Lane A is that gate, scoped by this Triple Lane P-SPR (K2/K3/K12). No change to the completed Codex July ledger.

## 4. OpenRouter code touchpoints

| Site | Role at `8364ba3` |
|------|-------------------|
| `electron/services/providers/registry.ts` `PROVIDERS.openrouter` (~154–160) | Built-in opt-in aggregator. `baseURL` `https://openrouter.ai/api/v1`. |
| `electron/services/providers/provider-parity.test.ts` | Locks **zero** pinned `MODEL_CATALOG` rows with `provider === 'openrouter'` (v0.27.1 direct-provider default). |
| `chatStream` / `chatOnce` (`registry.ts`) | OpenAI SDK `chat.completions.create`. Extra body via `providerChatExtras(desc)` (~1051) — today MiniMax `reasoning_split` only. **No** OpenRouter `models` fallbacks, `provider` prefs, or auto-route fields. |
| `listLiveModelIds` (`registry.ts` ~710) | Live `/v1/models` import. OpenRouter uses the default OpenAI catalog strategy. |
| `electron/ipc/model.ts` | IPC for live import. |
| `src/components/settings/ModelSettings.tsx` | "Import from /v1/models" UI. |
| `src/components/settings/ApiKeySettings.tsx` | OpenRouter key card under aggregators. |
| `electron/services/keychain.ts` | Key stored under provider id `openrouter`. |
| `electron/ipc/chat.ts` ~886 | Turn seam calls `chatStream`. Untouched for Lane B except if extras must be threaded from settings. |

**Request-build seam for Lane B:** `providerChatExtras` (and/or a sibling that reads settings only when `desc.provider === 'openrouter'`). Non-OpenRouter providers must stay byte-identical (K4/K5).

## 5. customProviders / local-endpoint touchpoints

| Site | Role at `8364ba3` |
|------|-------------------|
| `settings.json` `customProviders` | `{ id, baseURL, label?, requiresKey? }`. Settings sanitizer is open-by-design (`electron/ipc/settings.ts` `sanitizeSettingsPartial`). |
| `readCustomProviderDescriptors` (`registry.ts` ~571–629) | Promotes custom ids to first-class providers. Built-in ids cannot be shadowed. `requiresKey !== true` ⇒ `keyOptional`. |
| `resolveProviderDescriptor` / `isKnownProvider` | Built-in first, then custom map. |
| `readCustomModelDescriptors` (`registry.ts` ~761) | `supportsTools` / `supportsVision` default **false** unless the stored flag is exactly `true` (PX2 import posture already). |
| `src/components/settings/ApiKeySettings.tsx` | Manual Add endpoint (id/label/baseURL/requiresKey). No one-click Ollama / LM Studio / Unsloth presets. |
| Built-in `ollama` / `lmstudio` (`registry.ts` ~408–423) | Already first-class, keyless, empty catalogs, default `http://127.0.0.1:11434/v1` and `:1234/v1`. `providerBaseUrlOverrides` already covers LAN/non-default ports. |
| `validateProviderKeyDetailed` + `listLiveModelIds` | Key/catalog probe exists. No dedicated "connection refused" health copy for local presets. |
| Unsloth Studio | **Absent.** Not a built-in; Lane C preset only. |

## 6. Soft inventory S1–S8 (at baseline)

| # | Soft issue | Evidence at `8364ba3` |
|---|------------|------------------------|
| S1 | Claude parity claims may be stale vs current Claude Code | CJ26 candidate row exists; no pinned Claude Code version/date in-tree. |
| S2 | OpenRouter path lacks first-class fallback / provider prefs | `providerChatExtras` has no OpenRouter fields. |
| S3 | Local/fine-tuned models second-class vs cloud keys | Custom endpoints are manual; no Unsloth preset; Ollama/LM Studio exist as built-ins but presets/health UX are thin. |
| S4 | Risk of pulling training UI into core | No LoRA/RL trainer in `src/` or `electron/` (to be re-locked at TL-C6). |
| S5 | Risk of undoing direct-provider default | Parity test still requires zero pinned OpenRouter catalog rows. |
| S6 | No phase baseline measurement | This file. |
| S7 | Docs/canon lag after multi-lane ship | `PLANNING/README.md` live canon still Tools+MCP Roster v0.30.1. |
| S8 | Installers still on older Bucket until wrap | Download table / Bucket artifacts remain v0.30.0; this STS defers TL-W4. |

## 7. Line counts (orientation only)

| File | Lines |
|------|------:|
| `electron/services/providers/registry.ts` | 1744 |
| `electron/ipc/chat.ts` | 1363 |
| `src/components/settings/ApiKeySettings.tsx` | 713 |
| `electron/services/default-app-settings.ts` | 120 |
| `src/stores/settings-store.ts` | 104 |

## 8. Lane C audit (TL-C1, 2026-08-23)

Recorded against `feat/triple-lane` after TL-B6 (`ff19a96`). Product code unchanged in this prompt.

| Path | What exists | Gap for Lane C |
|------|-------------|----------------|
| Keychain | Custom endpoint ids are first-class (`readCustomProviderDescriptors`). `requiresKey !== true` ⇒ `keyOptional`; stored key still used if present. Built-in ids cannot be shadowed. | None for shadowing. |
| Settings UI | `ApiKeySettings` Groups include Local runtimes (`ollama`, `lmstudio`) plus a Custom endpoints add form (`id` / `label` / `baseURL` / `requiresKey`). Base URL field on `baseUrlConfigurable` cards writes `providerBaseUrlOverrides`. | **No one-click presets.** Unsloth is absent. |
| Built-ins | `ollama` `http://127.0.0.1:11434/v1`, `lmstudio` `http://127.0.0.1:1234/v1`, empty catalogs, keyless placeholder `'local'`. | Presets must set `providerBaseUrlOverrides` when unset — adding them as `customProviders` is rejected. |
| `validateProviderKeyDetailed` | GET `/v1/models` via `listLiveModelIds`; 401/403 = bad key; else chat probe. UI Test button shows `reason`. | Connection-refused / fetch-failed is a raw SDK message, not a loud “nothing is listening” line (TL-C3). |
| Model menu | Custom models from `settings.json` `customModels`. Live import `model:importLive` → `buildLiveModelImports`. | Import already defaults `supportsTools` / `supportsVision` **false** (PX2). Manual add draft starts false. Keep that lock (TL-C4). |
| Tool surface | `usableTools` only when `desc.supportsTools`. Approval / snip / gated filters still wrap local tools (K10). | Do not add a plugin-tool runtime. |
| Unsloth | Not a built-in. | Custom provider preset only (`unsloth`, editable OpenAI-compatible URL). No training UI (K6). |

Authored and reviewed by Basho Parks, copyright 2026
