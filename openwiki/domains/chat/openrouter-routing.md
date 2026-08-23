# OpenRouter routing depth (Triple Lane)

OpenRouter is an **opt-in aggregator**. Pinned `MODEL_CATALOG` rows stay on their named providers (v0.27.1 / K4). Live import and custom models may use `provider: 'openrouter'`.

Request extras are built in `electron/services/providers/openrouter-routing.ts` and attached only from `providerChatExtras` when `desc.provider === 'openrouter'`:

| Settings key | Body field | Empty default |
|---|---|---|
| `openrouterFallbacks` | `models: string[]` | omitted |
| `openrouterProviderSort` (`default` / `price` / `latency` / `throughput`) | `provider.sort` | omitted when `default` |
| `openrouterProviderOrder` | `provider.order` | omitted |
| `openrouterProviderIgnore` | `provider.ignore` | omitted |

`openrouter/auto` is offered in the model picker only when an OpenRouter key is stored. It is **not** a catalog row. Auto-routing may stick to one upstream model for a session; prompt cache can miss across swaps.

Direct-provider calls (DeepSeek, Anthropic, MiniMax, …) never receive these fields.
