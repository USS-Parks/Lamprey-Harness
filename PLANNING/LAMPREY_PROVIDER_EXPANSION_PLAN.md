# LAMPREY_PROVIDER_EXPANSION_PLAN.md — Provider Expansion Phase (PX-0–PX-9)

Goal in the user's words: *"more connectors for API Keys from as many open source as well as
frontier models available… bump up its receptivity several layers."*

This phase delivers receptivity in **three layers**, each independently valuable:

- **Layer 1 — Named cloud providers.** The 5-provider registry grows to ~15: the frontier labs
  (OpenAI, Anthropic, xAI, Mistral, Moonshot) and the open-source inference hosts (Groq,
  Together, Fireworks, Cerebras, Hugging Face). Because the existing chain is already fully
  data-driven — `PROVIDERS` table → `settings:listProviderKeys` → `ApiKeySettings` cards →
  generic OpenAI-compat client → generic `/v1/models` key validation — this layer is almost
  pure data: union widening + table entries + catalog models. No new wire protocol.
- **Layer 2 — Local runtimes.** Ollama and LM Studio as first-class **keyless** providers
  (localhost OpenAI-compat endpoints), plus per-provider base-URL overrides so a LAN inference
  box works too. Includes one-click "import models from /v1/models" so a local provider is
  usable without hand-typing model ids.
- **Layer 3 — Bring-your-own endpoint.** User-defined custom providers
  (`settings.json.customProviders`: id, label, baseURL, key-optional) accepted everywhere a
  built-in provider id is: keychain, key-settings UI, custom models, dispatch. After this layer
  ships, Lamprey is receptive to **any** OpenAI-compatible endpoint forever — vLLM, llama.cpp
  server, LiteLLM proxies (which in turn front Azure/Bedrock/Vertex), future providers — with
  zero code changes.

---

## §0 — Governance

### Goal (one sentence)
Grow Lamprey's provider receptivity from 5 hardcoded connectors to ~15 named providers
(frontier + open-source) plus keyless local runtimes plus unlimited user-defined
OpenAI-compatible endpoints, without changing any default or touching the chat turn path.

### Scope (what this phase touches)
- `electron/services/providers/registry.ts` — `ProviderId` union, `PROVIDERS` table,
  `ProviderDescriptor` (new `keyOptional`/`keyHint` fields), `MODEL_CATALOG` additions,
  `getClientForProvider` (keyless + base-URL override + custom-provider resolution),
  `resolveModel` custom-provider fix (the `'deepseek'` coercion at the custom-model reader),
  new `resolveProviderDescriptor(id: string)` merge helper.
- `src/lib/types.ts` — renderer `ProviderId` union mirror (kept in lock-step by a new parity test).
- `electron/ipc/settings.ts` — `isProvider` gate widened to registry-backed lookup (built-in +
  custom); `listProviderKeys` merges custom providers; settings sanitizer allowlist gains
  `customProviders` + `providerBaseUrlOverrides`.
- `src/components/settings/ApiKeySettings.tsx` — grouped sections (Frontier / Open-source hosts /
  Local / Custom), keyless card state, key-format hints, custom-endpoint add/edit/remove form.
- `src/components/settings/ModelSettings.tsx` — custom-model provider select includes all
  providers (built-in + custom); "Import from /v1/models" affordance for keyless/local providers.
- `electron/services/providers/registry.test.ts`, `supports-tools-audit.test.ts`,
  `electron/ipc/settings-sanitizer.test.ts` — updated; new `provider-parity.test.ts` +
  catalog-invariant tests.
- `PLANNING/PX_BASELINE.md`, `PLANNING/PX_SMOKE_PLAYBOOK.md`, `ARCHITECTURE/` provider notes.
- `DEVLOG.md`, `README.md`, `CLAUDE.md`, `package.json` version bump → **v0.17.0** (wrap prompt only).

### Non-goals (explicitly out of scope)
- **No new wire protocols.** Everything ships over the existing OpenAI-compatible
  chat-completions path (the FC-0 decision stands). Anthropic rides its official OpenAI-compat
  endpoint (`https://api.anthropic.com/v1/`), not the native Messages API — honest limitations
  documented (no extended-thinking channel through the compat layer → `isReasoner: false`).
