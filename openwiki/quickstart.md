---
type: Guide
title: Lamprey Harness Quickstart
description: Entry point for developers and agents. What Lamprey does, where to start, and how to navigate the documentation by change area.
tags: [getting-started, navigation, architecture]
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
generated: {by: "openwiki/0.3.3", at: "2026-08-23T18:40:37.531Z"}
verified:
  - by: openwiki/0.3.3
    at: 2026-08-23T18:40:37.531Z
---

# Lamprey Harness — Quick Start

**Version:** v0.30.0 (released 2026-08-23)  
**License:** MIT  
**Author:** Basho Parks  
**Repository:** https://github.com/USS-Parks/lamprey

---

## What Is Lamprey?

Lamprey is a local-first multi-provider desktop coding harness compatible with 33 built-in LLM providers, local runtimes, and custom OpenAI-compatible endpoints, routing requests only to configured services. Conversations and control state persist locally in SQLite; API keys store in the operating system keychain; nothing leaves your machine except requests to the providers and MCP connectors you explicitly configure.

The Opus 4.5-era product delivers **streaming chat**, **function-calling infrastructure**, **reasoning traces**, **durable Steering and Queue controls**, **optional loops and sub-agent orchestration**, **Deep Research**, **MCP servers**, **git review**, **artifacts with inline editing**, **skills and plugins**, **file trees**, a **terminal**, and a **browser panel**.

---

## 30-Second Walkthrough

1. **Download** a release for your platform (Windows/macOS/Linux)
2. **Add a provider** — paste an API key in Settings → API Keys, or enable local Ollama/LM Studio
3. **Select a model** and **start typing** — chat streams live
4. **While a turn runs:** Enter adds a line to your draft, Tab queues a follow-up, Stop cancels
5. **Tools**: The model calls shell, file, patch, search, or custom tools; you approve mutating calls
6. **Loops** and **sub-agents** are optional — leave them off for Opus 4.5-era behavior

---

## Where to Start

**Choose your task:**

| Change Area | Entry Point | Key Files | Tests |
|---|---|---|---|
| **Understanding architecture** | [architecture/overview.md](architecture/overview.md) | CLAUDE.md, AGENTS.md | N/A |
| **Chat turns & settlement** | [domains/chat/settlement.md](domains/chat/settlement.md) | `electron/ipc/chat.ts`, `electron/services/finalize-turn.ts` | `finalize-turn.test.ts` |
| **Turn control (Steer/Queue)** | [architecture/turn-control.md](architecture/turn-control.md) | `electron/ipc/turn-control.ts`, `electron/services/turn-runtime.ts` | `turn-control.test.ts` |
| **Tool calling (native + fallback)** | [architecture/function-calling.md](architecture/function-calling.md) | `electron/services/tool-registry.ts`, `electron/services/fallback-tool-parser.ts` | `tool-registry.test.ts`, `fallback-tool-parser.test.ts` |
| **Providers & model catalog** | [domains/tools/catalog.md](domains/tools/catalog.md) | `electron/services/providers/catalog.ts`, `registry.ts` | `provider-parity.test.ts` |
| **MCP connectors** | [domains/tools/mcp.md](domains/tools/mcp.md) | `electron/services/mcp-manager.ts`, `electron/services/mcp-resource-read.ts` | `mcp-manager.test.ts` |
| **Build, ship, and release** | [operations/ship-and-bucket.md](operations/ship-and-bucket.md) | `scripts/bucket.ps1`, `.github/workflows/build.yml` | `.github/workflows/` |

---

## Key Decisions

### Single-Agent Default (v0.30.0)

The **multi-agent pipeline** (Planner → Coder → Reviewer) was deleted in v0.14.0 (Unburdening Phase). The v0.30.0 default is single-agent chat. The `multi_agent_run` model tool survives for explicit multi-agent asks; use it by design, not by default.

### No Runtime Proof Gate

The proof-gate machinery (v0.9.0–v0.14.0) was deleted in v0.14.0 (Unburdening Phase). No turn is gated behind a "Verify completion" approval. Tool calls use the existing approval authority (mutating tools always re-prompt fallback models; native models dispatch directly). Settlement is honest: failed turns cap as `failed`, cancelled turns settle as `cancelled`, queued follow-ups await the current turn completion.

### Semantic Versioning

