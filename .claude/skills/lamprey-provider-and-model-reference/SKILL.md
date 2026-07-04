---
name: lamprey-provider-and-model-reference
description: The multi-provider LLM domain pack for Lamprey — OpenAI-compatible streaming, per-provider quirks (DeepSeek reasoning_content, Google's OpenAI-compat layer, DashScope, OpenRouter, Zhipu), capability flags, the native-vs-fallback tool-calling contract, retry/backoff, retired-model handling, and the checklists for adding a model or a provider. Load when touching electron/services/providers/, debugging provider HTTP errors, or adding/retiring models.
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

### Providers (5) — ids are also the keychain ids

`deepseek`, `google`, `dashscope`, `openrouter`, `zhipu`. All dispatched through the OpenAI-compatible protocol; Google goes through its `v1beta/openai/` compat endpoint, **not** the native Gemini SDK (an FC-0 decision — one wire protocol for all).

### MODEL_CATALOG (verified 2026-07-02, v0.16.0 — re-verify command in Provenance)

| id | provider | notes |
|---|---|---|
| `deepseek-v4-pro` | deepseek | default model; reasoner |
| `deepseek-v4-flash` | deepseek | |
| `gemma-3-27b-it`, `gemma-3-12b-it` | google | |
| `gemma-4-31b-it-free`, `gemma-4-31b-it`, `gemma-4-26b-a4b-it-free`, `gemma-4-26b-a4b-it` | openrouter | |
| `qwen3-max`, `qwen3-coder-plus`, `qwen3-coder-flash`, `qwen3.5-plus`, `qwen3.5-flash`, `qwen-long` | dashscope | `qwen-long`: huge context, no tools |
| `glm-5.2`, `glm-5.2-1m` | zhipu | added v0.15.2/.3 |

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

## Checklist: adding a provider (trace of what the Zhipu addition touched, v0.15.2)

1. Extend the `ProviderId` union + provider entry (base URL, auth header shape) in `providers/registry.ts`.
2. Keychain: the provider id becomes a valid key id; add the entry to the Settings → API Keys provider list (`src/components/settings/ApiKeySettings.tsx`) with label + docs URL.
3. Add catalog models (checklist above).
4. Validate `validateProviderKey` works against the provider's cheapest endpoint.
5. Both tsc configs + `npm test` + live key test in Settings.

## Provenance and maintenance

Based on direct reads of `electron/services/providers/registry.ts` (catalog ids, retired map, watchdog constants verified 2026-07-02) plus `ARCHITECTURE/FUNCTION_CALLING.md` and DEVLOG v0.15.x entries, at v0.16.0.

Re-verify:
- Catalog: `grep -n "id: '" electron/services/providers/registry.ts`
- Retired map: `grep -n -A8 "RETIRED_MODEL_MAP" electron/services/providers/registry.ts`
- Watchdog defaults: `grep -n "DEFAULT_STREAM_INACTIVITY_MS" electron/services/providers/registry.ts`
- Fallback contract injection: `grep -rn "FALLBACK_TOOL_INSTRUCTION\|\"action\"" electron/services/ | grep -i fallback | head`
- Downgrade threshold: `grep -n "MALFORMED\|MISMATCH" electron/services/tool-unlock-state.ts electron/services/capability-*.ts 2>/dev/null`
