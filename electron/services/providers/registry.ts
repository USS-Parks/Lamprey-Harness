import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getKey } from '../keychain'
import { boundedJsonPreview, recordEvent } from '../event-log'
import { trace } from '../debug-trace'

// T1 — SSE inactivity watchdog. Some providers (notably DeepSeek under load
// and OpenRouter when routing through a stalled upstream) silently leave the
// SSE socket half-open: no chunks, no FIN, no error. The `for await` loop
// below would otherwise wait forever. We race each chunk-await against a
// timer and abort the underlying HTTP request on expiry; the throw lands in
// the existing partial-persist + retry path so the user's on-screen content
// is preserved and a flaky provider gets the same retry treatment as a 429.
export class StreamInactivityError extends Error {
  constructor(public readonly inactivityMs: number) {
    super(`Stream stalled — provider sent no chunks for ${Math.round(inactivityMs / 1000)}s.`)
    this.name = 'StreamInactivityError'
  }
}

const DEFAULT_STREAM_INACTIVITY_MS = 60_000
const MIN_STREAM_INACTIVITY_MS = 5_000

// Test hook: setting this overrides the settings.json value for the duration
// of the test. Cleared by setting back to null.
let streamInactivityOverrideMs: number | null = null
export function __setStreamInactivityForTesting(ms: number | null): void {
  streamInactivityOverrideMs = ms
}

// Injected by main.ts during boot so we can read settings.json without an
// electron import in test contexts. Tests leave it null and use the override.
let userDataPathProvider: (() => string) | null = null
export function setUserDataPathProvider(fn: (() => string) | null): void {
  userDataPathProvider = fn
}

function readStreamInactivityMs(): number {
  if (streamInactivityOverrideMs !== null) return streamInactivityOverrideMs
  if (!userDataPathProvider) return DEFAULT_STREAM_INACTIVITY_MS
  try {
    const path = join(userDataPathProvider(), 'settings.json')
    if (!existsSync(path)) return DEFAULT_STREAM_INACTIVITY_MS
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { streamInactivityMs?: unknown }
    const ms = raw.streamInactivityMs
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return DEFAULT_STREAM_INACTIVITY_MS
    if (ms <= 0) return 0 // 0 disables the watchdog entirely
    return Math.max(MIN_STREAM_INACTIVITY_MS, ms)
  } catch {
    return DEFAULT_STREAM_INACTIVITY_MS
  }
}

export type ProviderId =
  | 'deepseek'
  | 'google'
  | 'dashscope'
  | 'openrouter'
  | 'zhipu'
  | 'openai'
  | 'anthropic'
  | 'xai'
  | 'mistral'
  | 'moonshot'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'huggingface'
  | 'ollama'
  | 'lmstudio'

export interface ProviderDescriptor {
  /** Built-in ids are ProviderId union members; user-defined custom
   *  providers (settings.json `customProviders`) carry arbitrary ids. */
  id: string
  label: string
  baseURL: string
  keyEnv: string
  docsUrl: string
  /** No API key required (local runtimes such as Ollama / LM Studio). The
   *  OpenAI SDK rejects an empty key string, so a placeholder is sent when
   *  none is stored. A stored key still wins — some local proxies gate on
   *  a real bearer token. */
  keyOptional?: boolean
  /** Key-format hint rendered as the input placeholder in
   *  Settings → API Keys (e.g. "sk-..."). Purely cosmetic. */
  keyHint?: string
}

export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    keyEnv: 'deepseek',
    docsUrl: 'https://platform.deepseek.com/api_keys'
  },
  google: {
    id: 'google',
    label: 'Google AI (Gemma)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyEnv: 'google',
    docsUrl: 'https://aistudio.google.com/app/apikey'
  },
  dashscope: {
    id: 'dashscope',
    label: 'Alibaba DashScope (Qwen)',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyEnv: 'dashscope',
    docsUrl: 'https://dashscope.console.aliyun.com/apiKey'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (Gemma 4, multi-model)',
    baseURL: 'https://openrouter.ai/api/v1',
    keyEnv: 'openrouter',
    docsUrl: 'https://openrouter.ai/keys'
  },
  zhipu: {
    id: 'zhipu',
    label: 'Zhipu AI (GLM)',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
    keyEnv: 'zhipu',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    keyEnv: 'openai',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-...'
  },
  // Anthropic is reached over its official OpenAI SDK compatibility endpoint
  // (trailing slash required). Anthropic frames the layer as intended for
  // testing/comparing model capabilities rather than as the long-term
  // production surface, but commits to keeping it functional without
  // breaking changes. Streaming + tool_calls are fully supported; `strict`,
  // `response_format`, and `reasoning_effort` are silently ignored — so
  // anthropic catalog entries must never set reasoningCapOnToolUse (no-op)
  // and no thinking channel comes back (isReasoner stays false).
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    baseURL: 'https://api.anthropic.com/v1/',
    keyEnv: 'anthropic',
    docsUrl: 'https://platform.claude.com/settings/keys',
    keyHint: 'sk-ant-...'
  },
  xai: {
    id: 'xai',
    label: 'xAI (Grok)',
    baseURL: 'https://api.x.ai/v1',
    keyEnv: 'xai',
    docsUrl: 'https://console.x.ai',
    keyHint: 'xai-...'
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    baseURL: 'https://api.mistral.ai/v1',
    keyEnv: 'mistral',
    docsUrl: 'https://console.mistral.ai/api-keys'
  },
  // Kimi rebrand (2026): the console moved to platform.kimi.ai but the API
  // host stays api.moonshot.ai (api.kimi.com serves no /v1).
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot AI (Kimi)',
    baseURL: 'https://api.moonshot.ai/v1',
    keyEnv: 'moonshot',
    docsUrl: 'https://platform.kimi.ai/console/api-keys',
    keyHint: 'sk-...'
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    keyEnv: 'groq',
    docsUrl: 'https://console.groq.com/keys',
    keyHint: 'gsk_...'
  },
  together: {
    id: 'together',
    label: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    keyEnv: 'together',
    docsUrl: 'https://api.together.ai/settings/api-keys'
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks AI',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    keyEnv: 'fireworks',
    docsUrl: 'https://app.fireworks.ai/settings/users/api-keys'
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras Inference',
    baseURL: 'https://api.cerebras.ai/v1',
    keyEnv: 'cerebras',
    docsUrl: 'https://cloud.cerebras.ai',
    keyHint: 'csk-...'
  },
  // Hugging Face Inference Providers router: model ids are hub ids, with an
  // optional routing suffix (`:fastest` default policy, `:cheapest`, or a
  // concrete `:provider`). The router's /v1/models is public.
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face (Inference Providers)',
    baseURL: 'https://router.huggingface.co/v1',
    keyEnv: 'huggingface',
    docsUrl: 'https://huggingface.co/settings/tokens',
    keyHint: 'hf_...'
  },
  // Local runtimes. Keyless — the running server IS the credential. Their
  // built-in catalogs are empty by design (models are machine-specific);
  // pull the live list via Settings → Models or add Custom Models. A LAN
  // host or non-default port goes in settings.json
  // `providerBaseUrlOverrides` (e.g. {"ollama": "http://192.168.1.10:11434/v1"}).
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    baseURL: 'http://127.0.0.1:11434/v1',
    keyEnv: 'ollama',
    docsUrl: 'https://ollama.com/download',
    keyOptional: true
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    baseURL: 'http://127.0.0.1:1234/v1',
    keyEnv: 'lmstudio',
    docsUrl: 'https://lmstudio.ai',
    keyOptional: true
  }
}

