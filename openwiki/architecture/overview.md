---
type: Architecture
title: Lamprey Harness — System Overview
description: Core architecture, subsystem responsibilities, data flow, and design principles for the v0.30.0 single-agent harness.
tags: [architecture, design, core-concepts]
resource: repo://electron/main.ts
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-1d264d68dd4f756b51285ba7
    resource: repo://ARCHITECTURE/FUNCTION_CALLING.md
  - id: openwiki-source-304e54fff0b4e53c3755ff29
    resource: repo://ARCHITECTURE/TURN_CONTROL_AND_STEERING.md
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-aeb398ef7c0dd1c3a2d18c92
    resource: repo://electron/services/finalize-turn.ts
generated: {by: "openwiki/0.3.3", at: "2026-08-23T18:40:37.531Z"}
verified:
  - by: openwiki/0.3.3
    at: 2026-08-23T18:40:37.531Z
---

# Lamprey Harness — System Overview

**Version:** v0.30.0  
**Release date:** 2026-08-23  
**Author:** Basho Parks

---

## System Concept

Lamprey is a **local-first, single-agent desktop harness** that bridges your workspace and a configurable LLM provider. It persists everything locally (SQLite), secures API keys in the OS keychain, and routes requests only to services you explicitly configure. The default behavior is single-agent chat with optional loops and sub-agent orchestration disabled by default.

The **Unburdening Phase (v0.14.0)** deleted the multi-agent pipeline (Planner → Coder → Reviewer), the auto-router heuristic, and the runtime proof-gate machinery. The `multi_agent_run` tool survives for explicit multi-agent asks; the default experience is serial single-agent turns.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────┐
│  Renderer (React 19 + Zustand)                  │
│  ├─ Chat UI + input composer                    │
│  ├─ File tree, terminal, browser, git panels    │
│  └─ Artifacts, reasoning viewer, activity feed  │
└──────────────────┬──────────────────────────────┘
                   │ (IPC via contextBridge)
                   ↓
┌─────────────────────────────────────────────────┐
│  Main Process (Node.js runtime)                 │
│  ├─ IPC handlers                                │
│  │  ├─ chat:send → runHeadlessTurn              │
│  │  ├─ turn:steer / turn:queue                  │
│  │  └─ settings:*, files:*, agents:*, loops:*   │
│  ├─ Services layer                              │
│  │  ├─ Provider registry + dispatch             │
│  │  ├─ Turn runtime + settlement                │
│  │  ├─ Tool registry + validation               │
│  │  ├─ Schema normalizer                        │
│  │  ├─ MCP manager                              │
│  │  ├─ Loop controller                          │
│  │  └─ Orchestration governance                 │
│  └─ SQLite persistence                          │
│     ├─ Conversations, turns, messages           │
│     ├─ Tool calls, artifacts, annotations       │
│     ├─ Agent runs, tasks, identities            │
│     └─ Loop backlog, automations, goals         │
└─────────────────────────────────────────────────┘
```

---

## Providers and Models

**33 built-in providers:**

| Category | Providers | Notes |
|---|---|---|
| Frontier | DeepSeek, OpenAI, Anthropic, Google, xAI | Flagship models, reasoning support |
| Regional | DashScope/Alibaba, Moonshot, Zhipu | APAC specialists |
| Aggregators | OpenRouter | Live catalog import only |
| Open-Source | Hugging Face (router) | Inference API |
| Local | Ollama, LM Studio | Keyless (zero API key required) |
| Other OSS | Groq, Together, Fireworks, Cerebras, MiniMax, Cohere, Perplexity, Sarvam, Inception | Per-provider keys |

**All use OpenAI-compatible protocol** (`/v1/chat/completions`) except Google (which uses `v1beta/openai/`). Every provider has:
- A unique `ProviderId` (e.g., `'deepseek'`, `'openai'`, custom string)
- A baseURL (e.g., `https://api.deepseek.com/v1`)
- Optional key management (some support keyless access)
- A catalog of pinned models (82 total across v0.30.0)
- Per-model capabilities: context window, tool support, vision, reasoning

