# PX_BASELINE — Provider Expansion Phase baseline + endpoint verification matrix

Recorded 2026-07-11 (PX-0), before any code change. Verification methods used, in
descending strength:

- **live-verified (OR)** — id present in OpenRouter's public `GET /v1/models` pulled
  2026-07-11 (345 models; snapshot fields `context_length`, `supported_parameters`
  incl. `tools`, `architecture.input_modalities`). Proves the model exists and its
  capabilities as served by OpenRouter; native-endpoint ids cross-referenced from it
  are still marked docs-pinned.
- **live-verified (HF)** — id present in Hugging Face router public `GET /v1/models`
  pulled 2026-07-11 (120 models, HTTP 200 unauthenticated).
- **docs-pinned** — exact string from the provider's official docs fetched 2026-07-11
  (or, for Anthropic, from the authoritative model table dated 2026-06-24).
- **alias-convention** — provider's documented rolling alias (`-latest`); resolves at
  the provider, checkable via Settings → Models → "Verify against providers" once a
  key is stored.
- **unverified** — best-available id; MUST be confirmed via "Verify against providers"
  or the PX-6 import affordance before being relied on.

Every provider base URL below was **endpoint-probed 2026-07-11** unauthenticated:
`401`/`403` = exists + auth-gated (expected), `200` = public. No candidate base URL
failed. `api.kimi.com` 404s — the Kimi rebrand kept `api.moonshot.ai` as the API host
(console moved to `platform.kimi.ai`).

## §1 — Current state (v0.16.0)

Five providers, sixteen catalog models. The chain is fully data-driven end to end:

- `PROVIDERS` table + `ProviderId` union — `electron/services/providers/registry.ts:60,70`
- generic OpenAI-compat client per provider — `getClientForProvider`, `registry.ts:404`
- generic key validation (`/v1/models` probe → flash-tier chat-probe fallback) —
  `validateProviderKeyDetailed`, `registry.ts:511`
- catalog live-verification — `verifyCatalog`, `registry.ts:611`
- IPC list/gate derives from `PROVIDERS` — `electron/ipc/settings.ts:40,110`
- keychain is string-keyed, no union constraint — `electron/services/keychain.ts:119`
- settings UI renders whatever the IPC returns — `src/components/settings/ApiKeySettings.tsx:309`
- renderer mirror union — `src/lib/types.ts:255`

Known defect this phase fixes: `readCustomModelDescriptors` coerces an unknown
provider string to `'deepseek'` (`registry.ts:446`), so a custom model pointed at a
not-yet-built-in provider silently dispatches to api.deepseek.com.

## §2 — Endpoint verification matrix

| Provider id | Base URL | Probe | `/v1/models` | Key console |
|---|---|---|---|---|
| `openai` | `https://api.openai.com/v1` | 401 ✓ | yes (keyed) | platform.openai.com/api-keys |
| `anthropic` | `https://api.anthropic.com/v1/` | 401 ✓ | probe at PX-7 (compat layer; chat-probe fallback covers it) | console: platform.claude.com /settings/keys |
| `xai` | `https://api.x.ai/v1` | 401 ✓ | yes (keyed) | console.x.ai |
| `mistral` | `https://api.mistral.ai/v1` | 401 ✓ | yes (keyed) | console.mistral.ai/api-keys |
| `moonshot` | `https://api.moonshot.ai/v1` | 401 ✓ | yes (keyed) | platform.kimi.ai/console/api-keys |
| `groq` | `https://api.groq.com/openai/v1` | 401 ✓ | yes (keyed) | console.groq.com/keys |
| `together` | `https://api.together.xyz/v1` | 401 ✓ | yes (keyed) | api.together.ai/settings/api-keys |
| `fireworks` | `https://api.fireworks.ai/inference/v1` | 401 ✓ | yes (keyed) | app.fireworks.ai/settings/users/api-keys |
| `cerebras` | `https://api.cerebras.ai/v1` | 403 ✓ | yes (keyed) | cloud.cerebras.ai (API keys) |
| `huggingface` | `https://router.huggingface.co/v1` | **200 public** | yes (public) | huggingface.co/settings/tokens (fine-grained, Inference Providers permission) |
| `ollama` | `http://127.0.0.1:11434/v1` | not running at probe time | yes (keyless when running) | none — keyless |
| `lmstudio` | `http://127.0.0.1:1234/v1` | not running at probe time | yes (keyless when running) | none — keyless |