export interface ModelDescriptor {
  id: string
  name: string
  /** A built-in ProviderId or a custom provider id from settings.json. */
  provider: string
  apiModelId: string
  contextWindow: number
  supportsTools: boolean
  supportsVision: boolean
  isReasoner?: boolean
  /** When set, sent as `max_tokens` when the caller doesn't provide one.
   *  Prevents reasoning models from exhausting their output budget on
   *  chain-of-thought before emitting tool-call parameters. */
  defaultMaxTokens?: number
  /** When true AND tools are offered in the request, send
   *  `reasoning_effort: 'low'` to cap chain-of-thought token consumption
   *  so the content/tool-call portion of the output has room. */
  reasoningCapOnToolUse?: boolean
  tier: 'pro' | 'flash' | 'open' | 'coder' | 'reasoner'
  description: string
}

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
  // Gemma 4 via OpenRouter — verified live on openrouter.ai/api/v1/models.
  // Free variants are rate-limited; the non-free entries bill via OpenRouter
  // credits. AI Studio's native Gemma 4 endpoints exist too but their id
  // strings aren't published on any public-readable page — paste those into
  // Settings → Models → Custom Models if you prefer the direct route.
  {
    id: 'gemma-4-31b-it-free',
    name: 'Gemma 4 31B (free, OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'google/gemma-4-31b-it:free',
    contextWindow: 262144,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Gemma 4 31B-instruction-tuned, rate-limited free tier via OpenRouter.'
  },
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B (OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'google/gemma-4-31b-it',
    contextWindow: 262144,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Gemma 4 31B-instruction-tuned, paid tier via OpenRouter credits.'
  },
  {
    id: 'gemma-4-26b-a4b-it-free',
    name: 'Gemma 4 26B A4B (free, OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'google/gemma-4-26b-a4b-it:free',
    contextWindow: 262144,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Gemma 4 26B activation-tuned, rate-limited free tier via OpenRouter.'
  },
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B A4B (OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'google/gemma-4-26b-a4b-it',
    contextWindow: 262144,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Gemma 4 26B activation-tuned, paid tier via OpenRouter credits.'
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

  // ── xAI (Grok) ── ids from docs.x.ai; capabilities cross-referenced from
  // OpenRouter's live listing of the same models (tools + vision true).
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

  // ── Moonshot AI (Kimi) ── k2.6 pinned from platform docs; k2.5 and
  // k2-thinking inferred from OpenRouter's live listing of the same models —
  // confirm via Settings → Models → "Verify against providers" with a key.
  {
    id: 'kimi-k2.6',
    name: 'Kimi K2.6',
    provider: 'moonshot',
    apiModelId: 'kimi-k2.6',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Moonshot flagship — open-weights Kimi K2.6, 256K context.'
  },
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'moonshot',
    apiModelId: 'kimi-k2.5',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Kimi K2.5 — 256K context.'
  },
  {
    id: 'kimi-k2-thinking',
    name: 'Kimi K2 Thinking',
    provider: 'moonshot',
    apiModelId: 'kimi-k2-thinking',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: false,
    isReasoner: true,
    defaultMaxTokens: 16_384,
    reasoningCapOnToolUse: true,
    tier: 'reasoner',
    description: 'Kimi thinking model — reasoning-guarded like the DeepSeek reasoners.'
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

  // ── OpenRouter broadening ── frontier + open flagships through the one
  // OpenRouter key; every id below was present on openrouter.ai/api/v1/models
  // with tools support at catalog time.
  {
    id: 'or-claude-sonnet-5',
    name: 'Claude Sonnet 5 (OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'anthropic/claude-sonnet-5',
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Claude Sonnet 5 billed through OpenRouter credits.'
  },
  {
    id: 'or-gpt-5.6-terra',
    name: 'GPT-5.6 Terra (OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'openai/gpt-5.6-terra',
    contextWindow: 1_050_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'GPT-5.6 Terra billed through OpenRouter credits.'
  },
  {
    id: 'or-grok-4.5',
    name: 'Grok 4.5 (OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'x-ai/grok-4.5',
    contextWindow: 500_000,
    supportsTools: true,
    supportsVision: true,
    tier: 'pro',
    description: 'Grok 4.5 billed through OpenRouter credits.'
  },
  {
    id: 'or-kimi-k2.5',
    name: 'Kimi K2.5 (OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'moonshotai/kimi-k2.5',
    contextWindow: 262_144,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Kimi K2.5 billed through OpenRouter credits.'
  },
  {
    id: 'or-llama-4-maverick',
    name: 'Llama 4 Maverick (OpenRouter)',
    provider: 'openrouter',
    apiModelId: 'meta-llama/llama-4-maverick',
    contextWindow: 1_048_576,
    supportsTools: true,
    supportsVision: true,
    tier: 'open',
    description: 'Meta Llama 4 Maverick — 1M context via OpenRouter.'
  }
]

export interface ChatStreamParams {
  temperature?: number
  topP?: number
  maxTokens?: number | null
}

/**
 * Audit context optionally passed by the orchestrator (chat:send, agent
 * pipeline, automations) so chatStream / chatOnce can emit `model.request.*`
 * events linked to the right correlation id. When omitted, the provider
 * helpers run silent — same behavior as before Prompt 3 — so tests and
 * stand-alone callers don't need to plumb anything.
 */
export interface ModelRequestAudit {
  correlationId?: string
  conversationId?: string
  /** Optional label for the role making the call (planner/coder/reviewer/
   *  composer/title-gen). Goes in the event payload, not the actor field. */
  role?: string
  /** Distinguish completion turns from incidental composer/title helpers in
   *  the timeline. Default 'main'. */
  purpose?: 'main' | 'composer' | 'title' | 'pipeline' | 'sub-agent' | 'other'
}

