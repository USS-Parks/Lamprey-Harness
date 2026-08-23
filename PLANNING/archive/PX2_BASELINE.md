# Provider Discovery Expansion v2 — Baseline

**Captured:** 2026-07-19  
**Branch:** `codex/provider-expansion-v2`  
**Starting version:** `0.26.0`  
**Starting catalog:** 17 built-in providers, 55 pinned models after the prepared Moonshot refresh  
**Status:** Evidence frozen; execution authorized STS by the user on 2026-07-19

## Problem statement

Lamprey already accepts arbitrary OpenAI-compatible custom endpoints, but that escape hatch is not a substitute for discoverable API-key cards, correct provider routing, live model discovery, and honest capability metadata. The current built-in list misses several current lab models and a large group of smaller inference hosts.

The fast-moving hosts cannot be maintained safely as a giant hand-written model list. This phase therefore separates:

1. **Pinned lab models** — a small roster backed by first-party model documentation.
2. **Live-catalog providers** — API-key acceptance plus `/models` discovery and import.
3. **Self-hosted gateways** — live discovery with an editable base URL.
4. **Custom-only endpoints** — providers whose URL/auth/response contract is deployment-specific or not adequately documented.

## Evidence matrix

| Target | Decision | Integration shape | First-party evidence |
|---|---|---|---|
| Moonshot/Kimi | Pin | Refresh to K3, K2.7 Code/Highspeed, K2.6, K2.5; retire K2 Thinking | [Kimi models](https://platform.kimi.ai/docs/models) |
| xAI/Grok | Pin | Add Grok 4.20 reasoning, non-reasoning, and multi-agent aliases | [xAI models](https://docs.x.ai/developers/models), [Grok 4.20 multi-agent](https://docs.x.ai/developers/models/grok-4.20-multi-agent-0309) |
| Google Gemma | Pin | Add the two Gemma 4 models hosted by the Gemini API | [Gemma on Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), [Gemma 4 overview](https://ai.google.dev/gemma/docs/core) |
| AIHubMix | Live import | OpenAI-compatible aggregator at `https://aihubmix.com/v1` | [AIHubMix docs](https://aihubmix.mintlify.app/en), [model-list API index](https://aihubmix.mintlify.app/en/llms) |
| FreeLLMAPI | Live import | Self-hosted gateway at `http://127.0.0.1:3001/v1`; editable URL | [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) |
| Cohere | Pin + live import | OpenAI compatibility endpoint | [Cohere compatibility API](https://docs.cohere.com/docs/compatibility-api) |
| MiniMax | Pin + live import | OpenAI compatibility endpoint and `/v1/models` | [MiniMax chat](https://platform.minimax.io/docs/api-reference/text-chat-openai), [MiniMax models](https://platform.minimax.io/docs/api-reference/models/openai/retrieve-model) |
| NVIDIA API Catalog/NIM | Live import | OpenAI-compatible cloud/NIM model list | [NIM API reference](https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html) |
| GitHub Models | Live import | OpenAI-compatible inference endpoint; separate catalog endpoint | [GitHub Models quickstart](https://docs.github.com/en/github-models/quickstart) |
| SambaNova | Live import | OpenAI-compatible SambaCloud endpoint | [SambaNova API keys and URLs](https://docs.sambanova.ai/docs/en/get-started/api-keys-urls) |
| SiliconFlow | Live import | OpenAI-compatible endpoint; text-filtered model list | [SiliconFlow model list](https://docs.siliconflow.com/en/api-reference/models/get-model-list) |
| Reka | Pin + live import | OpenAI chat; bare-array `/models` response | [Reka models](https://docs.reka.ai/chat/api-reference/get), [Reka function calling](https://docs.reka.ai/chat/function-calling) |
| SEA-LION | Pin + live import | OpenAI-compatible regional model API | [SEA-LION API](https://docs.sea-lion.ai/guides/inferencing/api) |
| DeepInfra | Live import | OpenAI compatibility endpoint; separate typed catalog | [DeepInfra API](https://docs.deepinfra.com/api-reference/introduction), [DeepInfra model list](https://docs.deepinfra.com/api-reference/models/models-list) |
| Hyperbolic | Live import | OpenAI-compatible serverless inference | [Hyperbolic inference API](https://docs.hyperbolic.xyz/docs/inference-api) |
| Perplexity Sonar | Pin | Chat-completions compatible; Agent model list is not a Sonar catalog | [Perplexity compatibility](https://docs.perplexity.ai/docs/sonar/openai-compatibility) |
| Sarvam | Pin | Two documented OpenAI-compatible chat models | [Sarvam chat](https://docs.sarvam.ai/api-reference/chat/chat-completions) |
| Inception Labs | Pin | Mercury 2 OpenAI-compatible endpoint | [Inception quickstart](https://docs.inceptionlabs.ai/get-started/get-started) |

## Explicit exclusions

- Media-only, embedding-only, reranking, guard-only, and base-completion models are not imported into Lamprey's chat picker.
- Cloudflare Workers AI, private NIM deployments, and other account/deployment-scoped URLs remain Custom Provider targets unless a stable public base URL exists.
- Unverified free relays and transient routers are not granted a built-in trust badge. Their models remain reachable through AIHubMix, FreeLLMAPI, OpenRouter, Hugging Face, or Lamprey's Custom Provider seam.
- A provider entry does not claim that every discovered model supports tools or vision. Imported models start conservative and remain user-editable.

## Baseline risks

- `listLiveModelIds()` assumes the OpenAI `{ data: [...] }` list shape; Reka, GitHub Models, and DeepInfra need explicit normalizers.
- Built-in base URL overrides exist only in `settings.json`; FreeLLMAPI needs a visible editor.
- Live import is one-model-at-a-time and becomes unusable for 100+ model catalogs.
- Model IDs can collide across providers because Lamprey's model key is global. Imported IDs must be namespaced when a collision exists while preserving the provider's verbatim `apiModelId`.
- No user API keys may be printed, copied into fixtures, or committed. Live acceptance is key-presence dependent and must report `pending-key` honestly when unavailable.