**Custom endpoints:** Settings → API Keys → Custom Providers. Any OpenAI-compatible endpoint becomes a first-class provider id in the dispatch path.

---

## Core Chat Flow

```
User types + sends
        ↓
ChatInput.tsx → handleSubmit
        ↓
chat-store.ts → sendMessage
        ↓
ChatInput.tsx preload IPC → chat:send
        ↓
electron/ipc/chat.ts → runHeadlessTurn
        ├─ Acquire turn runtime identity
        ├─ Build system prompt + context
        ├─ Invoke runChatRound (recursive loop)
        │  ├─ Resolve model + provider
        │  ├─ Normalize tools (schema, role-based)
        │  ├─ Call chatStream (or chatOnce for one-shot)
        │  │  ├─ Native pathway: supportsTools: true
        │  │  │  └─ Tool calls in SSE → validate args → dispatch
        │  │  └─ Fallback pathway: supportsTools: false
        │  │     └─ Text response → extract JSON → validate → dispatch
        │  ├─ Persist message + tool_calls
        │  └─ Recurse if tool calls exist
        │
        └─ finalizeTurn
           ├─ Recover pending Steer follow-ups
           ├─ Settle turn status (completed/failed/cancelled/interrupted)
           ├─ Emit settlement events
           ├─ Drain pending documents/artifacts
           └─ Dispatch next queued follow-up if completed
```

**Key invariants:**
- One running turn per conversation at a time (enforced at the runtime layer)
- Exact-once settlement (runtime removed even if DB write fails; startup recovery repairs remaining rows)
- Streaming is synchronous per round (model→tools→model→…→settled)
- Tool calls are validated before dispatch (both arguments and fallback JSON)
- Failed turns cap to `failed`; cancelled turns settle to `cancelled`; completed turns only dispatch queued follow-ups

---

## Turn Control: Steering and Queue

**While a turn is running, users can:**

1. **Steer** (Enter) — Append text to the *current* turn's draft at a safe model boundary
   - Same `turnId`, same execution, appears as a quiet pending row
   - Rejected if the turn finishes before the boundary arrives
   - Recoverable as an editable draft if rejected or interrupted
   - Never falls back to Queue

2. **Queue** (Tab) — Durable next-turn request
   - Separate from the current turn
   - Persisted to `turn_followups` table
   - Claimed and dispatched after the current turn settles
   - Can be edited, reordered, sent-now (→ converted to Steer), or deleted

**Implementation:**
- `TurnRuntimeRegistry` — One active runtime per conversation; owns turn identity, Steer inbox, abort linkage
- `FollowUpQueuePanel.tsx` — Shows pending Steer and queued items above the composer
- Exact-once delivery via `consumeRootSteersAtBoundary` (after streaming or tool completion)
- Restart recovery keeps Steer + Queue state durable; no lost messages

---

## Function Calling: Native and Fallback

**Native pathway** (`supportsTools: true` models):
- Provider returns structured `tool_calls[]` in SSE stream
- Each call has name, arguments (already an object), and call id
- Lamp validate arguments against the tool's `inputSchema`
- Dispatch directly to the tool handler
- Continue the turn with tool results

**Fallback pathway** (`supportsTools: false` models):
- Lamprey injects a contract teaching the model to respond with JSON
- `{"action":"<tool_name>","input":{...}}` for tool calls
- `{"action":"final","answer":"..."}` for final answers
- Fallback parser extracts the first balanced `{}` block from the response
- Validates the action and input against schema
- Mutating fallback calls always require explicit user approval (degraded trust)
- Native calls dispatch without approval (unless a policy disagrees)