export interface StreamingVitals {
  lastChunkAt: number
  msSinceLastChunk: number
  chunkCount: number
  tokenEstimate: number
  attemptElapsedMs: number
}

export interface ChatStreamCallbacks {
  onChunk: (content: string) => void
  /** Reasoning-channel deltas. DeepSeek's reasoner / V4-Flash thinking mode
   *  streams chain-of-thought on `delta.reasoning_content` (some providers
   *  alias it to `delta.reasoning`). When omitted, reasoning is dropped. */
  onReasoning?: (content: string) => void
  /** T4 — heartbeat the provider fires ~every 2s during a streaming attempt
   *  so the caller can broadcast a `chat:streaming-vitals` event. Lets the
   *  renderer show "last chunk Ns ago / N tokens" so the user can tell a
   *  slow think from a dead socket without canceling. */
  onVitals?: (vitals: StreamingVitals) => void
  onDone: (fullContent: string, toolCalls?: ToolCallAccumulator[], fullReasoning?: string) => void
  /** Called when the stream gives up. `partial` carries whatever body +
   *  reasoning had already arrived before the failure, so the caller can
   *  persist it as a partial assistant message instead of letting the user's
   *  on-screen content evaporate. Partial in-flight tool calls are NOT
   *  exposed because their args may be incomplete and would break the next
   *  tool round. */
  onError: (error: string, partial?: { content: string; reasoning?: string }) => void
}

export interface ToolCallAccumulator {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

const clientCache = new Map<string, OpenAI>()

export function resetProviderClients(): void {
  clientCache.clear()
}

export function resetProviderClient(provider: string): void {
  // Cache keys are `${provider}::${baseURL}` so a base-URL override change
  // naturally misses the stale client; deleting by prefix covers both the
  // default and any overridden entries for the provider.
  for (const key of Array.from(clientCache.keys())) {
    if (key === provider || key.startsWith(`${provider}::`)) clientCache.delete(key)
  }
}

// settings.json `providerBaseUrlOverrides`: per-provider base-URL replacement
// for LAN inference boxes and non-default local ports. Values must be
// http(s) URLs — anything else is ignored at this consumption site (the
// settings sanitizer is open-by-design and does not validate shapes).
// Cached on settings.json mtime like the custom-model reader.
let baseUrlOverrideCache: { mtimeMs: number; overrides: Record<string, string> } | null = null

function readBaseUrlOverride(providerId: string): string | null {
  if (!userDataPathProvider) return null
  try {
    const path = join(userDataPathProvider(), 'settings.json')
    if (!existsSync(path)) return null
    const mtimeMs = statSync(path).mtimeMs
    if (!baseUrlOverrideCache || baseUrlOverrideCache.mtimeMs !== mtimeMs) {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
        providerBaseUrlOverrides?: unknown
      }
      const overrides: Record<string, string> = {}
      const src = raw.providerBaseUrlOverrides
      if (src && typeof src === 'object' && !Array.isArray(src)) {
        for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
          if (typeof v === 'string' && /^https?:\/\//i.test(v)) overrides[k] = v
        }
      }
      baseUrlOverrideCache = { mtimeMs, overrides }
    }
    return baseUrlOverrideCache.overrides[providerId] ?? null
  } catch {
    return null
  }
}

// settings.json `customProviders`: user-defined OpenAI-compatible endpoints
// promoted to first-class provider ids — accepted by the keychain, the
// key-settings UI, Custom Models, and dispatch. Entry shape:
//   { id, baseURL, label?, requiresKey? }
// Rules enforced at this consumption site (the settings sanitizer is
// open-by-design): id must be kebab-safe and MUST NOT shadow a built-in;
// baseURL must be http(s). requiresKey defaults to false — most self-hosted
// endpoints are unauthenticated, and a stored key always wins anyway.
export interface CustomProviderConfig {
  id: string
  baseURL: string
  label?: string
  requiresKey?: boolean
}

const CUSTOM_PROVIDER_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

let customProviderCache: {
  mtimeMs: number
  providers: Map<string, ProviderDescriptor>
} | null = null

