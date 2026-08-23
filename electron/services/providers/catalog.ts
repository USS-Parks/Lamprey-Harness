import type { ModelDescriptor } from './registry'

// Canonical catalog including the August 2026 first-party rows.

// Each `apiModelId` is sent verbatim in the `model` field of the request to
// that provider's published API. These IDs come from each provider's docs
// and the OpenRouter live /v1/models response captured during development;
// they are NOT guaranteed to still be live. Use Settings -> Models ->
// "Verify against providers" to check every entry against the provider's
// current /v1/models list with your stored key.
export const MODEL_CATALOG: ModelDescriptor[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    apiModelId: 'deepseek-v4-pro',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: false,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'pro',
    description: 'Flagship DeepSeek V4 — high-performance reasoning, 1M token context.'
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    apiModelId: 'deepseek-v4-flash',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: false,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'flash',
    description:
      'Fast DeepSeek V4 — supports both non-thinking and thinking modes (default), 1M context.'
  },
  {
    id: 'gemma-3-27b-it',
    name: 'Gemma 3 27B',
    provider: 'google',
    apiModelId: 'gemma-3-27b-it',
    contextWindow: 131072,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Google open-weight 27B multimodal model via AI Studio.'
  },
  {
    id: 'gemma-3-12b-it',
    name: 'Gemma 3 12B',
    provider: 'google',
    apiModelId: 'gemma-3-12b-it',
    contextWindow: 131072,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Smaller Gemma 3 variant — faster, lower cost.'
  },
  {
    id: 'gemma-4-31b-it-google',
    name: 'Gemma 4 31B (Google AI)',
    provider: 'google',
    apiModelId: 'gemma-4-31b-it',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Google-hosted Gemma 4 31B instruction model via the Gemini OpenAI endpoint.'
  },
  {
    id: 'gemma-4-26b-a4b-it-google',
    name: 'Gemma 4 26B A4B (Google AI)',
    provider: 'google',
    apiModelId: 'gemma-4-26b-a4b-it',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Google-hosted Gemma 4 26B A4B instruction model via the Gemini API.'
  },
  {
    id: 'qwen3-max',
    name: 'Qwen3 Max',
    provider: 'dashscope',
    apiModelId: 'qwen3-max',
    contextWindow: 262144,
    supportsTools: true,
    supportsVision: false,
    tier: 'pro',
    description: 'Alibaba Qwen3 flagship — 262K context, tool use.'
  },
  {
    id: 'qwen3-coder-plus',
    name: 'Qwen3 Coder Plus',
    provider: 'dashscope',
    apiModelId: 'qwen3-coder-plus',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'coder',
    description: 'Flagship Qwen3 coding model — 1M context, agentic tool use.'
  },
  {
    id: 'qwen3-coder-flash',
    name: 'Qwen3 Coder Flash',
    provider: 'dashscope',
    apiModelId: 'qwen3-coder-flash',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'coder',
    description: 'Faster Qwen3 coder — 1M context, agentic tool use.'
  },
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus',
    provider: 'dashscope',
    apiModelId: 'qwen3.5-plus',
    contextWindow: 1_000_000,
    supportsTools: false,
    supportsVision: true,
    tier: 'pro',
    description: 'Qwen 3.5 multimodal — 1M context, vision input.'
  },
  {
    id: 'qwen3.5-flash',
    name: 'Qwen 3.5 Flash',
    provider: 'dashscope',
    apiModelId: 'qwen3.5-flash',
    contextWindow: 1_000_000,
    supportsTools: false,
    supportsVision: true,
    tier: 'flash',
    description: 'Faster Qwen 3.5 multimodal — 1M context, vision input.'
  },
  {
    id: 'qwen-long',
    name: 'Qwen Long',
    provider: 'dashscope',
    apiModelId: 'qwen-long',
    contextWindow: 10_000_000,
    supportsTools: false,
    supportsVision: false,
    tier: 'pro',
    description: 'Qwen long-context model — 10M token window for very large documents.'
  },
  // qwen3.7 is referenced in Alibaba's blog announcements but the DashScope
  // model catalog at fetch time did not list a qwen3.7-* api id. Paste the
  // exact id from your DashScope console into Custom Models when it lands.

  // ── Zhipu AI (GLM) ──
  {
    id: 'glm-5.2',
    name: 'GLM 5.2',
    provider: 'zhipu',
    apiModelId: 'glm-5.2',
    contextWindow: 128000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Zhipu AI flagship — GLM 5.2, 128K context, tool use + vision.'
  },
  {
    id: 'glm-5.2-1m',
    name: 'GLM 5.2 (1M context)',
    provider: 'zhipu',
    apiModelId: 'glm-5.2[1m]',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'GLM 5.2 with explicit 1M token context window.'
  },

  // ── OpenAI ── GPT-5.6 family GA'd 2026-07-09; the bare `gpt-5.6` alias
  // routes to Sol (flagship). Ids pinned from OpenAI docs at that date —
  // confirm against the live /v1/models via Settings → Models once a key
  // is stored.
  {
    id: 'gpt-5.6',
    name: 'GPT-5.6 (Sol)',
    provider: 'openai',
    apiModelId: 'gpt-5.6',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'OpenAI flagship — GPT-5.6 Sol tier, 1.05M context, tools + vision.'
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    provider: 'openai',
    apiModelId: 'gpt-5.6-terra',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Balanced lower-cost GPT-5.6 tier.'
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    provider: 'openai',
    apiModelId: 'gpt-5.6-luna',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'flash',
    description: 'Fastest, most cost-efficient GPT-5.6 tier.'
  },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    provider: 'openai',
    apiModelId: 'gpt-5.5',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'GPT-5.5 frontier model (gpt-5.5-pro is Responses-API-only and excluded).'
  },

  // ── Anthropic (Claude) ── served over the OpenAI-compat endpoint; see the
  // PROVIDERS entry for the layer's constraints. reasoningCapOnToolUse must
  // stay unset here (reasoning_effort is ignored by the compat layer).
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    apiModelId: 'claude-opus-4-8',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Anthropic Opus-tier flagship — 1M context, tools + vision.'
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'anthropic',
    apiModelId: 'claude-sonnet-5',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Near-Opus coding/agentic quality at Sonnet cost — 1M context.'
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    apiModelId: 'claude-haiku-4-5',
    contextWindow: 200_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'flash',
    description: 'Fastest, most cost-effective Claude — also the key-validation probe model.'
  },

  // ── xAI (Grok) ── ids and capabilities from docs.x.ai. Requests route
  // directly to xAI with the independently stored xai key.
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    provider: 'xai',
    apiModelId: 'grok-4.5',
    contextWindow: 500_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'xAI flagship — 500K context, tools + vision.'
  },
  {
    id: 'grok-4.3',
    name: 'Grok 4.3',
    provider: 'xai',
    apiModelId: 'grok-4.3',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Grok 4.3 — 1M context.'
  },
  {
    id: 'grok-build-0.1',
    name: 'Grok Build 0.1',
    provider: 'xai',
    apiModelId: 'grok-build-0.1',
    contextWindow: 256_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'coder',
    description: 'xAI code model — 256K context.'
  },

  {
    id: 'grok-4.20-reasoning',
    name: 'Grok 4.20 Reasoning',
    provider: 'xai',
    apiModelId: 'grok-4.20-reasoning',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'reasoner',
    description: 'Grok 4.20 reasoning alias with 1M context, tools, and vision.'
  },
  {
    id: 'grok-4.20-non-reasoning',
    name: 'Grok 4.20 Non-Reasoning',
    provider: 'xai',
    apiModelId: 'grok-4.20-non-reasoning',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Lower-latency Grok 4.20 alias without a reasoning phase.'
  },
  {
    id: 'grok-4.20-multi-agent',
    name: 'Grok 4.20 Multi-Agent',
    provider: 'xai',
    apiModelId: 'grok-4.20-multi-agent',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'reasoner',
    description: 'xAI server-side multi-agent research model with 1M context.'
  },

  // ── Mistral ── rolling `-latest` aliases (Mistral's documented convention;
  // they track the newest release of each line). Resolve live via
  // Settings → Models → "Verify against providers".
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large (latest)',
    provider: 'mistral',
    apiModelId: 'mistral-large-latest',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Mistral flagship line — rolling latest release.'
  },
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium (latest)',
    provider: 'mistral',
    apiModelId: 'mistral-medium-latest',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Mistral Medium line — rolling latest release.'
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small (latest)',
    provider: 'mistral',
    apiModelId: 'mistral-small-latest',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'flash',
    description: 'Mistral Small line — rolling latest release, cheapest tier.'
  },
  {
    id: 'codestral-latest',
    name: 'Codestral (latest)',
    provider: 'mistral',
    apiModelId: 'codestral-latest',
    contextWindow: 256_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'coder',
    description: 'Mistral coding model — rolling latest release.'
  },

  // ── Moonshot AI (Kimi) ── Current public Kimi API roster from
  // platform.kimi.ai/docs/models. Moonshot V1 is omitted because it is closed
  // to new accounts and scheduled for full platform sunset on 2026-08-31.
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    provider: 'moonshot',
    apiModelId: 'kimi-k3',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'pro',
    description: 'Moonshot flagship — 1M context, native vision, and always-on reasoning.'
  },
  {
    id: 'kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    provider: 'moonshot',
    apiModelId: 'kimi-k2.7-code',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'coder',
    description: 'Moonshot coding model — 256K context with always-on reasoning.'
  },
  {
    id: 'kimi-k2.7-code-highspeed',
    name: 'Kimi K2.7 Code HighSpeed',
    provider: 'moonshot',
    apiModelId: 'kimi-k2.7-code-highspeed',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'coder',
    description: 'High-speed Kimi K2.7 Code — identical capabilities with faster output.'
  },
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    provider: 'moonshot',
    apiModelId: 'kimi-k2.6',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'pro',
    description: 'Kimi K2.6 — 256K context, native vision, and thinking mode.'
  },
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'moonshot',
    apiModelId: 'kimi-k2.5',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'pro',
    description: 'Legacy Kimi K2.5 — 256K context; platform sunset scheduled for 2026-08-31.'
  },

  // ── Groq ── production ids from console.groq.com/docs/models.
  {
    id: 'groq-llama-3.3-70b',
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    apiModelId: 'llama-3.3-70b-versatile',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'Llama 3.3 70B at Groq speed (~280 tok/s).'
  },
  {
    id: 'groq-llama-3.1-8b',
    name: 'Llama 3.1 8B (Groq)',
    provider: 'groq',
    apiModelId: 'llama-3.1-8b-instant',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'flash',
    description: 'Fastest, cheapest Groq production model (~560 tok/s).'
  },
  {
    id: 'groq-gpt-oss-120b',
    name: 'GPT-OSS 120B (Groq)',
    provider: 'groq',
    apiModelId: 'openai/gpt-oss-120b',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'OpenAI open-weights 120B served by Groq (~500 tok/s).'
  },
  {
    id: 'groq-gpt-oss-20b',
    name: 'GPT-OSS 20B (Groq)',
    provider: 'groq',
    apiModelId: 'openai/gpt-oss-20b',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'OpenAI open-weights 20B served by Groq (~1000 tok/s).'
  },

  // ── Together AI ── ids from docs.together.ai serverless table; function
  // calling confirmed there for all four.
  {
    id: 'together-llama-3.3-70b',
    name: 'Llama 3.3 70B Turbo (Together)',
    provider: 'together',
    apiModelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'Llama 3.3 70B Instruct Turbo on Together serverless.'
  },
  {
    id: 'together-deepseek-v4-pro',
    name: 'DeepSeek V4 Pro (Together)',
    provider: 'together',
    apiModelId: 'deepseek-ai/DeepSeek-V4-Pro',
    contextWindow: 512_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'pro',
    description: 'DeepSeek V4 Pro hosted by Together — an alternative to the first-party API.'
  },
  {
    id: 'together-gpt-oss-120b',
    name: 'GPT-OSS 120B (Together)',
    provider: 'together',
    apiModelId: 'openai/gpt-oss-120b',
    contextWindow: 128_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'OpenAI open-weights 120B on Together serverless.'
  },
  {
    id: 'together-kimi-k2.6',
    name: 'Kimi K2.6 (Together)',
    provider: 'together',
    apiModelId: 'moonshotai/Kimi-K2.6',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: false,
    tier: 'pro',
    description: 'Kimi K2.6 hosted by Together.'
  },

  // ── Fireworks AI ── weakest-evidence slate (id unverified against a live
  // key). Use Settings → Models → "Verify against providers", or the
  // /v1/models import flow, before relying on it.
  {
    id: 'fireworks-gpt-oss-120b',
    name: 'GPT-OSS 120B (Fireworks)',
    provider: 'fireworks',
    apiModelId: 'accounts/fireworks/models/gpt-oss-120b',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description:
      'OpenAI open-weights 120B on Fireworks serverless (id unverified — check /v1/models).'
  },

  // ── Cerebras Inference ── ids from inference-docs.cerebras.ai; context
  // windows conservative where the docs omit them.
  {
    id: 'cerebras-gpt-oss-120b',
    name: 'GPT-OSS 120B (Cerebras)',
    provider: 'cerebras',
    apiModelId: 'gpt-oss-120b',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'OpenAI open-weights 120B at ~3000 tok/s (Cerebras production).'
  },
  {
    id: 'cerebras-gemma-4-31b',
    name: 'Gemma 4 31B (Cerebras)',
    provider: 'cerebras',
    apiModelId: 'gemma-4-31b',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'Gemma 4 31B at ~1850 tok/s (Cerebras preview).'
  },
  {
    id: 'cerebras-glm-4.7',
    name: 'GLM 4.7 (Cerebras)',
    provider: 'cerebras',
    apiModelId: 'zai-glm-4.7',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'Z.ai GLM 4.7 355B at ~1000 tok/s (Cerebras preview).'
  },

  // ── Hugging Face router ── hub ids, all present on the router's public
  // /v1/models. Default routing policy is :fastest; append :cheapest or a
  // concrete :provider suffix via Custom Models for explicit routing.
  {
    id: 'hf-gpt-oss-120b',
    name: 'GPT-OSS 120B (HF router)',
    provider: 'huggingface',
    apiModelId: 'openai/gpt-oss-120b',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'OpenAI open-weights 120B via Hugging Face Inference Providers.'
  },
  {
    id: 'hf-llama-3.3-70b',
    name: 'Llama 3.3 70B (HF router)',
    provider: 'huggingface',
    apiModelId: 'meta-llama/Llama-3.3-70B-Instruct',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'Llama 3.3 70B Instruct via Hugging Face Inference Providers.'
  },
  {
    id: 'hf-glm-5.2',
    name: 'GLM 5.2 (HF router)',
    provider: 'huggingface',
    apiModelId: 'zai-org/GLM-5.2',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: false,
    tier: 'open',
    description: 'Zhipu GLM 5.2 via Hugging Face Inference Providers.'
  },

  // Smaller first-party labs. Stable documented chat rosters are pinned;
  // volatile inference-host catalogs remain live-import only.
  {
    id: 'cohere-command-a-plus',
    name: 'Command A Plus',
    provider: 'cohere',
    apiModelId: 'command-a-plus-05-2026',
    contextWindow: 256_000,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    tier: 'pro',
    description: 'Cohere flagship through the OpenAI compatibility API.'
  },
  {
    id: 'cohere-command-a',
    name: 'Command A',
    provider: 'cohere',
    apiModelId: 'command-a-03-2025',
    contextWindow: 256_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'pro',
    description: 'Cohere Command A with tool use and long context.'
  },
  ...[
    ['minimax-m2.7', 'MiniMax M2.7', 'MiniMax-M2.7', 'pro'],
    ['minimax-m2.7-highspeed', 'MiniMax M2.7 HighSpeed', 'MiniMax-M2.7-highspeed', 'flash'],
    ['minimax-m2.5', 'MiniMax M2.5', 'MiniMax-M2.5', 'pro'],
    ['minimax-m2.5-highspeed', 'MiniMax M2.5 HighSpeed', 'MiniMax-M2.5-highspeed', 'flash'],
    ['minimax-m2.1', 'MiniMax M2.1', 'MiniMax-M2.1', 'pro'],
    ['minimax-m2.1-highspeed', 'MiniMax M2.1 HighSpeed', 'MiniMax-M2.1-highspeed', 'flash'],
    ['minimax-m2', 'MiniMax M2', 'MiniMax-M2', 'pro']
  ].map(([id, name, apiModelId, tier]) => ({
    id,
    name,
    provider: 'minimax',
    apiModelId,
    contextWindow: 204_800,
    supportsTools: true,
    supportsVision: false,
    isReasoner: true,
    tier: tier as ModelDescriptor['tier'],
    description: 'MiniMax M2-series reasoning model through its OpenAI-compatible endpoint.'
  })),
  {
    id: 'reka-flash',
    name: 'Reka Flash',
    provider: 'reka',
    apiModelId: 'reka-flash',
    contextWindow: 128_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'flash',
    description: 'Fast multimodal Reka model with function calling.'
  },
  {
    id: 'reka-edge',
    name: 'Reka Edge',
    provider: 'reka',
    apiModelId: 'reka-edge',
    contextWindow: 32_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Compact multimodal Reka model.'
  },
  {
    id: 'reka-flash-research',
    name: 'Reka Flash Research',
    provider: 'reka',
    apiModelId: 'reka-flash-research',
    contextWindow: 128_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'reasoner',
    description: 'Reka web-research model through the OpenAI-compatible chat endpoint.'
  },
  {
    id: 'sealion-gemma-v4-27b',
    name: 'Gemma SEA-LION v4 27B',
    provider: 'sealion',
    apiModelId: 'aisingapore/Gemma-SEA-LION-v4-27B-IT',
    contextWindow: 131_072,
    supportsTools: false,
    supportsVision: false,
    tier: 'open',
    description: 'AI Singapore multilingual Gemma model for Southeast Asian languages.'
  },
  {
    id: 'sealion-llama-v3.5-70b-r',
    name: 'Llama SEA-LION v3.5 70B Reasoning',
    provider: 'sealion',
    apiModelId: 'aisingapore/Llama-SEA-LION-v3.5-70B-R',
    contextWindow: 131_072,
    supportsTools: false,
    supportsVision: false,
    isReasoner: true,
    tier: 'reasoner',
    description: 'AI Singapore regional reasoning model.'
  },
  {
    id: 'sonar',
    name: 'Perplexity Sonar',
    provider: 'perplexity',
    apiModelId: 'sonar',
    contextWindow: 127_072,
    supportsTools: true,
    supportsVision: false,
    tier: 'flash',
    description: 'Web-grounded Perplexity Sonar model.'
  },
  {
    id: 'sonar-pro',
    name: 'Perplexity Sonar Pro',
    provider: 'perplexity',
    apiModelId: 'sonar-pro',
    contextWindow: 200_000,
    supportsTools: true,
    supportsVision: false,
    tier: 'pro',
    description: 'Higher-quality web-grounded Perplexity Sonar model.'
  },
  {
    id: 'sarvam-30b',
    name: 'Sarvam 30B',
    provider: 'sarvam',
    apiModelId: 'sarvam-30b',
    contextWindow: 65_536,
    supportsTools: true,
    supportsVision: false,
    isReasoner: true,
    tier: 'open',
    description: 'Efficient Indic-language reasoning and coding model.'
  },
  {
    id: 'sarvam-105b',
    name: 'Sarvam 105B',
    provider: 'sarvam',
    apiModelId: 'sarvam-105b',
    contextWindow: 131_072,
    supportsTools: true,
    supportsVision: false,
    isReasoner: true,
    tier: 'pro',
    description: 'Sarvam flagship for complex Indic-language reasoning and coding.'
  },
  {
    id: 'mercury-2',
    name: 'Mercury 2',
    provider: 'inception',
    apiModelId: 'mercury-2',
    contextWindow: 128_000,
    supportsTools: true,
    supportsVision: false,
    isReasoner: true,
    defaultMaxTokens: 8_192,
    reasoningCapOnToolUse: true,
    tier: 'pro',
    description: 'Inception Labs diffusion language model with configurable reasoning effort.'
  },
  {
    id: 'deepseek-v4-flash-vision-exp',
    name: 'DeepSeek V4 Flash Vision (exp)',
    provider: 'deepseek',
    apiModelId: 'deepseek-v4-flash-vision-exp',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'flash',
    description: 'Experimental DeepSeek V4 Flash with image input — 1M context, tools + vision.'
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    provider: 'google',
    apiModelId: 'gemini-3.7-flash',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    tier: 'flash',
    description: 'Google Gemini 3.7 Flash — agentic workhorse, 1M context, tools + vision.'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'google',
    apiModelId: 'gemini-3.6-flash',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    tier: 'flash',
    description: 'Google Gemini 3.6 Flash — coding/agent workhorse, 1M context, tools + vision.'
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    provider: 'google',
    apiModelId: 'gemini-3.5-flash-lite',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    tier: 'flash',
    description: 'Google Gemini 3.5 Flash-Lite — high-throughput, 1M context, tools + vision.'
  },
  {
    id: 'qwen3.8-max',
    name: 'Qwen3.8 Max',
    provider: 'dashscope',
    apiModelId: 'qwen3.8-max',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Alibaba Qwen3.8 Max — 2.4T MoE flagship, 1M context, tools + vision.'
  },
  {
    id: 'glm-5.3',
    name: 'GLM 5.3',
    provider: 'zhipu',
    apiModelId: 'glm-5.3',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: false,
    isReasoner: true,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'pro',
    description: 'Zhipu GLM 5.3 — coding/agent flagship, 1M context, always-on reasoning, tools.'
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'anthropic',
    apiModelId: 'claude-opus-5',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Anthropic Claude Opus 5 — flagship, 1M context, tools + vision.'
  },
  {
    id: 'claude-fable-5',
    name: 'Claude Fable 5',
    provider: 'anthropic',
    apiModelId: 'claude-fable-5',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Anthropic Claude Fable 5 — 1M context, tools + vision.'
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    provider: 'xai',
    apiModelId: 'grok-4.6',
    contextWindow: 500_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'xAI Grok 4.6 — 500K context, tools + vision.'
  },
  {
    id: 'minimax-m3',
    name: 'MiniMax M3',
    provider: 'minimax',
    apiModelId: 'MiniMax-M3',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'pro',
    description: 'MiniMax M3 — 1M context, tools + vision, always-on reasoning.'
  },
  {
    id: 'muse-spark-1.2',
    name: 'Muse Spark 1.2',
    provider: 'meta',
    apiModelId: 'muse-spark-1.2',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'pro',
    description: 'Meta Muse Spark 1.2 — hosted flagship, 1M context, tools + vision, reasoning.'
  },
  {
    id: 'muse-spark-1.1',
    name: 'Muse Spark 1.1',
    provider: 'meta',
    apiModelId: 'muse-spark-1.1',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    isReasoner: true,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'flash',
    description: 'Meta Muse Spark 1.1 — earlier hosted checkpoint, 1M context, tools + vision.'
  }
]


export const RETIRED_MODEL_MAP: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
  'deepseek-v3': 'deepseek-v4-flash',
  'deepseek-r1': 'deepseek-v4-pro',
  'kimi-k2-thinking': 'kimi-k3',
  'gemma-4-31b-it-free': 'gemma-4-31b-it-google',
  'gemma-4-31b-it': 'gemma-4-31b-it-google',
  'gemma-4-26b-a4b-it-free': 'gemma-4-26b-a4b-it-google',
  'gemma-4-26b-a4b-it': 'gemma-4-26b-a4b-it-google',
  'or-claude-sonnet-5': 'claude-sonnet-5',
  'or-gpt-5.6-terra': 'gpt-5.6-terra',
  'or-grok-4.5': 'grok-4.5',
  'or-kimi-k2.5': 'kimi-k2.5'
}
