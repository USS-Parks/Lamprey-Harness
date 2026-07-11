---
name: lamprey-provider-and-model-reference
description: The multi-provider LLM domain pack for Lamprey — OpenAI-compatible streaming across 17 built-in providers (frontier labs, open-source hosts, keyless local runtimes) plus user-defined custom endpoints, per-provider quirks (reasoning field names, Anthropic's compat-layer limits, base-URL overrides), capability flags, the native-vs-fallback tool-calling contract, retry/backoff, retired-model handling, and the checklists for adding a model or a provider. Load when touching electron/services/providers/, debugging provider HTTP errors, or adding/retiring models.
---

# Lamprey Provider & Model Reference

## When to use / when not

- **Use** when working in `electron/services/providers/`, adding or retiring a model/provider, debugging streaming/tool-calling/reasoning behavior, or choosing capability flags.
- **Don't use** for general architecture (see `lamprey-architecture-contract`), key storage (see `lamprey-config-and-flags`), or symptom triage (see `lamprey-debugging-playbook`).

## Domain primer (terms defined once)

- **OpenAI-compatible chat completions**: the de-facto HTTP protocol (`POST …/chat/completions`) all five providers speak. Requests carry `messages[]`, optional `tools[]` (JSON-schema function specs), `stream: true` for **SSE** (Server-Sent Events — a long-lived HTTP response emitting `data:` lines, each a JSON delta chunk).
- **Delta accumulation**: streamed chunks carry partial content / partial `tool_calls`; the client concatenates them until a `finish_reason` arrives (`stop`, `tool_calls`, `length`).
- **`reasoning_content`**: a non-standard extra field some providers (DeepSeek, DashScope) stream alongside `content`, carrying chain-of-thought. OpenRouter uses `reasoning`. Lamprey preserves it end-to-end (audit phase).
- **Context window**: max input tokens the model accepts. **Capability flags**: per-model descriptor booleans/values that change dispatch behavior (below).

## The registry (`electron/services/providers/registry.ts`)

### Providers (17 built-in + custom) — ids are also the keychain ids

Built-ins since the Provider Expansion Phase (2026-07-11): `deepseek`, `google`,
`dashscope`, `openrouter`, `zhipu`, `openai`, `anthropic`, `xai`, `mistral`,
`moonshot`, `groq`, `together`, `fireworks`, `cerebras`, `huggingface`, plus
keyless local runtimes `ollama` and `lmstudio` (`keyOptional: true`, placeholder
key `'local'`, empty built-in catalogs — import live ids). User-defined **custom
providers** (`settings.json.customProviders`: `{id, baseURL, label?, requiresKey?}`)
resolve like built-ins everywhere via `resolveProviderDescriptor(id)`; built-in ids
cannot be shadowed. All dispatch rides the one OpenAI-compatible protocol; Google
goes through its `v1beta/openai/` compat endpoint (FC-0), Anthropic through its
official OpenAI-compat layer at `api.anthropic.com/v1/` (tools+streaming supported;
`strict`/`response_format`/`reasoning_effort` silently ignored — never set
`reasoningCapOnToolUse` on anthropic models). `providerBaseUrlOverrides` in
settings.json redirects any provider's base URL (http/https only, validated at the
registry). Per-provider wire notes: `ARCHITECTURE/FUNCTION_CALLING.md` §16.

### MODEL_CATALOG (verified 2026-07-11, Provider Expansion Phase — re-verify command in Provenance)

39 entries. Per-id evidence status lives in `PLANNING/PX_BASELINE.md` §3.