function readCustomProviderDescriptors(): Map<string, ProviderDescriptor> {
  const empty = new Map<string, ProviderDescriptor>()
  if (!userDataPathProvider) return empty
  try {
    const path = join(userDataPathProvider(), 'settings.json')
    if (!existsSync(path)) return empty
    const mtimeMs = statSync(path).mtimeMs
    if (customProviderCache && customProviderCache.mtimeMs === mtimeMs) {
      return customProviderCache.providers
    }
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { customProviders?: unknown }
    const arr = Array.isArray(raw.customProviders) ? raw.customProviders : []
    const providers = new Map<string, ProviderDescriptor>()
    for (const p of arr as Array<Record<string, unknown>>) {
      if (!p || typeof p.id !== 'string' || !CUSTOM_PROVIDER_ID_RE.test(p.id)) continue
      if (p.id in PROVIDERS) continue // built-ins cannot be shadowed
      if (typeof p.baseURL !== 'string' || !/^https?:\/\//i.test(p.baseURL)) continue
      providers.set(p.id, {
        id: p.id,
        label: typeof p.label === 'string' && p.label.trim() ? p.label.trim() : p.id,
        baseURL: p.baseURL,
        keyEnv: p.id,
        docsUrl: '',
        keyOptional: p.requiresKey !== true
      })
    }
    customProviderCache = { mtimeMs, providers }
    return providers
  } catch {
    return empty
  }
}

/** Resolve a provider id to its descriptor, or null when unknown. The single
 *  lookup point for dispatch + validation: built-ins first, then user-defined
 *  custom providers from settings.json. */
export function resolveProviderDescriptor(id: string): ProviderDescriptor | null {
  return (
    (PROVIDERS as Record<string, ProviderDescriptor>)[id] ??
    readCustomProviderDescriptors().get(id) ??
    null
  )
}

export function isKnownProvider(id: unknown): id is string {
  return typeof id === 'string' && resolveProviderDescriptor(id) !== null
}

/** Built-in providers followed by custom providers — the list surface for
 *  Settings → API Keys and the model-provider pickers. */
export function listAllProviders(): ProviderDescriptor[] {
  return [...Object.values(PROVIDERS), ...Array.from(readCustomProviderDescriptors().values())]
}

/** Live model ids from one provider's /v1/models — the import affordance in
 *  Settings → Models. Throws on unknown provider / missing key / endpoint
 *  errors; the caller surfaces the message verbatim. */
export async function listLiveModelIds(provider: string): Promise<string[]> {
  const client = getClientForProvider(provider)
  const response = await client.models.list()
  return (Array.isArray(response.data) ? response.data : [])
    .map((m: unknown) =>
      m && typeof (m as { id?: unknown }).id === 'string' ? (m as { id: string }).id : null
    )
    .filter((id): id is string => !!id)
    .sort()
}

function getClientForProvider(provider: string): OpenAI {
  const desc = resolveProviderDescriptor(provider)
  if (!desc) {
    throw new Error(
      `Unknown provider '${provider}'. Known providers: ${Object.keys(PROVIDERS).join(', ')}.`
    )
  }
  const baseURL = readBaseUrlOverride(provider) ?? desc.baseURL
  const cacheKey = `${provider}::${baseURL}`
  const cached = clientCache.get(cacheKey)
  if (cached) return cached
  const apiKey = getKey(desc.keyEnv) ?? (desc.keyOptional ? 'local' : null)
  if (!apiKey) {
    throw new Error(`${desc.label} API key not configured. Add one in Settings → API Keys.`)
  }
  const client = new OpenAI({ apiKey, baseURL })
  clientCache.set(cacheKey, client)
  return client
}

const RETIRED_MODEL_MAP: Record<string, string> = {
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
  'deepseek-v3': 'deepseek-v4-flash',
  'deepseek-r1': 'deepseek-v4-pro'
}

// JM-11 (CC-7) — user-defined Custom Models. `model:addCustom` persists id,
// name, provider, contextWindow, supportsTools into settings.json, but
// resolveModel never consulted them: any unknown id fell through to the
// hard-coded DeepSeek descriptor, so a DashScope/AI-Studio id pasted per the
// catalog's own instructions dispatched to api.deepseek.com with the DeepSeek
// key. Cached on settings.json mtime — resolveModel is on every hot path.
let customModelCache: { mtimeMs: number; models: ModelDescriptor[] } | null = null

function readCustomModelDescriptors(): ModelDescriptor[] {
  if (!userDataPathProvider) return []
  try {
    const path = join(userDataPathProvider(), 'settings.json')
    if (!existsSync(path)) return []
    const mtimeMs = statSync(path).mtimeMs
    if (customModelCache && customModelCache.mtimeMs === mtimeMs) {
      return customModelCache.models
    }
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as { customModels?: unknown }
    const arr = Array.isArray(raw.customModels) ? raw.customModels : []
    const models: ModelDescriptor[] = []
    for (const m of arr as Array<Record<string, unknown>>) {
      if (!m || typeof m.id !== 'string' || !m.id) continue
      // Custom providers are legal targets here — only a truly unknown
      // provider string falls back to deepseek (the pre-expansion behavior
      // silently coerced ANY non-built-in string, including valid custom
      // endpoints, onto api.deepseek.com).
      const provider =
        typeof m.provider === 'string' && isKnownProvider(m.provider) ? m.provider : 'deepseek'
      models.push({
        id: m.id,
        name: typeof m.name === 'string' && m.name ? m.name : m.id,
        provider,
        apiModelId: typeof m.apiModelId === 'string' && m.apiModelId ? m.apiModelId : m.id,
        contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : 65536,
        supportsTools: m.supportsTools !== false,
        supportsVision: m.supportsVision === true,
        tier: 'pro',
        description: 'Custom model.'
      })
    }
    customModelCache = { mtimeMs, models }
    return models
  } catch {
    return []
  }
}

export function resolveModel(modelId: string): ModelDescriptor {
  const found = MODEL_CATALOG.find((m) => m.id === modelId)
  if (found) return found

  const replacement = RETIRED_MODEL_MAP[modelId]
  if (replacement) {
    const mapped = MODEL_CATALOG.find((m) => m.id === replacement)
    if (mapped) return mapped
  }

  // JM-11 (CC-7) — a user-defined Custom Model wins over the blind fallback.
  const custom = readCustomModelDescriptors().find((m) => m.id === modelId)
  if (custom) return custom

  // Unknown model id — assume DeepSeek, OpenAI-compatible.
  return {
    id: modelId,
    name: modelId,
    provider: 'deepseek',
    apiModelId: modelId,
    contextWindow: 65536,
    supportsTools: true,
    supportsVision: false,
    tier: 'pro',
    description: 'Custom model.'
  }
}

export function getProviderForModel(modelId: string): string {
  return resolveModel(modelId).provider
}

export function getApiModelId(modelId: string): string {
  return resolveModel(modelId).apiModelId
}

export interface KeyValidationResult {
  ok: boolean
  reason?: string
  modelCount?: number
}

export async function validateProviderKeyDetailed(provider: string): Promise<KeyValidationResult> {
  let client: OpenAI
  try {
    client = getClientForProvider(provider)
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'No API key stored for this provider.' }
  }

  // Primary check: GET /v1/models. Costs nothing, requires only auth, and
  // works on every OpenAI-compatible provider we route to. A 401/403 here
  // is the only thing that proves the key itself is bad.
  try {
    const response = await client.models.list()
    const count = Array.isArray(response.data) ? response.data.length : 0
    return { ok: true, modelCount: count }
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return { ok: false, reason: `Provider rejected the key (HTTP ${err.status}).` }
    }
    // Fall through to a chat-completion fallback for providers that don't
    // expose /v1/models — DashScope's compatible-mode endpoint, for instance.
    return validateViaChatProbe(provider, client, err)
  }
}

async function validateViaChatProbe(
  provider: string,
  client: OpenAI,
  originalError: any
): Promise<KeyValidationResult> {
  // Pick the cheapest catalog model we know about for this provider. This is
  // a fallback only — if the call fails for any non-auth reason we report it
  // verbatim rather than claiming the key is invalid. JM-12 (CC-21): prefer
  // the flash tier — the old bare `.find` took the FIRST entry, which for
  // DeepSeek was the flagship V4 Pro, the opposite of "cheapest".
  const probe =
    MODEL_CATALOG.find((m) => m.provider === provider && m.tier === 'flash') ??
    MODEL_CATALOG.find((m) => m.provider === provider)
  if (!probe) {
    return {
      ok: false,
      reason: originalError?.message || `No catalog model available to probe ${provider}.`
    }
  }
  try {
    const response = await client.chat.completions.create({
      model: probe.apiModelId,
      messages: [{ role: 'user', content: 'ok' }],
      max_tokens: 1
    })
    return { ok: !!response.choices[0]?.message }
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return { ok: false, reason: `Provider rejected the key (HTTP ${err.status}).` }
    }
    return {
      ok: false,
      reason:
        err?.message ||
        originalError?.message ||
        'Provider returned an unexpected error during validation.'
    }
  }
}