- **No Azure OpenAI, AWS Bedrock, or Vertex adapters.** Their auth is non-standard (deployment
  names, SigV4). A LiteLLM/gateway proxy through Layer 3 covers them; a native adapter is a
  future phase if ever wanted.
- **No default changes.** Default model stays `deepseek-v4-pro`; no new key is required for
  anything that works today; era-locked defaults untouched. This extends the already-documented
  multi-provider deviation — it is not an era-lock exception (no post-era *feature*, only a
  broader roster for an existing surface).
- **No billing/usage tracking, no provider-side web search, no changes to
  `electron/ipc/chat.ts`,** the tool layer, prompts (zero prompt-surface bytes — byte guards
  unaffected), search-provider keys (R4 namespace untouched), or the Deep Research cascade.
- **No fabricated model ids.** Every catalog entry ships either live-verified against the
  provider's `/v1/models` (where a key exists at PX-0) or honestly marked unverified in the
  descriptor comment, checkable via the existing Settings → Models → "Verify against providers"
  flow. No "verified" claims without a live response behind them.

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run <the test files this prompt touches>` — clean
4. No prompt in this phase touches `electron/ipc/chat.ts`; if that changes, that prompt also
   runs `npm run verify:proof -- --no-tests` — exits 0
5. Final phase gate (PX-9): full `npx vitest run` + `npm run build` + `npm run verify:proof`

### Commit discipline
- One commit per prompt, present-tense imperative subject (`feat(providers): PX-2 …`)
- Hook-enforced trailer on every commit: `Agentically Engineered and Reviewed by Basho Parks - 2026`
- DEVLOG entry per prompt under `## 2026-07-XX — Provider Expansion Phase`
- No squashing across prompts; no push until the wrap prompt unless explicitly told earlier

### Worktree / branch
- Branch: `feat/provider-expansion` (separate git worktree if another session runs in parallel)

### Completion criteria
- All PX-0–PX-9 `[x]`, final gate green, DEVLOG phase-complete entry, CLAUDE.md Current State
  updated, README "New in" refreshed, version bumped to 0.17.0. Live smoke per
  `PX_SMOKE_PLAYBOOK.md` is the user's post-install check (keys are theirs to spend).

### Approval state
- **APPROVED 2026-07-11** by user with answers: (1) full §3 slate, (2) Anthropic via
  OpenAI-compat endpoint, (3) Layer 3 custom endpoints included, (4) base-URL overrides for
  built-ins included, (5) model-import affordance included. STS instructed same message.

---

## §1 — Prompt Roster

### **PX-0 — Baseline + live endpoint verification matrix**
- [ ] Write `PLANNING/PX_BASELINE.md`: current state (5 providers, 16 catalog models, the
      data-driven chain with file:line cites) and a per-candidate verification matrix — for each
      §3 provider: base URL, auth header, whether `/v1/models` is exposed, streaming +
      tool-calling support on the compat surface, and the **exact live model ids** (pulled via
      `/v1/models` where the user supplies a key; otherwise pinned from official docs and marked
      `unverified`). This is where exact 2026 model ids get pinned — none are hardcoded from
      memory. No code changes.
- Verify: doc exists, matrix complete for every §3 candidate, each id row marked
  `live-verified` or `unverified` with source.

### **PX-1 — Provider descriptor generalization (zero behavior change)**
- [ ] `ProviderDescriptor` gains `keyOptional?: boolean` (client uses placeholder key `'local'`
      when set and no key stored — the OpenAI SDK requires a non-empty string) and
      `keyHint?: string` (placeholder format, e.g. `sk-…`). `getClientForProvider` honors
      `keyOptional`; `settings:listProviderKeys` returns both new fields. New
      `resolveProviderDescriptor(id: string): ProviderDescriptor | null` helper (returns
      built-ins now; custom merge lands in PX-5) replaces direct `PROVIDERS[provider]` lookups
      on the dispatch + validation paths. Existing five providers byte-identical in behavior.
- Verify: tsc ×2; `registry.test.ts` green + new cases for keyless client creation and
  descriptor resolution.

