# Lamprey

<p align="center">
  <img src="ASSETS/LAMPREY%20MAI%20LOGO%20FINAL.png" alt="Lamprey" width="220" />
</p>

<p align="center">
  <a href="https://github.com/USS-Parks/Lamprey-Harness/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/USS-Parks/Lamprey-Harness?style=flat-square&color=2ea44f" /></a>
  <a href="https://github.com/USS-Parks/Lamprey-Harness/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" /></a>
  <img alt="Platform: Windows · macOS · Linux" src="https://img.shields.io/badge/platform-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-0078d4?style=flat-square" />
  <img alt="Electron 43" src="https://img.shields.io/badge/electron-43-47848F?style=flat-square" />
</p>

---

Lamprey is a local-first desktop coding harness for the model provider you already use. It combines a Codex-style workspace with streaming chat, reasoning traces, skills, MCP servers, research, durable queues, optional loops and sub-agent orchestration, a file tree, browser, git review, and terminal. Seventeen providers are built in, local Ollama and LM Studio work without keys, and custom OpenAI-compatible endpoints can be added from Settings.

Conversations and control state live in SQLite on your machine. API keys stay in the operating-system keychain. Lamprey sends requests only to the providers and connectors you configure.

---

## Download

| Platform                | Format       | Link                                                                                                                      |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Windows** x64         | Installer    | [Lamprey-x64.exe](https://github.com/USS-Parks/Lamprey-Harness/releases/download/v0.26.0/Lamprey-x64.exe)                 |
| **Windows** x64         | Portable ZIP | [Lamprey-x64.zip](https://github.com/USS-Parks/Lamprey-Harness/releases/download/v0.26.0/Lamprey-x64.zip)                 |
| **macOS** Apple Silicon | DMG          | [Lamprey-arm64.dmg](https://github.com/USS-Parks/Lamprey-Harness/releases/download/v0.26.0/Lamprey-arm64.dmg)             |
| **Linux** x64           | AppImage     | [Lamprey-x86_64.AppImage](https://github.com/USS-Parks/Lamprey-Harness/releases/download/v0.26.0/Lamprey-x86_64.AppImage) |

> **macOS note:** The DMG is unsigned. On first launch, right-click the app &rarr; Open &rarr; Open to bypass Gatekeeper.
> **Linux note:** `chmod +x Lamprey-x86_64.AppImage` then run it.
> All releases: [github.com/USS-Parks/Lamprey-Harness/releases](https://github.com/USS-Parks/Lamprey-Harness/releases)

**New in v0.26.0 — Automations and Operational Goals.** Local reminders,
schedules, events, and monitors now have model-callable management, durable trigger identity,
bounded retries, and explicit next-run/blocked/completed UI. Goals persist lifecycle,
provenance, budgets, elapsed time, blockers, and completion evidence; one goal may own a
bounded loop that an automation wakes through the existing controller. Recurring autonomy
remains OFF by default, and narrower ceilings can only tighten global policy. The owner
packaged-app background/restart playbook is still open, so this release claims implementation
completion without claiming live background/restart parity.

**Previously in v0.25.0 — Browser Developer Mode.** The existing Browser panel gained
bounded, redacted console/network observation, structured inspection, fixed runtime probes,
short traces, and annotated screenshot evidence behind an OFF-by-default exact-origin trust
gate. The owner packaged-app playbook remains open.

**New in v0.24.0 — MCP resources and hosted sessions.** Connected MCP servers can expose paginated resources and URI templates to the model and to Customize → Connectors. Resource reads retain server provenance and use the existing large-result spill valve. Hosted Streamable HTTP connectors can use OAuth 2.1 with PKCE, encrypted keychain storage, explicit domain confirmation, reauthorization, expiry/reconnect state, and consent-gated URL elicitation. Preview renders text as text, allows only known raster image formats, and leaves SVG or other blobs as metadata. The local fixture and real hosted-provider playbooks remain open, so this release claims implementation completion without claiming live hosted-provider parity.

**New in v0.23.0 — PR Chat and patch review.** Open a pull request in the existing panel and bring the exact review context into the conversation, down to one selected hunk. Lamprey can inspect files, checks, and comments; draft a review; or prepare an editable patch. Nothing posts or touches the workspace silently: GitHub writes show their exact target and wait for approval, while patch acceptance rechecks the head SHA and restores affected files if application fails. The disposable-repository GUI playbook is still open, so this release claims implementation completion rather than blanket current-Codex parity.

**Also in v0.23.0 — visualizations and direct artifact editing.** Mermaid, chart, table, and validated SVG artifacts render as first-class inline cards with visible text alternatives; interactive HTML/JSX/React opens only in Lamprey's isolated artifact sandbox. Artifact identity and immutable revisions survive transcript cleanup. Select exact Markdown, code, or artifact ranges, ask Lamprey for a non-destructive proposal, preview the replacement, accept or reject it, and attach durable actor-attributed annotations. Activity reports visualization, edit, and open outcomes without false-success states. The packaged owner GUI playbook remains open.

**Previously in v0.21.0 — task and thread control.** Activity now presents one canonical graph across conversations, historical forks, agent runs, identities, and turns. Users and models can inspect or wait on tasks, send durable Queue messages, steer or interrupt an exact active turn, fork history at a completed turn, and manage recoverable task metadata. Parent/child links, live status, unread counts, waits, lifecycle actions, and two-step permanent deletion are discoverable without replacing the existing chat, agent, or permission paths. The packaged owner GUI playbook remains open, so this release claims M2 implementation completion rather than blanket current-Codex parity.

**Previously in v0.20.0 — Steering and Queue.** Keep typing while a turn runs, then choose a real Steer or Queue button when the draft is ready. Enter adds a line to the running-turn draft instead of submitting it, and Tab follows normal keyboard focus. Accepted Steering appears as a quiet pending row above the composer, while Stop remains a separate 36-pixel control. Queue items can be edited, reordered, sent now, or deleted, and survive restart. Exact turn IDs, idempotent client IDs, visible rejection reasons, metadata-safe audit events, and one `runHeadlessTurn` execution seam keep races and recovery honest. The complete automated 20-row contract gate passes. The paired Codex/Lamprey desktop replay remains an owner-run conformance check, so this release does not make a blanket current-Codex parity claim.

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
- **Steering + Queue** &mdash; redirect a running turn without restarting it, or line up the next turn. Follow-ups are durable, identity-guarded, and visible above the composer.
- **Task controls** &mdash; inspect parent/child tasks and live turns, wait without polling, send Queue or exact-turn Steering, fork at a historical turn, and manage task lifecycle from Activity or model tools.
- **Inline visualizations + artifact editing** &mdash; render safe Mermaid/chart/table/SVG previews in chat, isolate interactive artifacts, select exact source ranges, preview model or direct edits, accept/reject immutable revisions, annotate, open, and export.
- **PR Chat + patch review** &mdash; bind an exact GitHub PR to chat, inspect bounded diffs/checks/comments, draft approval-gated reviews, and preview/edit/accept/reject SHA-pinned patches with rollback.
- **Codex-style developer panes** &mdash; file tree (`Ctrl+P`), multi-tab browser (`Ctrl+T`), git diff review with "Fix this" per-hunk seeding (`Ctrl+Shift+G`), shell terminal (`` Ctrl+` ``), side-thread chat.
- **Browser Developer Mode** &mdash; optional CDP console/network, structured page inspection,
  short traces, and annotated screenshot evidence behind an exact-origin trust gate. It is
  off by default and does not expose arbitrary page-world code execution.
- **Automations + operational goals** &mdash; create reminders, schedules, event triggers, and
  monitors with durable retry/dedup state; track goal lifecycle and budgets; optionally wake
  a goal-owned bounded loop through the existing controller. Recurring autonomy is off by
  default.
- **Deep Research** &mdash; research-shaped turns fan out across search providers, corroborate claims by independent domain, and kill the report if they detect fabricated citations. `/research <q>` forces it; coding turns are never escalated.
- **Snip** &mdash; an in-process token filter (same idea as [rtk](https://github.com/rtk-ai/rtk)) that strips noisy shell output down to signal before it hits the model context. ~120 built-in YAML filters, hot-reloadable, extensible.
- **Skills + MCP** &mdash; drop a `.md` in your skills directory and it's part of the system prompt. MCP servers use stdio, SSE, or Streamable HTTP; resource/template browsing and strict lazy resource tools are built in, with legacy Google OAuth plus generic hosted OAuth 2.1 session support.
- **Loops** &mdash; set a task on a fixed interval (`/loop 5m <task>`), let the model pace itself (`/loop <task>`), or hand it a mission and a backlog (`/loop --auto <mission>`) and walk away. The model enqueues work, records outcomes, and self-terminates when the mission is complete. Hard ceilings on iterations, wall-clock, and token budget keep it from running away. Off by default &mdash; flip one toggle in Settings to unlock.
- **Sub-agents** &mdash; the model can fan out parallel sub-agents via `multi_agent_run` when the task calls for it. You don't configure this; the model decides when to orchestrate and when to stay single-threaded.
- **Plan mode** &mdash; `Shift+Tab` blocks mutating tools while read-only tools keep working. Approve, reject, or edit the plan in-place.
- **Worktrees, forking, hooks, cron automations, AGENTS.md injection, conversation seeding, reasoning trace viewer, optional SQLCipher encryption** &mdash; see [DEVLOG.md](DEVLOG.md) for the full build history.

---

## Build from source

```bash
git clone https://github.com/USS-Parks/Lamprey-Harness
cd Lamprey-Harness
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
  Provider registry -> 17 built-ins + custom OpenAI-compatible endpoints
  Turn runtime -> Steering inbox / durable Queue / interrupt settlement
  MCP manager (stdio + SSE + Streamable HTTP + resources + OAuth sessions)
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

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs are welcome at [github.com/USS-Parks/Lamprey-Harness/issues](https://github.com/USS-Parks/Lamprey-Harness/issues). External contributions land through a pull request with human review and sign-off before merge.

## Author

Authored and maintained by Basho Parks.

## License

MIT &mdash; see [LICENSE](LICENSE).

Authored and reviewed by Basho Parks, copyright 2026