// Boolean wrapper retained for the legacy single-key path
// (settings:testApiKey -> DeepSeekClient.validateKey).
export async function validateProviderKey(provider: string): Promise<boolean> {
  const result = await validateProviderKeyDetailed(provider)
  return result.ok
}

export type CatalogStatus =
  'verified' | 'missing' | 'no-key' | 'unsupported-endpoint' | 'auth-failed' | 'error'

export interface ProviderCatalogReport {
  provider: string
  status: 'ok' | 'no-key' | 'unsupported-endpoint' | 'auth-failed' | 'error'
  reason?: string
  // Sample of live ids returned by /v1/models (capped for size).
  liveIds?: string[]
  liveCount?: number
}

export interface CatalogVerificationReport {
  generatedAt: number
  providers: ProviderCatalogReport[]
  models: Array<{
    modelId: string
    name: string
    provider: string
    apiModelId: string
    status: CatalogStatus
    reason?: string
  }>
}

// Calls each provider's /v1/models endpoint with the stored key and confirms
// that every catalog apiModelId is present in the live response. Returns a
// structured report so the UI can show per-model status — no inferences, no
// fabricated "verified" claims.
export async function verifyCatalog(): Promise<CatalogVerificationReport> {
  // Built-ins AND custom providers: the live-id pull is also what the
  // model-import affordance feeds on, and custom endpoints deserve the same
  // no-inference verification surface.
  const providerIds = listAllProviders().map((p) => p.id)

  const providerReports = await Promise.all(
    providerIds.map(async (pid): Promise<ProviderCatalogReport> => {
      let client: OpenAI
      try {
        client = getClientForProvider(pid)
      } catch (err: any) {
        return { provider: pid, status: 'no-key', reason: err?.message || 'No API key stored.' }
      }
      try {
        const response = await client.models.list()
        const ids = (Array.isArray(response.data) ? response.data : [])
          .map((m: any) => (typeof m?.id === 'string' ? m.id : null))
          .filter((id): id is string => !!id)
        return {
          provider: pid,
          status: 'ok',
          liveIds: ids.slice(0, 500),
          liveCount: ids.length
        }
      } catch (err: any) {
        if (err?.status === 401 || err?.status === 403) {
          return {
            provider: pid,
            status: 'auth-failed',
            reason: `Provider rejected the key (HTTP ${err.status}).`
          }
        }
        if (err?.status === 404 || err?.status === 405) {
          // Provider's compatible-mode endpoint doesn't expose /v1/models;
          // we can't confirm or refute the catalog without spending tokens.
          return {
            provider: pid,
            status: 'unsupported-endpoint',
            reason: `Provider does not expose /v1/models (HTTP ${err.status}). Catalog entries for this provider cannot be auto-verified.`
          }
        }
        return {
          provider: pid,
          status: 'error',
          reason: err?.message || 'Unknown error contacting provider.'
        }
      }
    })
  )

  const providerReportByProvider = new Map<string, ProviderCatalogReport>(
    providerReports.map((r) => [r.provider, r])
  )

  const models = MODEL_CATALOG.map((m) => {
    const report = providerReportByProvider.get(m.provider)
    let status: CatalogStatus
    let reason: string | undefined
    if (!report || report.status === 'no-key') {
      status = 'no-key'
      reason = `Add a ${resolveProviderDescriptor(m.provider)?.label ?? m.provider} key in Settings → API Keys to verify.`
    } else if (report.status === 'auth-failed') {
      status = 'auth-failed'
      reason = report.reason
    } else if (report.status === 'unsupported-endpoint') {
      status = 'unsupported-endpoint'
      reason = report.reason
    } else if (report.status === 'error') {
      status = 'error'
      reason = report.reason
    } else if (report.liveIds && report.liveIds.includes(m.apiModelId)) {
      status = 'verified'
    } else {
      status = 'missing'
      reason = `Provider's /v1/models response did not include "${m.apiModelId}".`
    }
    return {
      modelId: m.id,
      name: m.name,
      provider: m.provider,
      apiModelId: m.apiModelId,
      status,
      reason
    }
  })

  return {
    generatedAt: Date.now(),
    providers: providerReports,
    models
  }
}

/** Reasoning Audit Phase R2 — chatOnce now returns BOTH the visible body
 *  and any chain-of-thought the provider emitted alongside it. Reads the
 *  two field names different OpenAI-compatible APIs use:
 *    - `message.reasoning`         (OpenRouter, some DeepSeek variants)
 *    - `message.reasoning_content` (DashScope qwen, deepseek-reasoner on
 *                                   non-streamed responses)
 *  Both are stripped + trimmed; if both are populated, `reasoning` wins.
 *  Undefined when neither is set or both are empty. Callers that only
 *  care about the body destructure `{ content }`. */
export interface ChatOnceResult {
  content: string
  reasoning?: string
}

export async function chatOnce(
  messages: ChatCompletionMessageParam[],
  modelId: string,
  signal?: AbortSignal,
  audit?: ModelRequestAudit
): Promise<ChatOnceResult> {
  const desc = resolveModel(modelId)
  const client = getClientForProvider(desc.provider)
  const startedAt = Date.now()
  const traceId = randomUUID().slice(0, 8)
  trace('chatOnce.enter', {
    traceId,
    model: desc.id,
    apiModelId: desc.apiModelId,
    provider: desc.provider,
    purpose: audit?.purpose,
    role: audit?.role,
    conversationId: audit?.conversationId,
    parentSignalAborted: signal?.aborted ?? null,
    messageCount: messages.length
  })
  emitModelRequestStarted(desc, audit, { streaming: false, toolCount: 0 })
  try {
    const response = await client.chat.completions.create(
      {
        model: desc.apiModelId,
        messages,
        ...(desc.defaultMaxTokens != null && { max_tokens: desc.defaultMaxTokens })
      },
      signal ? { signal } : undefined
    )
    const message = response.choices[0]?.message as
      | { content?: string | null; reasoning?: string | null; reasoning_content?: string | null }
      | undefined
    const content = message?.content || ''
    // Provider field-name variance — see ChatOnceResult docstring. Take
    // the first populated value; trim whitespace; treat empty as absent.
    const rawReasoning =
      (typeof message?.reasoning === 'string' && message.reasoning.length > 0
        ? message.reasoning
        : typeof message?.reasoning_content === 'string' && message.reasoning_content.length > 0
          ? message.reasoning_content
          : '') ?? ''
    const reasoning = rawReasoning.trim().length > 0 ? rawReasoning.trim() : undefined
    const finishReason = response.choices[0]?.finish_reason ?? undefined
    trace('chatOnce.complete', {
      traceId,
      durationMs: Date.now() - startedAt,
      contentLen: content.length,
      reasoningLen: reasoning?.length ?? 0,
      finishReason
    })
    emitModelRequestCompleted(desc, audit, {
      streaming: false,
      toolCount: 0,
      retryCount: 0,
      durationMs: Date.now() - startedAt,
      finishReason,
      cancelled: signal?.aborted ?? false
    })
    return { content, reasoning }
  } catch (err: any) {
    trace('chatOnce.error', {
      traceId,
      durationMs: Date.now() - startedAt,
      errName: err?.name,
      errStatus: err?.status,
      errMessage: String(err?.message ?? err).slice(0, 200),
      parentSignalAborted: signal?.aborted ?? null
    })
    emitModelRequestFailed(desc, audit, {
      streaming: false,
      toolCount: 0,
      retryCount: 0,
      durationMs: Date.now() - startedAt,
      cancelled: signal?.aborted ?? false,
      error: err
    })
    throw err
  }
}