Auth for all twelve: standard `Authorization: Bearer <key>` via the OpenAI SDK
(what `getClientForProvider` already sends). No per-provider header variance found.

## §3 — Model slate + per-id status

Capabilities marked *(OR)* are cross-referenced from OpenRouter's live listing of the
same model; native serving may differ — PX-7 probes where keys exist.

### openai — GPT-5.6 family GA'd 2026-07-09; `gpt-5.6` alias routes to Sol
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `gpt-5.6` | 1,050,000 | ✓ (OR) | ✓ (OR) | docs-pinned (alias→sol) |
| `gpt-5.6-terra` | 1,050,000 | ✓ (OR) | ✓ (OR) | docs-pinned |
| `gpt-5.6-luna` | 1,050,000 | ✓ (OR) | ✓ (OR) | docs-pinned |
| `gpt-5.5` | 1,050,000 | ✓ (OR) | ✓ (OR) | docs-pinned (Chat Completions confirmed; `gpt-5.5-pro` is Responses-API-only — excluded) |

### anthropic — via the official OpenAI-compat endpoint (see §4)
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `claude-opus-4-8` | 1,000,000 | ✓ | ✓ | docs-pinned (authoritative table 2026-06-24) |
| `claude-sonnet-5` | 1,000,000 | ✓ | ✓ | docs-pinned |
| `claude-haiku-4-5` | 200,000 | ✓ | ✓ | docs-pinned; tier `flash` so the chat-probe fallback uses the cheapest model |

### xai
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `grok-4.5` | 500,000 | ✓ (OR) | ✓ (OR) | docs-pinned (docs.x.ai "most intelligent and fastest") |
| `grok-4.3` | 1,000,000 | ✓ (OR) | ✓ (OR) | docs-pinned |
| `grok-build-0.1` | 256,000 | ✓ (OR) | ✓ (OR) | docs-pinned (Code API model → tier `coder`) |

### mistral — rolling `-latest` aliases (documented convention)
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `mistral-large-latest` | 262,144 (OR: large-2512) | ✓ (OR) | ✓ (OR) | alias-convention |
| `mistral-medium-latest` | 262,144 (OR: medium-3-5) | ✓ (OR) | ✓ (OR) | alias-convention |
| `mistral-small-latest` | 131,072 (conservative) | ✓ | unset | alias-convention |
| `codestral-latest` | 256,000 (OR: codestral-2508) | ✓ (OR) | ✗ (OR) | alias-convention (tier `coder`) |

### moonshot
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `kimi-k2.6` | 262,144 | ✓ (docs + OR) | ✓ (OR) | docs-pinned |
| `kimi-k2.5` | 262,144 | ✓ (OR) | ✓ (OR) | unverified (native id inferred from OR slug — confirm via /v1/models) |
| `kimi-k2-thinking` | 262,144 | ✓ (OR) | ✗ (OR) | unverified (reasoner — `isReasoner`, `defaultMaxTokens`, `reasoningCapOnToolUse` per v0.15.5 guard) |

### groq
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `llama-3.3-70b-versatile` | 131,072 | ✓ | ✗ | docs-pinned (console.groq.com/docs/models) |
| `llama-3.1-8b-instant` | 131,072 | ✓ | ✗ | docs-pinned (tier `flash`) |
| `openai/gpt-oss-120b` | 131,072 | ✓ | ✗ | docs-pinned |
| `openai/gpt-oss-20b` | 131,072 | ✓ | ✗ | docs-pinned |

