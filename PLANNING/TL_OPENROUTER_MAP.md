# TL_OPENROUTER_MAP.md — OpenRouter path map (TL-B1)

**Prompt:** TL-B1
**Tip when mapped:** `7a12b04` (after TL-A3) on `feat/triple-lane`
**No behavior change in this prompt.**

## Keys

| Item | Where |
|------|-------|
| Provider id | `openrouter` (`PROVIDERS` in `electron/services/providers/registry.ts` ~154) |
| Keychain slot | `electron/services/keychain.ts` keyed by `openrouter` |
| Env / docs | `keyEnv: 'openrouter'`, `docsUrl: 'https://openrouter.ai/keys'` |
| Base URL | `https://openrouter.ai/api/v1` (`providerBaseUrlOverrides.openrouter` may replace) |
| Settings UI | `src/components/settings/ApiKeySettings.tsx` aggregator group |

## Chat request body

Both `chatStream` (~1311) and `chatOnce` (~1091) call OpenAI SDK `chat.completions.create` with:

- `model: desc.apiModelId`
- `messages`
- `stream` (stream only)
- `tools` when offered
- optional `temperature` / `top_p` / `max_tokens`
- optional `reasoning_effort` cap
- `...providerChatExtras(desc)`

Today `providerChatExtras` (registry.ts ~1051) returns MiniMax `{ reasoning_split: true }` or `{}`. **It is the single request-build seam for OpenRouter `models` fallbacks and `provider` prefs.** Extra fields belong there, gated on `desc.provider === 'openrouter'`, so DeepSeek/Anthropic/etc. stay byte-identical (K4).

`electron/ipc/chat.ts` `runChatRound` (~886) calls `chatStream` and does not currently pass routing settings.

## Catalog / model ids

| Path | Behavior |
|------|----------|
| `MODEL_CATALOG` | **Zero** `provider === 'openrouter'` rows (locked by `provider-parity.test.ts`). Direct-provider default (v0.27.1 / K4). |
| Live import | `listLiveModelIds` → IPC `model:importLive` → `buildLiveCatalogImports` in `electron/services/providers/model-import.ts`. Imported rows keep `provider: 'openrouter'` and verbatim `apiModelId` (e.g. `anthropic/claude-sonnet-4`). |
| Custom models | `readCustomModelDescriptors`; `supportsTools` defaults false until proven. |
| Auto id | Official OpenRouter auto-router id is `openrouter/auto`. Not in the pinned catalog. TL-B5 will allow it when an OpenRouter key exists. |

## Settings persistence for later B prompts

`settings.json` is open-by-design (`sanitizeSettingsPartial` only strips prototype pollution). New keys (`openrouterFallbacks`, provider sort/order/ignore) can persist without a sanitizer whitelist. Defaults must land in **both** `DEFAULT_APP_SETTINGS` and `src/stores/settings-store.ts` (parity test).

## Non-goals at this map

- Do not put OpenRouter ids in `MODEL_CATALOG`.
- Do not send OpenRouter extra fields on other providers.
- Do not change default model routing.

Authored and reviewed by Basho Parks, copyright 2026