export async function chatStream(
  messages: ChatCompletionMessageParam[],
  modelId: string,
  tools: ChatCompletionTool[] | undefined,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
  params?: ChatStreamParams,
  audit?: ModelRequestAudit
): Promise<void> {
  const desc = resolveModel(modelId)
  const client = getClientForProvider(desc.provider)
  const usableTools = desc.supportsTools && tools && tools.length > 0 ? tools : undefined
  const offeredToolCount = usableTools?.length ?? 0

  const startedAt = Date.now()
  emitModelRequestStarted(desc, audit, {
    streaming: true,
    toolCount: offeredToolCount
  })

  let fullContent = ''
  let fullReasoning = ''
  const toolCallsAccumulator: Map<number, ToolCallAccumulator> = new Map()
  let retries = 0
  const maxRetries = 3
  const inactivityMs = readStreamInactivityMs()

  // DBG2 — per-call trace id so we can correlate every line in
  // lamprey-debug.log back to the same stream invocation.
  const traceId = randomUUID().slice(0, 8)
  trace('chatStream.enter', {
    traceId,
    model: desc.id,
    apiModelId: desc.apiModelId,
    provider: desc.provider,
    inactivityMs,
    toolCount: offeredToolCount,
    purpose: audit?.purpose,
    conversationId: audit?.conversationId
  })

  // T4 — vitals heartbeat. Fires every 2s while the attempt streams. Counters
  // reset on each retry so the renderer's "Ns since last chunk" reflects the
  // CURRENT attempt, not the cumulative attempt history.
  const VITALS_HEARTBEAT_MS = 2_000
  let vitalsTimer: ReturnType<typeof setInterval> | null = null
  let lastChunkAt = 0
  let chunkCount = 0
  let attemptStartedAt = Date.now()
  const startVitalsHeartbeat = (): void => {
    if (!callbacks.onVitals) return
    if (vitalsTimer) clearInterval(vitalsTimer)
    vitalsTimer = setInterval(() => {
      try {
        const now = Date.now()
        const tokenEstimate = Math.round((fullContent.length + fullReasoning.length) / 4)
        callbacks.onVitals?.({
          lastChunkAt,
          msSinceLastChunk: lastChunkAt === 0 ? now - attemptStartedAt : now - lastChunkAt,
          chunkCount,
          tokenEstimate,
          attemptElapsedMs: now - attemptStartedAt
        })
      } catch (err) {
        console.warn('[providers] vitals heartbeat threw:', err)
      }
    }, VITALS_HEARTBEAT_MS)
  }
  const stopVitalsHeartbeat = (): void => {
    if (vitalsTimer) {
      clearInterval(vitalsTimer)
      vitalsTimer = null
    }
  }

  while (retries <= maxRetries) {
    // T1 — Per-attempt controller. User-signal aborts route through this;
    // the inactivity timer also fires it. We use the `inactivityFired` flag
    // to disambiguate inactivity-abort from user-cancel in the catch.
    const attemptController = new AbortController()
    let inactivityFired = false
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null

    const clearInactivityTimer = (): void => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer)
        inactivityTimer = null
      }
    }
    const armInactivityTimer = (): void => {
      if (inactivityMs <= 0) {
        trace('chatStream.watchdog.disabled', { traceId, retries, reason: 'inactivityMs<=0' })
        return
      }
      clearInactivityTimer()
      const armedAt = Date.now()
      inactivityTimer = setTimeout(() => {
        const elapsed = Date.now() - armedAt
        trace('chatStream.watchdog.fired', {
          traceId,
          retries,
          inactivityMs,
          actualElapsedMs: elapsed,
          chunkCount,
          fullContentLen: fullContent.length,
          fullReasoningLen: fullReasoning.length
        })
        inactivityFired = true
        attemptController.abort()
        trace('chatStream.watchdog.abort-called', {
          traceId,
          attemptControllerAborted: attemptController.signal.aborted
        })
      }, inactivityMs)
    }

    const onUserAbort = (): void => attemptController.abort()
    if (signal) {
      if (signal.aborted) attemptController.abort()
      else signal.addEventListener('abort', onUserAbort, { once: true })
    }

    try {
      attemptStartedAt = Date.now()
      lastChunkAt = 0
      chunkCount = 0
      // JM-9 (CC-2) — reset the accumulators for EVERY attempt. A mid-stream
      // stall followed by a successful retry used to persist partial₁+full₂
      // (duplicated prefix) and concatenate attempt-2 tool-call argument
      // fragments onto attempt-1's partial call — malformed JSON args that
      // then silently parsed to {}. The renderer's live buffer may briefly
      // show the retried text twice; chat:done replaces it with the persisted
      // (correct) message.
      fullContent = ''
      fullReasoning = ''
      toolCallsAccumulator.clear()
      startVitalsHeartbeat()
      armInactivityTimer()
      trace('chatStream.attempt.start', { traceId, retries, attemptStartedAt })
      // Fix A — explicit output token budget. When the caller hasn't set
      // maxTokens, use the model's defaultMaxTokens so reasoning models
      // can't exhaust the entire output budget on chain-of-thought.
      const effectiveMaxTokens =
        params?.maxTokens != null ? params.maxTokens : (desc.defaultMaxTokens ?? undefined)

      // Fix B — cap reasoning effort on tool-use turns. When the model
      // emits extended reasoning AND tools are offered, the reasoning can
      // consume the output budget leaving no room for tool-call parameters.
      // Send reasoning_effort: 'low' so the provider allocates more of the
      // budget to the content/tool-call portion.
      const reasoningCap =
        desc.reasoningCapOnToolUse && usableTools && usableTools.length > 0
          ? { reasoning_effort: 'low' as const }
          : {}

      const stream = await client.chat.completions.create(
        {
          model: desc.apiModelId,
          messages,
          stream: true,
          tools: usableTools,
          ...(params?.temperature !== undefined && { temperature: params.temperature }),
          ...(params?.topP !== undefined && { top_p: params.topP }),
          ...(effectiveMaxTokens != null && { max_tokens: effectiveMaxTokens }),
          ...reasoningCap
        } as any,
        { signal: attemptController.signal }
      )
      trace('chatStream.sdk.stream-resolved', {
        traceId,
        retries,
        delayMs: Date.now() - attemptStartedAt
      })

      // DBG2 — manual iteration so we can log each .next() lifecycle and
      // see whether the hang lives at iterator.next or at chunk-process.
      const iter = (stream as unknown as AsyncIterable<any>)[Symbol.asyncIterator]()
      let iterIndex = 0
      while (true) {
        const nextStartedAt = Date.now()
        trace('chatStream.iter.next.await', {
          traceId,
          retries,
          iterIndex,
          msSinceLastChunk: lastChunkAt === 0 ? null : nextStartedAt - lastChunkAt,
          inactivityFired,
          attemptControllerAborted: attemptController.signal.aborted,
          parentSignalAborted: signal?.aborted ?? null
        })
        let iterResult: IteratorResult<any>
        try {
          iterResult = await iter.next()
        } catch (iterErr: any) {
          trace('chatStream.iter.next.throw', {
            traceId,
            retries,
            iterIndex,
            waitMs: Date.now() - nextStartedAt,
            errName: iterErr?.name,
            errMessage: String(iterErr?.message ?? iterErr).slice(0, 200),
            inactivityFired,
            attemptControllerAborted: attemptController.signal.aborted,
            parentSignalAborted: signal?.aborted ?? null
          })
          throw iterErr
        }
        trace('chatStream.iter.next.resolved', {
          traceId,
          retries,
          iterIndex,
          waitMs: Date.now() - nextStartedAt,
          done: iterResult.done,
          hasValue: iterResult.value !== undefined
        })
        if (iterResult.done) break
        const chunk = iterResult.value
        iterIndex++
        clearInactivityTimer()
        lastChunkAt = Date.now()
        chunkCount++
        if (signal?.aborted) {
          stopVitalsHeartbeat()
          callbacks.onDone(fullContent + ' [cancelled]', undefined, fullReasoning || undefined)
          emitModelRequestCompleted(desc, audit, {
            streaming: true,
            toolCount: offeredToolCount,
            retryCount: retries,
            durationMs: Date.now() - startedAt,
            cancelled: true,
            emittedToolCallCount: toolCallsAccumulator.size
          })
          return
        }

        const delta = chunk.choices[0]?.delta as
          | ((typeof chunk.choices)[0]['delta'] & {
              reasoning_content?: string | null
              reasoning?: string | null
            })
          | undefined

        let chunkKind: string = 'empty'
        if (delta?.content) {
          chunkKind = 'content'
          fullContent += delta.content
          callbacks.onChunk(delta.content)
        }

        // DeepSeek reasoners + V4-Flash thinking-mode emit chain-of-thought
        // on `delta.reasoning_content`. OpenRouter normalizes the same channel
        // to `delta.reasoning`. Forward whichever the provider sends so the
        // renderer can show a live "thinking…" block.
        const reasoningDelta =
          (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) ||
          (typeof delta?.reasoning === 'string' && delta.reasoning) ||
          ''
        if (reasoningDelta) {
          chunkKind = chunkKind === 'content' ? 'content+reasoning' : 'reasoning'
          fullReasoning += reasoningDelta
          callbacks.onReasoning?.(reasoningDelta)
        }

        if (delta?.tool_calls) {
          chunkKind = chunkKind === 'empty' ? 'tool_call' : chunkKind + '+tool_call'
          for (const tc of delta.tool_calls) {
            // JM-9 (CC-14) — loose OpenAI-compat layers can omit `index` on
            // parallel tool calls; keying the Map on undefined merged every
            // call into one corrupt entry with all argument strings
            // concatenated. A chunk that announces a new id gets a fresh
            // slot; an index-less fragment continues the last slot.
            let idx: number
            if (typeof tc.index === 'number') {
              idx = tc.index
            } else if (tc.id) {
              const existing = Array.from(toolCallsAccumulator.entries()).find(
                ([, a]) => a.id === tc.id
              )
              idx = existing ? existing[0] : toolCallsAccumulator.size
            } else {
              idx = Math.max(0, toolCallsAccumulator.size - 1)
            }
            if (!toolCallsAccumulator.has(idx)) {
              toolCallsAccumulator.set(idx, {
                id: tc.id || '',
                type: 'function',
                function: { name: '', arguments: '' }
              })
            }
            const acc = toolCallsAccumulator.get(idx)!
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.function.name = tc.function.name
            if (tc.function?.arguments) acc.function.arguments += tc.function.arguments
          }
        }
        trace('chatStream.chunk.processed', {
          traceId,
          retries,
          iterIndex,
          chunkKind,
          chunkCount,
          contentDeltaLen: delta?.content?.length ?? 0,
          reasoningDeltaLen: reasoningDelta.length,
          finishReason: chunk.choices?.[0]?.finish_reason ?? null
        })
        armInactivityTimer()
      }

      trace('chatStream.iter.done', {
        traceId,
        retries,
        chunkCount,
        contentLen: fullContent.length,
        reasoningLen: fullReasoning.length,
        toolCalls: toolCallsAccumulator.size
      })
      clearInactivityTimer()
      stopVitalsHeartbeat()
      if (signal) signal.removeEventListener('abort', onUserAbort)

      const toolCalls =
        toolCallsAccumulator.size > 0 ? Array.from(toolCallsAccumulator.values()) : undefined

      callbacks.onDone(fullContent, toolCalls, fullReasoning || undefined)
      emitModelRequestCompleted(desc, audit, {
        streaming: true,
        toolCount: offeredToolCount,
        retryCount: retries,
        durationMs: Date.now() - startedAt,
        cancelled: false,
        emittedToolCallCount: toolCalls?.length ?? 0
      })
      return
    } catch (err: any) {
      clearInactivityTimer()
      stopVitalsHeartbeat()
      if (signal) signal.removeEventListener('abort', onUserAbort)

      trace('chatStream.catch.entered', {
        traceId,
        retries,
        errName: err?.name,
        errStatus: err?.status,
        errMessage: String(err?.message ?? err).slice(0, 200),
        inactivityFired,
        parentSignalAborted: signal?.aborted ?? null,
        attemptControllerAborted: attemptController.signal.aborted,
        chunkCount,
        fullContentLen: fullContent.length,
        fullReasoningLen: fullReasoning.length
      })

      // User-cancelled — the attempt controller was fired by the user signal,
      // not the watchdog. Treat as a clean cancellation regardless of which
      // error the SDK threw on the way out.
      if (signal?.aborted) {
        callbacks.onDone(fullContent + ' [cancelled]', undefined, fullReasoning || undefined)
        emitModelRequestCompleted(desc, audit, {
          streaming: true,
          toolCount: offeredToolCount,
          retryCount: retries,
          durationMs: Date.now() - startedAt,
          cancelled: true,
          emittedToolCallCount: toolCallsAccumulator.size
        })
        return
      }

      // Inactivity watchdog fired. Treat like a transient network error:
      // retry up to maxRetries with the same back-off, then emit a clearly
      // labeled error so the user knows the provider stalled (not bad code).
      if (inactivityFired) {
        if (retries < maxRetries) {
          retries++
          const delay = Math.pow(2, retries) * 1000
          trace('chatStream.retry.inactivity', { traceId, retries, backoffMs: delay })
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        const stallErr = new StreamInactivityError(inactivityMs)
        trace('chatStream.exit.inactivity-exhausted', {
          traceId,
          retries,
          inactivityMs,
          contentLen: fullContent.length,
          reasoningLen: fullReasoning.length
        })
        callbacks.onError(stallErr.message, {
          content: fullContent,
          reasoning: fullReasoning || undefined
        })
        emitModelRequestFailed(desc, audit, {
          streaming: true,
          toolCount: offeredToolCount,
          retryCount: retries,
          durationMs: Date.now() - startedAt,
          cancelled: false,
          error: stallErr
        })
        return
      }

      if (err?.status === 401 || err?.status === 403) {
        callbacks.onError(
          `Invalid ${resolveProviderDescriptor(desc.provider)?.label ?? desc.provider} API key`,
          {
            content: fullContent,
            reasoning: fullReasoning || undefined
          }
        )
        emitModelRequestFailed(desc, audit, {
          streaming: true,
          toolCount: offeredToolCount,
          retryCount: retries,
          durationMs: Date.now() - startedAt,
          cancelled: false,
          error: err,
          httpStatus: err?.status
        })
        return
      }

      if (err?.status === 429 && retries < maxRetries) {
        retries++
        const delay = Math.pow(2, retries) * 1000
        await new Promise((r) => setTimeout(r, delay))
        continue
      }

      if (retries < maxRetries && !err?.status) {
        retries++
        const delay = Math.pow(2, retries) * 1000
        await new Promise((r) => setTimeout(r, delay))
        continue
      }

      callbacks.onError(err?.message || 'Unknown error', {
        content: fullContent,
        reasoning: fullReasoning || undefined
      })
      emitModelRequestFailed(desc, audit, {
        streaming: true,
        toolCount: offeredToolCount,
        retryCount: retries,
        durationMs: Date.now() - startedAt,
        cancelled: false,
        error: err,
        httpStatus: err?.status
      })
      return
    }
  }
}