| provider | ids (summary) | notes |
|---|---|---|
| deepseek | `deepseek-v4-pro` (default), `deepseek-v4-flash` | reasoners, full v0.15.5 guard |
| google | `gemma-3-27b-it`, `gemma-3-12b-it` | |
| openrouter | 4× gemma-4 + `or-claude-sonnet-5`, `or-gpt-5.6-terra`, `or-grok-4.5`, `or-kimi-k2.5`, `or-llama-4-maverick` | `or-` prefix avoids first-party id collisions; all live-verified on the public list |
| dashscope | `qwen3-max`, `qwen3-coder-plus/flash`, `qwen3.5-plus/flash`, `qwen-long` | `qwen-long`: huge context, no tools |
| zhipu | `glm-5.2`, `glm-5.2-1m` | `[1m]` suffix is a literal apiModelId |
| openai | `gpt-5.6` (=Sol), `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5` | GA 2026-07-09; `gpt-5.5-pro` excluded (Responses-API-only) |
| anthropic | `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5` | haiku is tier `flash` = the key-validation chat probe |
| xai | `grok-4.5`, `grok-4.3`, `grok-build-0.1` | |
| mistral | `mistral-large/medium/small-latest`, `codestral-latest` | rolling aliases |
| moonshot | `kimi-k2.6`, `kimi-k2.5`, `kimi-k2-thinking` | thinking model carries the full reasoning guard |
| groq | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | |
| together | Llama-3.3-70B-Turbo, DeepSeek-V4-Pro, gpt-oss-120b, Kimi-K2.6 (hub-style ids) | |
| fireworks | `accounts/fireworks/models/gpt-oss-120b` | UNVERIFIED until a key exists |
| cerebras | `gpt-oss-120b`, `gemma-4-31b`, `zai-glm-4.7` | |
| huggingface | `openai/gpt-oss-120b`, `meta-llama/Llama-3.3-70B-Instruct`, `zai-org/GLM-5.2` | hub ids; optional `:policy`/`:provider` suffix |
| ollama / lmstudio | (none — import) | keyless local runtimes |

### Capability flags and what each changes at dispatch

| Flag | Effect |
|---|---|
| `supportsTools` | false → native `tools[]` never sent; the FC-6 **fallback contract** is injected instead (below) |
| `supportsVision` | gates image attachments |
| `isReasoner` | reasoning-channel handling; native reasoners get the in-prose `<think>` bullet stripped from the system prompt (avoids double-emission) |
| `defaultMaxTokens` | output budget applied when the caller omits one (v0.15.5 guard — DeepSeek V4 could exhaust its whole budget on reasoning and emit empty tool params) |
| `reasoningCapOnToolUse` | sends `reasoning_effort: 'low'` when tools are offered (same v0.15.5 incident) |
| `tier` | display/selection grouping (`pro`/`flash`/`open`/`coder`/`reasoner`) |

**Rule:** behavioral differences are expressed as flags on the descriptor, never as model-id conditionals scattered through dispatch code.

### resolveModel priority chain

1. `MODEL_CATALOG` builtin → 2. `RETIRED_MODEL_MAP` remap → 3. custom models from `settings.json.customModels` (cache keyed by settings.json mtime; JM-11 fixed these being ignored) → 4. synthetic OpenAI-compatible fallback descriptor (assumes deepseek provider).

`RETIRED_MODEL_MAP` (v0.15.6): `deepseek-chat`→`deepseek-v4-flash`, `deepseek-reasoner`→`deepseek-v4-pro`, `deepseek-v3`→`deepseek-v4-flash`, `deepseek-r1`→`deepseek-v4-pro`. When a provider retires a model: add the mapping, delete the catalog entry, and sweep hardcoded ids across `electron/` and `src/` (the v0.15.6 sweep hit ChatInput, SideChatPanel, WorktreeManagerModal, AutomationsPanel, ModelSettings).

### chatStream vs chatOnce

- **`chatStream`**: the main path. Callbacks: `onChunk` (text delta), `onReasoning`, `onVitals` (~2s heartbeat feeding the "Ns since last chunk" pill), `onDone` (accumulated tool calls + final content), `onError` (partial content/reasoning preserved). `onDone` fires without being awaited — its body must catch its own errors (JM-8 lesson).
- **`chatOnce`**: one-shot completion returning `{ content, reasoning? }`, reading both `message.reasoning` (OpenRouter) and `message.reasoning_content` (DeepSeek/DashScope).

### Retry / stall behavior

- Up to **3 retries** for HTTP 429 and connection errors without a status code, exponential backoff.
- **Stream inactivity watchdog** (T1): if no chunk arrives for `streamInactivityMs` (default 60 000, min clamp 5 000, `0` disables), the attempt is aborted and retried with backoff; after retries exhaust, a `StreamInactivityError` surfaces.
- **Per-attempt accumulators reset on retry** (JM-9) — a retried stream must not duplicate the already-streamed prefix.