**Schema normalization:**
Every tool has a strict `inputSchema` (JSON Schema, `type: "object"`, `additionalProperties: false`). The normalizer:
1. Strips unsupported keywords (`$ref`, `oneOf`, `anyOf`, etc.) from non-core tools
2. Fails fast if core tools have structural incompatibilities
3. Ensures all parameters are objects

---

## Turn Settlement

**finalizeTurn** is the exact-once settlement choreography:

```typescript
finalizeTurn({
  runtime: TurnRuntime,        // Active runtime for this conversation
  status: 'completed' | 'failed' | 'cancelled' | 'interrupted',
  conversationId: string,
  model?: string,
  dispatchQueue?: (input) => void  // Injected to dispatch next queued follow-up
})
```

**Settlement path:**
1. Recover any pending Steer follow-ups that didn't arrive before status finality
2. Call `turnRuntimeRegistry.settle(runtime, status)` to:
   - Remove the runtime from memory (exact-once guarantee)
   - Persist the turn and final status to `conversation_turns` table
   - Write final message row with settlement status
3. Emit `turnSettled` event for activity logging
4. Drain pending documents and artifacts (temporary in-flight objects)
5. **If status is `completed`:** Dispatch the first queued follow-up

**Error paths:**
- Pre-stream throw (before streaming starts) → status: `failed` → no message row, system note persisted
- Stream failure mid-response → status: `failed` → partial message saved with failure marker
- Tool dispatch error → status: `failed` → tool_calls persisted, error message added
- User cancel → status: `cancelled` → turn + reason persisted
- Signal (SIGTERM/window close) → status: `interrupted` → turn + reason persisted, recovery on restart

---

## Persistence Model

**SQLite at `userData/lamprey.db`** (WAL mode, foreign keys enabled):

| Table | Purpose | Key Columns |
|---|---|---|
| `conversations` | Chat sessions grouped by project | `id` (UUID), `projectId`, `createdAt`, `updatedAt` |
| `messages` | Streamed content, tool calls, reasoning | `id`, `conversationId`, `role`, `content`, `content_raw`, `tool_calls`, `reasoning_content` |
| `conversation_turns` | Turn identity + settlement | `id` (UUID), `conversationId`, `status` (completed/failed/cancelled/interrupted), `createdAt`, `settledAt` |
| `turn_followups` | Steer and Queue state | `id`, `turnId`, `conversationId`, `type` (steer/queue), `status` (validated/accepted/delivered), `input` |
| `artifacts` | Code, Mermaid, charts, tables | `id`, `conversationId`, `type`, `content`, `revisions` (immutable), `annotations` |
| `tool_calls` | Tool call audit | `id`, `messageId`, `name`, `args`, `result`, `provenance` (native/fallback) |
| `agent_runs` | Sub-agent fork execution | `id`, `conversationId`, `parentRunId`, `identityId`, `budget_tokens`, `activeMsSpent` |
| `agent_identities` | Sub-agent identity ledger | `id`, `displayName`, `createdBy`, `revokedAt` |
| `loops` | Loop state + backlog | `id`, `conversationId`, `status` (active/paused/stopped), `backlog` (JSON), `iterations`, `activeMsSpent` |
| `automation_triggers` | One-shot, schedule, event, monitor | `id`, `triggerId`, `nextRun`, `lastRun`, `status` |

**Migrations:** v1–v29 (additive only; historical schema preserved for read compatibility)

---

## Subsystem Responsibilities