// ──────────────────── model-request audit helpers ────────────────────

// Producers for `model.request.*` events. The handlers above call these at
// every terminal point — clean completion, signal-cancelled mid-stream,
// non-retryable error, retries-exhausted error. The wrapper try/catches keep
// the chat path resilient: any event-log failure must not poison the
// response we hand back to chat.ts.

interface ModelRequestStartedOptions {
  streaming: boolean
  toolCount: number
}

function emitModelRequestStarted(
  desc: ModelDescriptor,
  audit: ModelRequestAudit | undefined,
  opts: ModelRequestStartedOptions
): void {
  if (!audit) return
  try {
    recordEvent({
      type: 'model.request.started',
      actorKind: 'system',
      conversationId: audit.conversationId,
      correlationId: audit.correlationId,
      entityKind: 'model',
      entityId: desc.id,
      payload: {
        provider: desc.provider,
        model: desc.id,
        apiModelId: desc.apiModelId,
        streaming: opts.streaming,
        toolCount: opts.toolCount,
        role: audit.role,
        purpose: audit.purpose ?? 'main'
      }
    })
  } catch (err) {
    console.error('[providers] model.request.started event failed:', err)
  }
}

interface ModelRequestCompletedOptions {
  streaming: boolean
  toolCount: number
  retryCount: number
  durationMs: number
  cancelled: boolean
  finishReason?: string
  emittedToolCallCount?: number
}