### together
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 131,072 | ✓ (docs) | ✗ | docs-pinned |
| `deepseek-ai/DeepSeek-V4-Pro` | 512,000 | ✓ (docs) | ✗ | docs-pinned |
| `openai/gpt-oss-120b` | 128,000 | ✓ (docs) | ✗ | docs-pinned |
| `moonshotai/Kimi-K2.6` | 262,144 | ✓ (docs) | unset | docs-pinned |

### fireworks — weakest slate; the PX-6 import affordance is the primary path here
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `accounts/fireworks/models/gpt-oss-120b` | 131,072 | ✓ (family) | ✗ | **unverified** — confirm via /v1/models with a key |

### cerebras
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `gpt-oss-120b` | 131,072 (conservative) | ✓ (family) | ✗ | docs-pinned (production) |
| `gemma-4-31b` | 131,072 (conservative) | ✓ | unset | docs-pinned (preview) |
| `zai-glm-4.7` | 131,072 (conservative) | ✓ | unset | docs-pinned (preview) |

### huggingface — hub ids; optional `:provider` / `:fastest` / `:cheapest` suffix
| id | ctx | tools | vision | status |
|---|---|---|---|---|
| `openai/gpt-oss-120b` | 131,072 | ✓ | ✗ | **live-verified (HF)** |
| `meta-llama/Llama-3.3-70B-Instruct` | 131,072 | ✓ | ✗ | **live-verified (HF)** |
| `zai-org/GLM-5.2` | 262,144 | ✓ | unset | **live-verified (HF)** |

### openrouter — broadening of the existing provider (all live-verified today)
| id (apiModelId) | ctx | tools | vision |
|---|---|---|---|
| `anthropic/claude-sonnet-5` | 1,000,000 | ✓ | ✓ |
| `openai/gpt-5.6-terra` | 1,050,000 | ✓ | ✓ |
| `x-ai/grok-4.5` | 500,000 | ✓ | ✓ |
| `moonshotai/kimi-k2.5` | 262,144 | ✓ | ✓ |
| `meta-llama/llama-4-maverick` | 1,048,576 | ✓ | ✓ |

## §4 — Anthropic OpenAI-compat layer: honest limitations (official doc, fetched 2026-07-11)

Anthropic's own framing: the layer is "primarily intended to test and compare model
capabilities, and is not considered a long-term or production-ready solution for most
use cases," but is "intended to remain fully functional and not have breaking
changes." Lamprey ships it with that framing quoted in the descriptor comment.

Verified support relevant to Lamprey's dispatch:
- `stream`, `tools[]`, streamed `tool_calls`, `tool` role messages, `usage`,
  `temperature` (capped at 1), `top_p`, `stop`, `max_tokens`: **fully supported**.
- `image_url` user content: supported → `supportsVision: true`.
- **Ignored** (silently): `strict`, `response_format`, `reasoning_effort`, `seed`,
  penalties, `logprobs`. Consequences: `reasoningCapOnToolUse` must stay **unset**
  for anthropic models (the knob is a no-op there), and no thinking channel comes
  back → `isReasoner: false`.
- System messages are hoisted+concatenated to one initial system message (harmless
  for Lamprey — JM-11 persists system rows in-order and this collapses them).
- `n` must be 1 (Lamprey never sets `n`).

## §5 — Local runtimes

Neither Ollama (`127.0.0.1:11434`) nor LM Studio (`127.0.0.1:1234`) was running at
probe time; default ports pinned from each project's docs. Both serve OpenAI-compat
`/v1/models` + `/v1/chat/completions` when running, keyless (the OpenAI SDK requires
a non-empty key string; a placeholder is sent). Builtin catalogs stay EMPTY for both —
models are machine-specific and imported via the PX-6 "Import from /v1/models" flow
or added as Custom Models. `providerBaseUrlOverrides` (PX-4) covers LAN hosts and
non-default ports.

## §6 — Post-phase verification (appended at PX-7)

*(placeholder — verifyCatalog results with whatever keys the owner stores, plus
empirical supportsTools probe outcomes, land here at PX-7.)*
