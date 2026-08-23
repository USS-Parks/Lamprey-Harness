import type { ModelDescriptor } from './registry'

/** First-party chat models released after the mid-July 2026 v0.27.1 roster. */
export const AUGUST_2026_MODELS: ModelDescriptor[] = [
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