### **PX-2 — Frontier tier: OpenAI, Anthropic, xAI, Mistral**
- [ ] Widen `ProviderId` (registry + `src/lib/types.ts`); add 4 `PROVIDERS` entries
      (base URLs per PX-0 matrix; Anthropic on its OpenAI-compat endpoint with limitations
      documented in the descriptor comment); add catalog models from the PX-0 matrix with
      honest capability flags (`supportsTools` empirically probed where a key exists;
      `isReasoner: false` for Anthropic-via-compat). New `provider-parity.test.ts` source-locks
      the two `ProviderId` unions against each other (SP-1 pattern) so renderer/main drift is
      impossible from this prompt forward.
- Verify: tsc ×2; `registry.test.ts`, `supports-tools-audit.test.ts`, `provider-parity.test.ts`
  green; Settings → API Keys shows 4 new cards with working docs links.

### **PX-3 — Open-source host tier: Groq, Together, Fireworks, Cerebras, Moonshot, Hugging Face**
- [ ] Same mechanical shape as PX-2 for the 6 open-source-hosting providers (§2 decision menu
      may prune). Catalog gains each host's highest-value open-weight models per the PX-0
      matrix (Llama, Qwen, Kimi, DeepSeek, gpt-oss families — exact ids from the matrix, never
      from memory). Also broaden the existing **OpenRouter** catalog with 3–5 high-value
      entries (free win — provider already wired).
- Verify: tsc ×2; same test files green; parity test still locks both unions.

### **PX-4 — Local runtimes: Ollama + LM Studio (keyless) + base-URL overrides**
- [ ] Add `ollama` (`http://127.0.0.1:11434/v1`) and `lmstudio` (`http://127.0.0.1:1234/v1`) as
      `keyOptional: true` providers. New `settings.json.providerBaseUrlOverrides:
      Record<string,string>` consulted by `getClientForProvider` (mtime-cached like
      `customModels`; client cache invalidated when an override changes) — covers LAN hosts and
      non-default ports. `ApiKeySettings` renders keyless cards as "Local — no key needed" with
      Test enabled without a stored key (`/v1/models` probe works keyless). Sanitizer allowlist
      gains `providerBaseUrlOverrides`.
- Verify: tsc ×2; `registry.test.ts` (keyless + override cases), `settings-sanitizer.test.ts`
  green; with a local Ollama running, Test succeeds with zero keys stored.

### **PX-5 — Custom endpoint providers (Layer 3, main process)**
- [ ] `settings.json.customProviders: Array<{id,label,baseURL,requiresKey?}>` — read by
      `resolveProviderDescriptor` (mtime-cached), merged into `settings:listProviderKeys`, and
      accepted by the `isProvider` gate on `saveProviderKey`/`testProviderKey`/`deleteProviderKey`
      (keychain is already string-keyed — zero keychain changes). Fix the custom-model reader at
      `registry.ts` (readCustomModelDescriptors): an unknown provider string currently coerces to
      `'deepseek'` — it now resolves against custom providers first and only then falls back.
      Rides `settings:set` (sanitizer allowlist gains `customProviders`) — **no new IPC channels**.
      Reserved-id guard: a custom id may not shadow a built-in.
- Verify: tsc ×2; new registry tests (custom provider resolution, custom model → custom
  provider dispatch descriptor, shadow-guard), `settings-sanitizer.test.ts` green.

### **PX-6 — Settings UI: grouped providers + custom-endpoint manager + model import**
- [ ] `ApiKeySettings.tsx`: 15+ cards organized into collapsible groups (Frontier /
      Open-source hosts / Local / Custom endpoints), `keyHint` as input placeholder, and a
      Custom endpoints section (add/edit/remove: id, label, base URL, requires-key toggle)
      writing through `settings:set`. `ModelSettings.tsx`: custom-model provider select lists
      every provider (built-in + custom); keyless/custom providers gain an **"Import from
      /v1/models"** button that lists live ids and adds selected ones as custom models (reuses
      the `verifyCatalog` live-id fetch + existing `model:addCustom` path).
- Verify: tsc ×2; era-chrome/source-lock tests untouched and green; manual dev-server pass:
  add a custom endpoint, import a model from it, see it in the model picker.

### **PX-7 — Catalog honesty + per-provider quirks pass**
- [ ] With every key the user supplies: run `verifyCatalog` live, correct any `missing` ids,
      and empirically probe `supportsTools` per new model (structured `tool_calls` delta or
      flag flipped false). Set `defaultMaxTokens`/`reasoningCapOnToolUse` on any new reasoner
      exhibiting the v0.15.5 empty-params failure mode. Append a per-provider quirks section
      (auth, reasoning field name, `/v1/models` support, compat-layer limitations) to
      `ARCHITECTURE/FUNCTION_CALLING.md`'s provider notes. Update the
      `lamprey-provider-and-model-reference` skill's catalog table + provenance stamp.