## Tool calling: native vs fallback

**Native path** (`supportsTools: true`): JSON-schema tools sent with the request; streamed `tool_calls` deltas accumulated; arguments validated via `validateToolArguments` before dispatch — schema mismatches return a *corrective tool result* (the model is told what was wrong) rather than silently coercing to `{}` (JM-10).

**Fallback path** (`supportsTools: false`, or after downgrade): the model is instructed to emit
```json
{"action": "<tool_name>", "input": { …args }}
```
and a brace-balanced parser (FC-6) extracts it from prose. Two hard rules:
- The fallback instruction must actually be **injected** into the prompt — it was dead code until JM-10; non-native models were never told the format.
- Fallback-parsed calls get `fb_`-prefixed ids and **skip persisted "always allow"** approval policies (FC-9 trust degradation).

**Capability downgrade (FC-10):** 3 capability mismatches in a conversation (model claims/attempts tools it can't do natively) → session-scoped downgrade to the fallback path. Per-conversation state; cleared on conversation delete.

## Checklist: adding a model

1. Append a descriptor to `MODEL_CATALOG` with honest flags (test `supportsTools` empirically — send a trivial tool and see if a structured `tool_calls` delta comes back).
2. Confirm the provider id maps to an existing keychain entry; if the key is new, that's "adding a provider" (below).
3. Set `defaultMaxTokens`/`reasoningCapOnToolUse` if the model is a reasoner (check for the empty-params failure mode on tool turns).
4. Verify: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`, then a live smoke: stream a reply, force a tool call, confirm reasoning lands if applicable.
5. Route through `lamprey-change-control` (trivial catalog append = small change; new behavior = plan).

## Checklist: adding a provider (post-Provider-Expansion, 2026-07-11)

**User-controlled OpenAI-compatible endpoint → zero code.** Settings → API Keys →
Custom endpoints (persists `settings.json.customProviders`); the id becomes valid
across keychain, dispatch, Custom Models, verifyCatalog, and the /v1/models import.

Promoting a built-in:

1. Add the id to BOTH `ProviderId` unions — `providers/registry.ts` and
   `src/lib/types.ts` (`provider-parity.test.ts` source-locks them; it caught a
   real one-sided widening the day it landed).
2. Add the `PROVIDERS` entry: baseURL, keyEnv (= id), docsUrl, `keyHint`
   ("sk-...") where the format is known, `keyOptional: true` for keyless runtimes.
3. Add catalog models (checklist above). The Settings → API Keys card renders
   automatically from `settings:listProviderKeys` — no UI edit; only extend the
   renderer's `PROVIDER_GROUPS` display map in `ApiKeySettings.tsx` if the new id
   should sit in a specific group (ungrouped ids show under Custom endpoints).
4. Validate `validateProviderKey` against the provider's cheapest endpoint (the
   chat-probe fallback uses the provider's `flash`-tier catalog entry — give
   every key-required provider one).
5. Both tsc configs + `npm test` + live key test in Settings.

## Provenance and maintenance

Based on direct reads of `electron/services/providers/registry.ts` (catalog ids, retired map, watchdog constants re-verified 2026-07-11 during the Provider Expansion Phase) plus `ARCHITECTURE/FUNCTION_CALLING.md` §16 and `PLANNING/PX_BASELINE.md`, at v0.17.0.

Re-verify:
- Catalog: `grep -n "id: '" electron/services/providers/registry.ts`
- Retired map: `grep -n -A8 "RETIRED_MODEL_MAP" electron/services/providers/registry.ts`
- Watchdog defaults: `grep -n "DEFAULT_STREAM_INACTIVITY_MS" electron/services/providers/registry.ts`
- Fallback contract injection: `grep -rn "FALLBACK_TOOL_INSTRUCTION\|\"action\"" electron/services/ | grep -i fallback | head`
- Downgrade threshold: `grep -n "MALFORMED\|MISMATCH" electron/services/tool-unlock-state.ts electron/services/capability-*.ts 2>/dev/null`
