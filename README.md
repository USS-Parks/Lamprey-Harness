# Lamprey

<p align="center">
  <img src="ASSETS/LAMPREY%20MAI%20LOGO%20FINAL.png" alt="Lamprey" width="220" />
</p>

<p align="center">
  <a href="https://github.com/USS-Parks/lamprey/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/USS-Parks/lamprey?style=flat-square&color=2ea44f" /></a>
  <a href="https://github.com/USS-Parks/lamprey/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" /></a>
  <img alt="Platform: Windows · macOS · Linux" src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-0078d4?style=flat-square" />
  <img alt="Electron 35" src="https://img.shields.io/badge/electron-35-47848F?style=flat-square" />
</p>

---

Lamprey is the transmission for the open-source LLM engine of your choice. It's a desktop coding IDE that grafts Claude Desktop-quality UX onto a Codex-style developer toolset: streaming markdown, reasoning blocks, skills, MCP servers, autonomous loops, sub-agent orchestration, and session memory welded directly onto a file tree, multi-tab Chromium browser, git diff review, integrated terminal, Brave search engine, and side-thread conversations. Plug in DeepSeek, Gemma, Qwen, GLM, or anything on OpenRouter. When the next breakthrough model drops, swap the key and the harness will adapt. Everything stays local, everything persists in SQLite, and API keys never leave the OS keychain. No Token Overlords watching your prompts for the next chance to roach your bank account.

The target user is the developer who looked at Claude Code and Codex and said *"I want exactly this, but I'm not paying predatorial prices."* Lamprey is a bring-your-own-keys alternative to the two most capable agentic coding tools on the market, built for people who want the power without the leash. It's ready for next-gen models out of the box, as the harness evolves naturally with the ecosystem. 100% vibe-coded over nearly 300 sessions in Claude Code and Codex using WhisprFlow.

---

## Download