- Verify: tsc ×2; `supports-tools-audit.test.ts` green; verifyCatalog report saved into
  `PX_BASELINE.md` §post (honest `no-key` rows allowed where the user holds no key).

### **PX-8 — Guard tests + smoke playbook**
- [ ] Catalog invariants test: every catalog model's provider exists in `PROVIDERS`; every
      non-`keyOptional` provider has ≥1 catalog model (so `validateViaChatProbe` can't strand);
      unique model ids; non-empty label/docsUrl/baseURL per provider; `RETIRED_MODEL_MAP`
      targets exist. Write `PLANNING/PX_SMOKE_PLAYBOOK.md`: per-tier live asks (one streamed
      reply + one forced tool call per newly-keyed provider; keyless Ollama pass; one custom
      endpoint round-trip) — the user-run gate, since the keys and spend are theirs.
- Verify: tsc ×2; full new-test files green; playbook complete.

### **PX-9 — Phase wrap**
- [ ] Full gate green (vitest + build + verify:proof), DEVLOG phase-complete entry, CLAUDE.md
      Current State + architecture quick-pointers updated (provider count, new receptivity
      layers), README "New in 0.17.0" paragraph + roadmap top entry, `package.json` → 0.17.0.
      Push/Bucket only on explicit instruction.
- Verify: final phase gate (§0 item 5)

---

## §2 — Decision menu (answer at approval)

1. **Provider slate** — ship all of §3 (recommended), or prune? Each named provider is ~30
   lines of data + catalog entries; pruning saves little.
2. **Anthropic path** — OpenAI-compat endpoint (recommended; zero new protocol, honest
   limitation notes) vs. skip Anthropic vs. future native Messages adapter phase.
3. **Layer 3 custom endpoints (PX-5/6)** — include (recommended; it is the "several layers"
   multiplier and the permanent answer to every future provider) or defer to a later phase.
4. **Base-URL overrides for built-ins (PX-4)** — include (recommended; ~20 lines, unlocks LAN
   inference boxes) or restrict overrides to custom providers only.
5. **Model-import affordance (PX-6)** — include (recommended; local providers are hand-typing
   exercises without it) or defer.

## §3 — Candidate provider slate (exact ids pinned at PX-0, never from memory)

| Tier | Provider id | Base URL (verify at PX-0) | Key | Candidate model families |
|---|---|---|---|---|
| Frontier | `openai` | `https://api.openai.com/v1` | required | GPT-5.x, o-series, gpt-…-mini |
| Frontier | `anthropic` | `https://api.anthropic.com/v1/` (compat) | required | Claude Opus / Sonnet / Haiku current |
| Frontier | `xai` | `https://api.x.ai/v1` | required | Grok 4.x |
| Frontier | `mistral` | `https://api.mistral.ai/v1` | required | Mistral Large, Codestral, Devstral |
| Frontier/OSS | `moonshot` | `https://api.moonshot.ai/v1` | required | Kimi K2.x (open weights) |
| OSS host | `groq` | `https://api.groq.com/openai/v1` | required | Llama, Qwen, Kimi at high tok/s |
| OSS host | `together` | `https://api.together.xyz/v1` | required | Llama 4, Qwen, DeepSeek |
| OSS host | `fireworks` | `https://api.fireworks.ai/inference/v1` | required | Llama, Qwen, DeepSeek |
| OSS host | `cerebras` | `https://api.cerebras.ai/v1` | required | Llama, Qwen, gpt-oss |
| OSS host | `huggingface` | `https://router.huggingface.co/v1` | required | any Hub-served model |
| Local | `ollama` | `http://127.0.0.1:11434/v1` | **none** | whatever is pulled locally |
| Local | `lmstudio` | `http://127.0.0.1:1234/v1` | **none** | whatever is loaded locally |
| Custom | user-defined | user-defined | optional | anything OpenAI-compatible |

Existing five (`deepseek`, `google`, `dashscope`, `openrouter`, `zhipu`) unchanged.