- **Major (0.30.0 → 1.0.0):** not yet released (Codex parity being evaluated)
- **Minor (0.29.0 → 0.30.0):** features, phase closures, honest gaps clarified
- **Patch (0.30.0 → 0.30.1):** P0 defect fixes

---

## Core Architecture

```
Renderer (React 19, Zustand)
    ↓ (IPC)
Main Process
    ├─ Chat handlers (electron/ipc/chat.ts)
    ├─ Turn control (electron/ipc/turn-control.ts)
    ├─ Services layer
    │  ├─ Provider registry + dispatch
    │  ├─ Tool registry + validation
    │  ├─ Turn runtime + settlement
    │  └─ MCP manager
    └─ SQLite persistence (electron/services/schema-init.ts)
```

**No preload bridge** — all IPC is typed via contextBridge in `electron/preload.ts`.

---

## Major Subsystems

| Subsystem | Purpose | Key File | Status |
|---|---|---|---|
| **Chat Core** | Stream turns, run tool calls, settle turn state | `electron/ipc/chat.ts` | Active |
| **Turn Control** | Steer (same-turn append) and Queue (durable follow-up) | `electron/ipc/turn-control.ts` | Active (v0.20.0+) |
| **Providers** | 33 built-ins + custom endpoints, model catalog, keys | `electron/services/providers/` | Active (v0.17.0+ |
| **Function Calling** | Native and fallback tool dispatch, argument validation | `electron/services/tool-*` | Active (v0.9.0+) |
| **Tool Registry** | 46 native tools, schema normalization, role-based subsets | `electron/services/tool-registry.ts` | Active |
| **Reasoning Audit** | Chain-of-thought preservation and Viewer UI | `electron/services/reasoning-*` | Active (v0.8.0+) |
| **Deep Research** | Multi-source corroboration, artifact reports | `electron/services/research-*` | Active (v0.6.0+) |
| **RAG** | Embeddings, vector search, knowledge base ingestion | `electron/services/rag-*` | Active (v0.6.0+) |
| **Loops** | Interval/self-paced/autonomous iteration | `electron/services/loop-*` | Active (v0.15.0+, OFF by default) |
| **Agentic Orchestration** | Sub-agent identity, grants, budgets | `electron/services/orchestration-*` | Active (v0.18.0+, OFF by default) |
| **MCP** | Model Context Protocol manager, resource discovery | `electron/services/mcp-*` | Active (v0.8.0+ resources v0.24.0+) |
| **Skills & Plugins** | Custom tool/model/slash-command bundles | `electron/services/skill-*`, `electron/services/plugin-*` | Active |
| **Artifacts** | Inline code/Mermaid/SVG/table rendering, edit proposals | `electron/services/artifact-*` | Active (v0.23.0+) |
| **Projects** | Conversation grouping and metadata | `electron/services/project-*` | Active (v0.9.0+) |
| **Persistence** | SQLite schema, migrations, transaction safety | `electron/services/schema-init.ts`, `electron/services/conversation-store.ts` | Active |

---

## Change Navigation

### Add a New Provider

1. **Understand:** [architecture/overview.md](architecture/overview.md) — Provider routing
2. **Catalog:** [domains/tools/catalog.md](domains/tools/catalog.md) — Model roster structure
3. **Source:** `electron/services/providers/catalog.ts` (add ModelDescriptor), `registry.ts` (add provider case)
4. **Auth:** `electron/services/keychain.ts` (optional key support)
5. **Test:** `provider-parity.test.ts` (source-lock the new entry)

### Add a New Tool

1. **Understand:** [architecture/function-calling.md](architecture/function-calling.md) — Tool schema + dispatch
2. **Schema:** Add `inputSchema` with `additionalProperties: false` to `electron/services/tool-registry.ts`
3. **Handler:** Add case in `electron/ipc/chat-tool-dispatch.ts`
4. **Approval:** (Mutating tools auto-prompt; reading tools auto-allow)
5. **Test:** Add schema + dispatch case test

### Fix a Chat Failure

1. **Entry:** [domains/chat/settlement.md](domains/chat/settlement.md) — Settlement paths
2. **Trace:** Is the turn stuck, failed, or settled incorrectly?
   - Stuck: Check `electron/services/turn-runtime.ts` and watchdog timers
   - Failed: Check error path in `electron/ipc/chat.ts` error handler
   - Wrong status: Check `finalize-turn.ts` status logic
3. **Durable state:** Check `electron/services/conversation-store.ts` message + turn row writes
4. **Test:** Add case to `finalize-turn.test.ts`

### Investigate Tool Dispatch

1. **Architecture:** [architecture/function-calling.md](architecture/function-calling.md) — Native vs fallback
2. **Provider capability:** Check `ModelDescriptor.supportsTools` in catalog
3. **Native path:** `electron/ipc/chat.ts:runChatRound()` → `chatStream()` → `onDone(toolCalls)`
4. **Fallback path:** `electron/services/fallback-tool-parser.ts` → `parseFallbackToolCalls()`
5. **Validation:** `electron/services/tool-schema-validator.ts` → `validateToolArguments()`
6. **Test:** `tool-registry.test.ts`, `fallback-tool-parser.test.ts`

### Deploy a Release

1. **Version:** Bump `package.json`, `RELEASE_NOTES/vX.Y.Z.md`
2. **Ship:** [operations/ship-and-bucket.md](operations/ship-and-bucket.md) — Bucket pipeline
3. **Command:** `pwsh scripts\bucket.ps1` (Windows orchestrator; waits for native platform CI builds and verifies final downloads)
4. **Verify:** Check `.github/workflows/build.yml` artifacts in Actions

---

## Important Concepts

**Claim vs Narrative:** Every tool call specifies its intended effect as a `claim` (what the model is trying to do) — the narrative (why) comes from context, not the tool message itself.

**Settlement:** A turn is "settled" when its final state (completed/failed/cancelled) is durable in SQLite and the runtime is removed. Settlement happens once. Steering that arrives after settlement is recovered as an editable draft.

**Steering vs Queue:** **Steer** appends to the *current* turn at a safe model boundary (same execution, same `turnId`). **Queue** is a durable next-turn request (separate IPC, separate entry via `runHeadlessTurn`). Tab vs Enter in the composer chooses the mode.

**Fallback Contract:** When a model lacks native function-calling, Lamprey injects a contract teaching it to respond with `{"action":"<tool>","input":{...}}` or `{"action":"final","answer":"..."}`. If the JSON is malformed, the fallback parser extracts the first balanced `{}` block and validates it.

**Capability Mismatch:** If a `supportsTools: true` model returns tool-like syntax but zero `tool_calls`, a mismatch counter increments. After 3 consecutive mismatches, the model downgrades to fallback mode for that conversation.

---

## Testing

```bash
# Unit tests (all platforms)
npm test

# TypeScript check (required before commit)
npm run typecheck

# Proof gate (verifies exact turn settlement contracts)
npm run verify:proof

# Full validation (build + proof + smoke tests)
npm run verify:all
```

---

## Common Questions

**Q: Where do conversations live?**  
A: `userData/lamprey.db` — a SQLite database in your operating system's app data directory. On Windows: `%APPDATA%\Lamprey`. On macOS: `~/Library/Application Support/Lamprey`. On Linux: `~/.config/Lamprey`.

**Q: How do I add a provider?**  
A: Settings → API Keys → [Provider name] → Paste your key. If the provider is not listed, add a custom endpoint in Settings → API Keys → Custom Providers.

**Q: Can I use local models (Ollama/LM Studio)?**  
A: Yes. Both are built-in and require no API key. They default to keyless mode but accept an optional custom base URL in Settings if you run them on a different machine.

**Q: What happens if I close the app during a turn?**  
A: On restart, Lamprey recovers the running turn. If it hasn't settled to a final status yet, it shows as "running" and you can choose to wait, interrupt, or resume.

**Q: Can I export conversations?**  
A: The conversation store is SQLite, so you can query it with `sqlite3 userData/lamprey.db`. Artifacts, reasoning traces, and activity records are also queryable.

---

## Further Reading

- [CLAUDE.md](../CLAUDE.md) — Detailed current state, all phases, version history
- [AGENTS.md](../AGENTS.md) — Equivalent architecture reference for Codex compatibility
- [DEVLOG.md](../DEVLOG.md) — Commit-level build history before making changes
- [ARCHITECTURE/](../ARCHITECTURE/) — Specialized deep dives (function calling, turn control, persistence, MCP, orchestration)

---

Authored and reviewed by Basho Parks, copyright 2026