function emitModelRequestCompleted(
  desc: ModelDescriptor,
  audit: ModelRequestAudit | undefined,
  opts: ModelRequestCompletedOptions
): void {
  if (!audit) return
  try {
    recordEvent({
      type: 'model.request.completed',
      actorKind: 'model',
      severity: opts.cancelled ? 'warning' : 'info',
      conversationId: audit.conversationId,
      correlationId: audit.correlationId,
      entityKind: 'model',
      entityId: desc.id,
      payload: {
        provider: desc.provider,
        model: desc.id,
        apiModelId: desc.apiModelId,
        streaming: opts.streaming,
        toolCount: opts.toolCount,
        emittedToolCallCount: opts.emittedToolCallCount ?? 0,
        retryCount: opts.retryCount,
        durationMs: opts.durationMs,
        cancelled: opts.cancelled,
        finishReason: opts.finishReason,
        role: audit.role,
        purpose: audit.purpose ?? 'main'
      }
    })
  } catch (err) {
    console.error('[providers] model.request.completed event failed:', err)
  }
}

interface ModelRequestFailedOptions {
  streaming: boolean
  toolCount: number
  retryCount: number
  durationMs: number
  cancelled: boolean
  error: unknown
  httpStatus?: number
}

function emitModelRequestFailed(
  desc: ModelDescriptor,
  audit: ModelRequestAudit | undefined,
  opts: ModelRequestFailedOptions
): void {
  if (!audit) return
  try {
    const err = opts.error as { message?: string; name?: string } | undefined
    recordEvent({
      type: 'model.request.failed',
      actorKind: 'model',
      severity: 'error',
      conversationId: audit.conversationId,
      correlationId: audit.correlationId,
      entityKind: 'model',
      entityId: desc.id,
      payload: {
        provider: desc.provider,
        model: desc.id,
        apiModelId: desc.apiModelId,
        streaming: opts.streaming,
        toolCount: opts.toolCount,
        retryCount: opts.retryCount,
        durationMs: opts.durationMs,
        httpStatus: opts.httpStatus,
        cancelled: opts.cancelled,
        errorClass: err?.name,
        errorPreview: boundedJsonPreview(err?.message),
        role: audit.role,
        purpose: audit.purpose ?? 'main'
      }
    })
  } catch (e) {
    console.error('[providers] model.request.failed event failed:', e)
  }
}
