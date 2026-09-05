---
type: Domain
title: Model Catalog and Provider Routing
description: 82 pinned models across 33 built-in providers, custom endpoint support, and model discovery via /v1/models import (v0.17.0+).
tags: [providers, models, catalog, dispatch]
resource: repo://electron/services/providers/catalog.ts
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-590517cc76c53936972f93a7
    resource: repo://electron/services/providers/catalog.ts
generated: {by: "openwiki/0.3.3", at: "2026-08-23T18:40:37.531Z"}
verified:
  - by: openwiki/0.3.3
    at: 2026-08-23T18:40:37.531Z
---

# Model Catalog and Provider Routing

This page is the **model** catalog (`MODEL_CATALOG` / providers). Native tools live on [native.md](native.md). MCP connectors live on [mcp.md](mcp.md).

**Version:** v0.30.0  
**Key release:** v0.27.1 (direct-provider routing, zero OpenRouter aliases)  
**Expansion phase:** v0.17.0 (PX: 33 built-ins, custom endpoints)  
**Author:** Basho Parks

---

## Canonical Catalog Structure

**MODEL_CATALOG** is an immutable array of 82 ModelDescriptor entries (v0.30.0) spanning 33 built-in providers. Every model is pinned by the application because it has been tested or documented.

```typescript
interface ModelDescriptor {
  id: string                    // Unique within catalog (e.g., 'deepseek-v4-pro')
  name: string                  // Display name (e.g., 'DeepSeek V4 Pro')
  provider: ProviderId          // Which provider hosts this model (e.g., 'deepseek')
  apiModelId: string            // Sent verbatim to provider API (e.g., 'deepseek-v4-pro')
  contextWindow: number         // Tokens (e.g., 1_000_000)
  supportsTools: boolean        // Native function calling
  supportsVision?: boolean      // Image input support
  defaultMaxTokens?: number     // Recommended output limit (paired with reasoning)
  reasoningCapOnToolUse?: boolean // Thinking mode on tool calls
  tier: 'flash' | 'pro' | 'open' | 'coder' | string
  description: string
}
```

**Key invariants:**
- `id` is stable and unique (used in Settings menu, conversation history, restored on model deletion)
- `apiModelId` is sent byte-for-byte to the provider (not user-editable)
- `supportsTools` reflects the provider's capability at v0.30.0 (empirically tested or documented)
- If a model is a reasoner (`reasoningCapOnToolUse: true`), it has a paired `defaultMaxTokens` guard-pairing enforced by `catalog-invariants.test.ts`
- `tier` is informational (no bearing on dispatch)

---

## Provider Tiers (v0.17.0 Expansion)

| Tier | Count | Examples | Authentication |
|---|---|---|---|
| **Frontier labs** | 6 | DeepSeek, OpenAI, Anthropic, Google, xAI, Moonshot | API key required |
| **Regional specialists** | 3 | DashScope/Alibaba, Zhipu, xAI | API key required |
| **Aggregators** | 1 | OpenRouter | API key (live catalog keyless) |
| **Open-source routers** | 1 | Hugging Face | API key (optional) or token-gated inference |
| **Compute + inference** | 6 | Groq, Together, Fireworks, Cerebras, SiliconFlow, DeepInfra | API key required |
| **Other specialists** | 14 | MiniMax, Cohere, NVIDIA NIM, GitHub Models, SambaNova, Perplexity, Sarvam, Inception, AIHubMix, FreeLLMAPI, Reka, SEA-LION, Hyperbolic, Mistral | API key required |
| **Local runtimes** | 2 | Ollama, LM Studio | Keyless (zero key required) |
| **Custom endpoints** | 0 (user-defined) | Any OpenAI-compatible endpoint | settings.json |

**Total: 33 built-ins + unlimited custom endpoints**

---

## Direct-Provider Routing (v0.27.1)

Every pinned model routes **exclusively** through its named provider. No brokers, no OpenRouter aliases, no fallback chains.

**Dispatch path:**
```
User selects model ID (e.g., 'gpt-5.6-sol')
  ↓
resolveModel(modelId) finds descriptor
  ↓
descriptor.provider = 'openai' + descriptor.apiModelId = 'gpt-5.6'
  ↓
getProviderForModel('openai') returns provider config (baseURL, key lookup)
  ↓
chatStream sends to https://api.openai.com/v1/chat/completions
  ↓ (model='gpt-5.6')
```

**OpenRouter is NOT a broker.** It appears in the catalog only as an explicit opt-in provider with its own models (`or-*` prefixed). To use OpenRouter models, add OpenRouter as a separate provider in Settings → API Keys, then select the OpenRouter-hosted model.

---

## Custom Models and Endpoints (v0.17.0)

### Custom Endpoints (settings.json.customProviders)

Users can add unlimited OpenAI-compatible endpoints:

```json
{
  "customProviders": [
    {
      "id": "my-api",
      "baseURL": "https://api.example.com/v1",
      "label": "My Local Server",
      "requiresKey": true
    }
  ]
}
```

**Properties:**
- `id` (kebab-case, e.g., `my-api`, `internal-llama`)
- `baseURL` (https or http, validated at the registry)
- `label` (optional, displayed in Settings)
- `requiresKey` (default false; if true, user must paste a key)

**Custom endpoints become first-class provider IDs** across:
- Keychain (`settings:saveProviderKey` IPC)
- Model catalog lookup
- Dispatch path
- Custom Models import

**Validation:**
- Built-ins cannot be shadowed
- Endpoint URLs validated (http/https, not localhost unless explicitly)
- Duplicate custom IDs rejected

### Custom Models

Users can import models from any custom endpoint via Settings → Models → "Import from /v1/models":