| System | Responsibility | Key Files |
|---|---|---|
| **Chat Core** | Turn execution, streaming, tool dispatch | `electron/ipc/chat.ts`, `electron/ipc/chat-tool-dispatch.ts` |
| **Turn Control** | Steering, queueing, interruption | `electron/ipc/turn-control.ts`, `electron/services/turn-runtime.ts` |
| **Turn Settlement** | Exact-once finalization, status persistence | `electron/services/finalize-turn.ts`, `turnRuntimeRegistry.settle()` |
| **Providers** | Registry, model catalog, key management, dispatch | `electron/services/providers/` (registry.ts, catalog.ts, schema-normalizer.ts) |
| **Tools** | 46 native tools, schema + role subsets, validation | `electron/services/tool-*`, `electron/ipc/chat-tool-dispatch.ts` |
| **Function Calling** | Native vs fallback pathway, argument validation | `electron/services/fallback-tool-parser.ts`, `electron/services/tool-schema-validator.ts` |
| **Reasoning Audit** | CoT preservation, trace viewer | `electron/services/reasoning-*` |
| **Research** | Multi-source corroboration, artifact reports | `electron/services/research-*` |
| **RAG** | Embeddings, vector search, knowledge base | `electron/services/rag-*` |
| **Loops** | Iteration control, backlog management | `electron/services/loop-*`, `electron/services/loop-controller.ts` |
| **Orchestration** | Sub-agent identity, grants, budgets | `electron/services/orchestration-*` |
| **MCP** | Manager, resource discovery, OAuth | `electron/services/mcp-manager.ts`, `electron/services/mcp-resource-read.ts` |
| **Skills & Plugins** | Loader, manifest, runtime integration | `electron/services/skill-*`, `electron/services/plugin-*` |
| **Artifacts** | Inline rendering, edit proposals, sandbox | `electron/services/artifact-*` |
| **Persistence** | Schema, migrations, transaction safety | `electron/services/schema-init.ts`, `electron/services/conversation-store.ts` |
| **Activity** | Event audit trail, task + turn logs | `electron/services/activity-*` |

---

## Design Principles

1. **Exact-once semantics:** Turns settle exactly once; settlement is durable before the runtime is removed
2. **Honesty in failures:** Failed turns cap as `failed`; cancelled turns settle as `cancelled`; recovery is explicit
3. **No silent model decisions:** All tool approvals, permission grants, and budget violations are visible
4. **Local-first:** No telemetry, no cloud persistence, no license servers; everything SQLite + OS keychain
5. **Provider agnostic:** New providers and custom endpoints are first-class; same dispatch path for all
6. **Deterministic tool calling:** Schema validation happens before dispatch; invalid calls never reach handlers
7. **Streaming-first:** Chat returns results as they arrive; no waiting for completion
8. **Durable queue:** Steering and queued follow-ups survive restart; no lost user input

---

## Notable Deletions (Historical Record)

**Multi-agent pipeline (v0.14.0 — Unburdening Phase):**
- Planner → Coder → Reviewer sub-agent dispatch
- Auto-router heuristic for routing to single or multi
- Implicit change contracts and proof receipts
- Verification footer and proof-gate banner
- Persisted in git history at v0.13.0 tag

**Proof-gate machinery (v0.14.0):**
- Runtime proof gate (requires completion verification before unlock)
- Receipts scan and ProofGateBanner
- After-action proof section
- Settings for `proofGate`, `agentMode`, `agenticCodingComposer`
- Agent store and Agents tab

**These deletions are FINAL.** Older code that references them should be updated or removed.

---

## Testing

- **Unit tests:** `vitest run` (2334 tests across electron/services and src)
- **TypeScript check:** `npm run typecheck` (required before commit)
- **Proof gate:** `npm run verify:proof` (turn settlement contracts)
- **Full validation:** `npm run verify:all` (build + proof + smoke)

---

## Further Reading

- [domains/chat/settlement.md](../domains/chat/settlement.md) — Turn settlement lifecycle
- [architecture/turn-control.md](../architecture/turn-control.md) — Steering and Queue semantics
- [architecture/function-calling.md](../architecture/function-calling.md) — Tool dispatch details
- [CLAUDE.md](../../CLAUDE.md) — Full version history and phase documentation
- [ARCHITECTURE/](../../ARCHITECTURE/) — Specialized deep dives (persistence, MCP, orchestration)

---

Authored and reviewed by Basho Parks, copyright 2026
