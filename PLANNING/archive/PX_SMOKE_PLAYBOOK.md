# PX_SMOKE_PLAYBOOK — Provider Expansion live smoke (owner-run)

The keys and the spend are the owner's, so this playbook — not CI — is the live
gate for the Provider Expansion Phase. Everything statically checkable already
gates in vitest (union parity, catalog invariants, keyless dispatch, override
handling, custom-provider resolution). Run what's below with real keys after
installing v0.17.0. Each ask is one cheap turn; skip any provider you hold no
key for and mark it `no-key` — that is an honest result, not a failure.

## 0. Prerequisites

- v0.17.0 installed, launched once (settings migrate untouched — new keys are
  optional additions).
- For each provider you want live: paste its key in Settings → API Keys (cards
  are grouped Frontier / Open-source hosts / Local / Custom). The input
  placeholder shows the expected key format where the provider has one.

## 1. Per-provider pass (repeat per keyed provider)

| Step | Action | Pass looks like |
|---|---|---|
| 1a | Settings → API Keys → provider card → **Test** | "authenticated (N models exposed by /v1/models)" — or the chat-probe success for providers without /v1/models |
| 1b | Settings → Models → **Verify against providers** | Provider row shows `ok: N live ids`; each of its catalog models chips `verified` (a `missing` chip = live id drift: fix the catalog id, don't ship the claim) |
| 1c | Pick one model from the provider in the model picker; send: *"Read the repo README title with a tool, then tell me it in one sentence."* | Streamed reply + one native tool call visible; no fallback-parser chrome |

Priority order if time is short: **anthropic** (compat layer — the one endpoint
whose /v1/models behavior through the OpenAI SDK we could not pre-verify),
**fireworks** (its single catalog id ships `unverified`), **openai**, then the
rest.

### Per-provider expectations worth knowing before you judge a result

- **anthropic** — if 1a's models.list errors non-401, the key still validates
  through the automatic chat probe against `claude-haiku-4-5` (tier flash =
  cheapest). Tool calls stream natively; `reasoning_effort` is ignored by the
  compat layer, so no reasoning chrome is expected from Claude models.
- **moonshot** — `kimi-k2-thinking` should show a live reasoning block
  (`reasoning_content` channel) and still complete tool turns (the v0.15.5
  guard caps reasoning on tool turns).
- **groq / cerebras** — expect visibly fast token rates; ids include
  vendor-prefixed forms (`openai/gpt-oss-120b`) — that's the live id, not a bug.
- **huggingface** — key must be a fine-grained token with the Inference
  Providers permission; a 403 on 1a means the token lacks it.

## 2. Local runtime pass (Ollama; LM Studio identical at :1234)

1. `ollama serve` + `ollama pull llama3.2` (any small model).
2. Settings → API Keys → Local runtimes → Ollama shows "Local — no key needed";
   **Test** passes with zero keys stored.
3. Settings → Models → Import from /v1/models → provider "Ollama (local)" →
   **Load live models** → Add the pulled model.
4. Chat one turn on it. Pass = streamed reply, no key prompt anywhere.
5. (LAN variant) Stop local ollama, add to settings.json:
   `"providerBaseUrlOverrides": {"ollama": "http://<lan-host>:11434/v1"}` —
   repeat step 4 without an app restart. Pass = the LAN box answers.

## 3. Custom endpoint round-trip

1. Serve anything OpenAI-compatible (quickest: `ollama serve` again, treated as
   a third-party endpoint).
2. Settings → API Keys → Custom endpoints → Add endpoint
   (`id: gpu-box`, base URL `http://127.0.0.1:11434/v1`, requires-key OFF).
3. The new card appears in the Custom endpoints group; **Test** passes keylessly.
4. Settings → Models → Import from /v1/models → "gpu-box" → add a model → chat
   one turn on it.
5. Remove endpoint; confirm the card disappears and the model errors cleanly
   ("Unknown provider 'gpu-box'") if still selected — that error naming the id
   is the pass condition, not a crash.

## 4. Results ledger

Record outcomes in PX_BASELINE §6 (provider → 1a/1b/1c result or `no-key`).
An id that comes back `missing` at 1b gets fixed in `MODEL_CATALOG` in a small
follow-up commit — never re-labeled verified by hand.