| Platform | Format | Link |
|---|---|---|
| **Windows** x64 | Installer | [Lamprey-x64.exe](https://github.com/USS-Parks/lamprey/releases/download/v0.18.0/Lamprey-x64.exe) |
| **Windows** x64 | Portable ZIP | [Lamprey-x64.zip](https://github.com/USS-Parks/lamprey/releases/download/v0.18.0/Lamprey-x64.zip) |
| **macOS** Apple Silicon | DMG | [Lamprey-arm64.dmg](https://github.com/USS-Parks/lamprey/releases/download/v0.18.0/Lamprey-arm64.dmg) |
| **Linux** x64 | AppImage | [Lamprey-x86_64.AppImage](https://github.com/USS-Parks/lamprey/releases/download/v0.18.0/Lamprey-x86_64.AppImage) |

> **macOS note:** The DMG is unsigned. On first launch, right-click the app &rarr; Open &rarr; Open to bypass Gatekeeper.
> **Linux note:** `chmod +x Lamprey-x64.AppImage` then run it.
All releases: [github.com/USS-Parks/lamprey/releases](https://github.com/USS-Parks/lamprey/releases)

**New in v0.18.0 — the Agentic Orchestration release.** A light local orchestration layer, **off by default**. Turn it on in Settings → Orchestration and sub-agents get their own **identity** — you approve or refuse each tool it asks for, and that grant is enforced at dispatch, not in a prompt a model can be talked out of. Every orchestrated run is **metered against a budget** (tokens, active wall-clock, candidates, fork depth) enforced outside the model, with per-agent spend receipts and an honest abort when a ceiling is crossed. Three composition strategies compose the seventeen providers into search: **fan-out + judge** (`agent_fanout` / `/fanout`) runs competing candidates — a cheap local generator against a frontier judge — and picks the winner; **generator + adversarial critic** (`agent_critique` / `/critique`) drafts, breaks, and revises to a hard cap with a critic that's read-only by construction; **advisor escalation** (`agent_advisor`) lets a stuck agent ask a smarter model one bounded question. `/outcome "<goal>" --tokens 200k --strategy fanout` is the whole thing as one line. A right-panel **Agents** pill inventories every identity — grants, live spend, and a revoke/kill switch that aborts the whole fork tree. Everything runs on your machine; nothing leaves it. The always-on multi-agent pipeline that was deleted in v0.14.0 stays deleted — this never fans out a plain turn on its own.

<details><summary>Previously in v0.17.0 — the Provider Expansion release</summary>
 Lamprey's connector surface grows from five providers to **seventeen built-ins plus unlimited bring-your-own endpoints**: the frontier labs (OpenAI GPT-5.6, Anthropic Claude via its official OpenAI-compat layer, xAI Grok, Mistral, Moonshot Kimi) and the open-source hosts (Groq, Together, Fireworks, Cerebras, Hugging Face's provider router) join DeepSeek, Google, DashScope, OpenRouter, and Zhipu. **Ollama and LM Studio** run keyless out of the box, with settings-level base-URL overrides for LAN inference boxes, and any other OpenAI-compatible endpoint — vLLM, llama.cpp, a LiteLLM proxy — can be added as a first-class provider from Settings with zero code. A per-provider **"Import from /v1/models"** pulls live model lists straight into the picker, key cards are grouped by tier with format hints, and every catalog id ships with its verification evidence documented (nothing is labeled verified that wasn't checked live). 39 built-in catalog models and counting.

<details><summary>Previously in v0.16.0 — the July 2026 Maintenance release</summary>
 A full-repo audit (~90 findings across six domains) fixed stem to stern: (1) the **Loop feature** now works as designed and its safety rails actually hold &mdash; the iteration prompt reaches the model, the master toggle gates every entry point, and ceilings count real work; (2) **chat-core correctness** &mdash; hanging turns, retry corruption, dead fallback tool paths, and custom-model integration all fixed; (3) **data durability** &mdash; atomic settings/keys writes, scoped fallback latches, RAG vector-leak fix, transactional writes, audit-table retention; (4) **security hardening** &mdash; navigation guard, openExternal scheme filter, debug-trace removal, workspace file confinement, MCP spawn approval; (5) **renderer correctness + performance** &mdash; streaming-switch fixes, approval queueing, memoized transcript rendering; (6) **currency** &mdash; Electron 35 &rarr; 43, the embedder migrated off `@xenova/transformers`, and `npm audit` now reports **0 vulnerabilities** (was 1 critical / 4 high). Every commit is hook-verified under the new human-in-the-loop commit discipline.
</details>
</details>

---

## Quick start

1. **Download** your platform's installer above and run it.
2. **Get a key — any one provider is enough to start.** DeepSeek
   ([platform.deepseek.com](https://platform.deepseek.com)) and OpenRouter's free
   Gemma tier ([openrouter.ai](https://openrouter.ai/google/gemma-4-31b-it:free#api))
   are the cheapest doors in; OpenAI, Anthropic, xAI, Mistral, Kimi, Groq,
   Together, Fireworks, Cerebras, Hugging Face, Qwen, and GLM cards all live in
   Settings &rarr; API Keys with a "Get a key" link and format hint on each.
3. **Or skip keys entirely** — a local [Ollama](https://ollama.com/download) or
   LM Studio is detected keylessly, and any other OpenAI-compatible endpoint can
   be added under Settings &rarr; API Keys &rarr; Custom endpoints.
4. **Paste your key** in the first-run modal. It's encrypted with the OS keychain via Electron `safeStorage`.
5. **Type something.** Let's go.

---

## What you get

- **Multi-provider chat** &mdash; seventeen built-in providers (frontier labs, open-source hosts, keyless local runtimes) plus unlimited custom OpenAI-compatible endpoints. Pick a model per task: cheap for boilerplate, smart for hard bugs, local for air-gapped.
- **Codex-style developer panes** &mdash; file tree (`Ctrl+P`), multi-tab browser (`Ctrl+T`), git diff review with "Fix this" per-hunk seeding (`Ctrl+Shift+G`), shell terminal (`` Ctrl+` ``), side-thread chat.
- **Deep Research** &mdash; research-shaped turns fan out across search providers, corroborate claims by independent domain, and kill the report if they detect fabricated citations. `/research <q>` forces it; coding turns are never escalated.
- **Snip** &mdash; an in-process token filter (same idea as [rtk](https://github.com/rtk-ai/rtk)) that strips noisy shell output down to signal before it hits the model context. ~120 built-in YAML filters, hot-reloadable, extensible.
- **Skills + MCP** &mdash; drop a `.md` in your skills directory and it's part of the system prompt. MCP servers via SSE + stdio with Google OAuth support out of the box.
- **Loops** &mdash; set a task on a fixed interval (`/loop 5m <task>`), let the model pace itself (`/loop <task>`), or hand it a mission and a backlog (`/loop --auto <mission>`) and walk away. The model enqueues work, records outcomes, and self-terminates when the mission is complete. Hard ceilings on iterations, wall-clock, and token budget keep it from running away. Off by default &mdash; flip one toggle in Settings to unlock.
- **Sub-agents** &mdash; the model can fan out parallel sub-agents via `multi_agent_run` when the task calls for it. You don't configure this; the model decides when to orchestrate and when to stay single-threaded.
- **Plan mode** &mdash; `Shift+Tab` blocks mutating tools while read-only tools keep working. Approve, reject, or edit the plan in-place.
- **Worktrees, forking, hooks, cron automations, AGENTS.md injection, conversation seeding, reasoning trace viewer, optional SQLCipher encryption** &mdash; see [DEVLOG.md](DEVLOG.md) for the full build history.

---

## Build from source

```bash
git clone https://github.com/USS-Parks/lamprey
cd lamprey
npm install
npm run dev
```

Distributables: `npm run build:win` / `npm run build:linux` / `npm run build:mac`.
Requirements: Node.js 22+, npm 10+, git.

---

## Architecture

```
Renderer (React 19 + Zustand)
  Sidebar | Chat | Right panel (Tools / Artifacts / Home)
       |
       |  window.api (typed contextBridge)
       v
Main process (Node.js)
  Provider registry -> DeepSeek / Google / DashScope / OpenRouter
  MCP manager (SSE + stdio + OAuth)
  better-sqlite3 (WAL, foreign keys)
  Browser manager (WebContentsView per tab)
  Git runner + review/worktree IPC
  Skill loader (chokidar hot reload)
  Keychain (safeStorage)
```

Renderer is sandboxed (`contextIsolation`, no `nodeIntegration`). Keys and OAuth tokens never cross the IPC boundary. Artifacts and browser tabs run in isolated Chromium processes.

---

## Security

- API keys encrypted via Electron `safeStorage` (OS keychain).
- Renderer: sandbox + context isolation + no node integration.
- Artifact sandbox blocks all outbound network and runs in its own process.
- No telemetry. No phone-home. Run it air-gapped if you want.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome at [github.com/USS-Parks/lamprey/issues](https://github.com/USS-Parks/lamprey/issues). Every change lands through a pull request with a human review and sign-off before merge &mdash; see the [Review and sign-off](CONTRIBUTING.md#review-and-sign-off) policy.

## Author

Authored and maintained by Basho Parks.

## License

MIT &mdash; see [LICENSE](LICENSE).

© 2026 Basho Parks