```
User pastes endpoint (e.g., http://localhost:11434)
  ↓
model:listLive IPC calls listLiveModelIds(provider)
  ↓
Provider probes /v1/models endpoint
  ↓
User sees live list, selects models
  ↓
Selected models stored with custom: true flag
  ↓
Next model menu refresh includes them
```

**Custom model properties:**
- No `defaultMaxTokens` (user-provided)
- `supportsTools` defaults to false unless explicitly set
- Custom models appear in the model menu with a "custom" badge

---

## Model Selection and Menu

**Model Settings component (src/components/settings/ModelSettings.tsx):**

1. **Provider grouping** (PX Layer 1):
   - Frontier labs (OpenAI, Anthropic, Google, etc.)
   - Regional specialists (DashScope, Moonshot, Zhipu)
   - Aggregators (OpenRouter)
   - Open-source routers (Hugging Face)
   - Local runtimes (Ollama, LM Studio)
   - Custom endpoints (user-defined)

2. **Key-aware cards:**
   - Each provider shows "Set key →" if no key is stored
   - "Key stored ✓" with expiry warning if applicable
   - Keyless providers skip the key card

3. **Model menu:**
   - Viewport-bounded and scrollable
   - Active model highlighted
   - Models grouped by provider
   - Custom badge for imported models

4. **Import flow:**
   - Paste endpoint URL
   - Click "Import from /v1/models"
   - Renderer calls `model:listLive`
   - Live list renders
   - Select and save
   - Menu refreshes on next open

---

## Capability Flags

### supportsTools

`true` → Model supports native OpenAI-compatible function calling
`false` → Fallback parser required (text-based tool instruction)

**v0.30.0 known flags:**
- DeepSeek V4 Pro/Flash: `true`
- Gemini 4/3: `true`
- Qwen3/Qwen3.5: `true` (Coder), `false` (base)
- Claude (Anthropic compat): `true`
- Local Ollama/LM Studio: varies (empirically detected on first use)

**Mismatches auto-detect:** If a `supportsTools: true` model returns tool-like syntax but zero `tool_calls` for 3 consecutive turns, the model downgrades to fallback mode (FC-10 capability-tracker).

### supportsVision

`true` → Model accepts image inputs (base64 or URLs)
`false` → Image calls are rejected before API

**Common:**
- Gemini, GPT, Claude (multimodal variants): `true`
- DeepSeek V4, Qwen3 (non-vision): `false`
- Open-weight Gemma, Llama: varies

### reasoningCapOnToolUse

`true` → Model can use thinking/reasoning mode when tools are available
`false` → No reasoning on tool turns (saves reasoning tokens)

**Paired invariant:** Every model with `reasoningCapOnToolUse: true` must have a `defaultMaxTokens` cap (enforced at startup).

---

## Retirement and Fallback

**RETIRED_MODEL_MAP** handles stale default selections:

```typescript
export const RETIRED_MODEL_MAP: Record<string, string> = {
  'old-model-id': 'new-model-id',  // Redirect users
  // ...
}
```

When a user's saved default model is no longer in the catalog, `resolveModel` checks the map and routes to the equivalent. If no map entry exists, fallback is to the first model in the current provider, or a safe default (e.g., `gpt-5.6-sol` for OpenAI).

---

## Verification and Live Probes

**Settings → Models → "Verify against providers"** (guarded by each provider having a key):

1. Iterates every catalog entry
2. Hits `/v1/models` endpoint with the stored key
3. Checks for existence and up-to-date properties
4. Reports stale, missing, or invalid models
5. Suggests updates for removed models

**Note:** Per-model live verification for unverified entries (Fireworks, etc.) awaits the owner's keys and live testing.

---

## Change Navigation

**To add a new built-in provider:**
1. Add to `ProviderId` union in `registry.ts` and mirror in `src/lib/types.ts`
2. Add entry to `PROVIDERS` array (id, label, baseURL, key support)
3. Add models to `MODEL_CATALOG` with `supportsTools` / `supportsVision` flags
4. Test with a live key (PX_SMOKE_PLAYBOOK)
5. `provider-parity.test.ts` auto-verifies union sync

**To add a new model to an existing provider:**
1. Add descriptor to `MODEL_CATALOG` (copy an existing entry, update id/name/apiModelId)
2. If it's a reasoner, pair with `defaultMaxTokens`
3. Run `npm test` — `catalog-invariants.test.ts` validates structure
4. Smoke-test with the model

**To enable custom endpoints:**
- User: Settings → API Keys → Custom Providers → "+ Add endpoint"
- Implemented: v0.17.0 PX Layer 3
- Validation: `registry.ts` checks kebab id, http(s) URL, built-in unshadowable

**To verify the catalog:**
- Run `npm test -- catalog-invariants.test.ts` (checks structure, guard-pairing, no duplicates)
- Manual smoke: Settings → Models → "Verify against providers" (with live keys)

---

## Key Files

| File | Purpose |
|---|---|
| `electron/services/providers/catalog.ts` | MODEL_CATALOG, RETIRED_MODEL_MAP |
| `electron/services/providers/registry.ts` | `PROVIDERS` record, `resolveModel()`, `getProviderForModel()`, dispatch routing |
| `electron/services/providers/capability-tracker.ts` | `supportsTools` downgrade on mismatch |
| `src/components/settings/ModelSettings.tsx` | Model menu UI, import flow |
| `src/lib/types.ts` | Renderer-side ProviderId union (parity-locked) |
| `electron/services/tool-registry.ts` | Per-provider tool schema normalization |

---

Further reading: [architecture/function-calling.md](../../architecture/function-calling.md), [architecture/overview.md](../../architecture/overview.md)

---

Authored and reviewed by Basho Parks, copyright 2026
