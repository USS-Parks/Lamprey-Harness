# TL_CLAUDE_CODE_INVENTORY.md — Claude Code vs Lamprey (Lane A)

**Prompt:** TL-A2 (matrix). Preamble from TL-A1. Scoreboard in TL-A3.
**Lamprey tip at pin:** `8364ba3` (`origin/main`) / working branch `feat/triple-lane` after TL-0 `2c5e4b5`
**package.json:** `0.30.1`

## Evidence pin (K2)

No product deltas until this pin exists.

| Field | Value |
|-------|-------|
| Product | Claude Code (Anthropic) |
| Pinned version | **2.1.241** |
| Release published | 2026-08-23 00:52:16 UTC (`v2.1.241` GitHub tag) |
| Evidence date | **2026-08-23** |
| Channel | Latest GitHub release of `anthropics/claude-code` (not Homebrew `claude-code` stable-lag cask) |
| What 2.1.241 itself shipped | Bug fixes and reliability only. Surface inventory uses 2.1.x docs + changelog through 2.1.241. |

### Sources (fetched 2026-08-23)

1. GitHub release: https://github.com/anthropics/claude-code/releases/tag/v2.1.241
2. Changelog (repo main): https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
3. Docs changelog: https://code.claude.com/docs/en/changelog
4. Product overview (surfaces + capabilities): https://code.claude.com/docs/en/overview
5. In-repo historical Claude/Codex toolset notes: `PLANNING/archive/CODEX_TOOLSET_PARITY_RESEARCH.md` (dated 2026-06-01; **not** the live pin)
6. CJ26 seed: `PLANNING/CJ26_FOLLOW_ON_CANDIDATES.md` row `LAMPREY_CLAUDE_CODE_REFRESH_PSPR.md`

### Honesty

- This cloud session did **not** run a local `claude --version`. The pin is the public GitHub tag + docs, not an installed binary on this VM.
- Claude Code 2.1.x is **past** Lamprey's Opus 4.5 era-lock (2025-11-24 → 2026-01-24). Lane A may *inventory* post-era surfaces. Product deltas still need High-ROI **and** Low/Med risk (K3), and must not revive Unburdening deletions or CJ26-parked items (Computer Use, Chrome-profile control, Record/Replay, remote handoff, Office/Sites).

## Status legend

| Status | Meaning |
|--------|---------|
| retained | Lamprey has an equivalent that still matches the Claude Code idea |
| narrowed | Lamprey has a smaller/era-locked slice of the same idea |
| stale | A June/historical claim no longer describes Claude Code 2.1.241 or Lamprey tip |
| missing | Claude Code has it; Lamprey does not (may still be a non-goal) |

Lamprey comparators are source-checked at tip `8364ba3` plus this branch's docs-only TL-0/A1 commits. No product code in Lane A yet.

## Matrix

### Tools (native)

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| Read / Write / Edit files | `read_file` / `write_file` / `apply_patch` native tools | retained |
| Bash / shell | `shell_command` + Snip filters + approval | retained |
| Glob / Grep | native glob + grep tools | retained |
| Notebook edit | not a first-class native; files go through read/write | narrowed |
| WebFetch / WebSearch | search cascade + fetch via web tools / MCP | narrowed |
| Task / subagent spawn | `multi_agent_run` + orchestration (opt-in, OFF default) | narrowed |
| AskUserQuestion | `ask_user_question` + AskUserModal | retained |
| LSP / IDE diagnostics | no first-class LSP client in core | missing |
| Computer Use / Chrome live-debug | Browser Developer Mode (opt-in CDP, OFF default). Full Computer Use + profile takeover parked (CJ26) | narrowed |
| Voice dictation `/voice` | none | missing |
| Screenshot / image paste | attachments + vision on capable models | narrowed |

### MCP / connectors

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| stdio + SSE + Streamable HTTP MCP | `mcp-manager.ts` all three | retained |
| MCP resources / templates / read | v0.24.0 resource tools + spill | retained |
| OAuth / PKCE for HTTP MCP | v0.24.0 authenticated sessions | retained |
| MCP elicitation / forms | URL elicitation gated; no fullscreen TUI elicitation forms | narrowed |
| `headersHelper` / project `.mcp.json` trust dialog | add-connector approval; not CC's headersHelper command | narrowed |
| Curated connector catalog | ten templates (v0.30.1 Tools+MCP Roster) | retained |
| Claude.ai-synced plugins `name@synced` | local plugins only | missing |

### Skills / plugins / hooks / commands

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| `SKILL.md` skills + Customize panel | skills column, wizard, import from Claude Code | retained |
| Skill hot-reload | `skill-loader.ts` chokidar | retained |
| Skill `context: fork` / frontmatter hooks | skills have allowedTools/model/autoInvoke; no CC fork-context field | narrowed |
| Slash commands | slash parser + plugin-contributed commands | retained |
| Plugins packaging skills+hooks+MCP | plugin manifest + loader + 3 starters | retained |
| Plugin marketplaces / `headersHelper` | bundled catalog + directory/paste install; no live marketplace HTTP helper | narrowed |
| Hooks (PreToolUse / PostToolUse) | `hooks-runner.ts` + Hooks settings | retained |
| CLAUDE.md / auto memory | project conventions in system prompt + `#` memory shortcut; no CC auto-memory store | narrowed |

### Projects / worktrees / git

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| Project home + sessions | Project Section (v0.9.x) | retained |
| Git worktrees / isolation | worktree runner under orchestration | narrowed |
| PR review / gh | PR Chat milestone v0.23.0 | retained |
| GitHub Actions / GitLab CI first-party | not a Lamprey product surface | missing |
| `/resume` session picker across dirs | conversation list + fork-at-turn | narrowed |

### Permissions / sandbox

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| Per-tool approval prompts | permissions-store + approval chips | retained |
| Plan mode blocks mutation | plan mode + mutating-tool gate | retained |
| Sandbox (Linux bubblewrap / macOS seatbelt) | workspace-root `files:*` + approval; not OS sandbox | narrowed |
| Auto-mode classifier for risky bash | no classifier; mutating/fallback still re-prompt (K10) | missing |
| Organization / managed settings | none (single-owner desktop) | missing |

### UX micro-interactions

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| ESC cancel / ↑ history | Fluidity J1 | retained |
| Shift+Tab mode cycle | Fluidity J2 | retained |
| @file mention | Fluidity J3 | retained |
| `#` memory | Fluidity J4 | retained |
| Inline approval chips | Fluidity J5 | retained |
| Tool-card auto-collapse | Fluidity J6 | retained |
| path:line autolink | Fluidity J10 | retained |
| Fullscreen TUI renderer | Electron GUI already; TUI N/A | stale |
| Vim / readline keybinding flavors | chat input is a normal textarea | missing |
| Queue + Steering mid-turn | v0.20.0 Steering + Queue | retained |

### Status line / cost / usage

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| Status line context % | Fluidity J8 `StatusLine` | retained |
| `/cost` + `--max-budget-usd` + residency premium | no CC-style spend HUD; orchestration token budgets exist | narrowed |
| Usage-limit / weekly reset copy | provider HTTP errors surface as chat errors | narrowed |

### Plan mode / workflows / loops

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| Plan mode + `/plan` + plan subagent | plan store + Plan tool panel; no dedicated plan subagent (Unburdening deleted always-on pipeline) | narrowed |
| `/loop` in-session polling | Loop phase v0.15 (opt-in, OFF default) | retained |
| Cloud Routines / Desktop scheduled tasks | Automations + operational goals v0.26 (local) | narrowed |
| `/teleport` / Remote Control / web/mobile | parked (CJ26 remote-handoff candidate) | missing |
| Cross-session `SendMessage` / `ListAgents` | task/thread graph v0.21; not CC cross-machine messaging | narrowed |
| Agent SDK / self-hosted runner | not a Lamprey product | missing |

### Surfaces (distribution)

| Claude Code 2.1.241 surface | Lamprey tip | Status |
|-----------------------------|-------------|--------|
| Terminal CLI | Electron desktop app (this repo) | narrowed |
| VS Code / JetBrains extensions | none | missing |
| Desktop app (Claude) | Lamprey *is* a desktop app, different product | stale |
| claude.ai/code web + mobile | none; parked remote | missing |
| Slack `@Claude` | Slack is an MCP template, not hosted bot | narrowed |

### Historical June claims (adjudication seed)

| June-era claim | Adjudication at 2.1.241 / Lamprey 0.30.1 |
|----------------|------------------------------------------|
| "Claude Code is CLI-only" | **stale** — docs now list CLI, IDE, Desktop, Web |
| "Parity target is Opus 4.5-era Claude Code" | **retained** as Lamprey era-lock; 2.1.x extras are opt-in inventory only |
| "Always-on Planner→Coder→Reviewer matches Claude Code" | **stale** — Unburdening deleted it; CC uses on-demand subagents + plan mode |
| "MCP is the whole connector story" | **narrowed** — CC now wraps MCP inside plugins + synced marketplace |

## Gaps that are explicit non-goals (do not score as Lane A deltas)

Computer Use / Chrome-profile control, Record/Replay, remote handoff / teleport, Office/Sites plugins, VS Code/JetBrains extensions, Agent SDK, cloud routines, voice, org managed-settings. See K-register + CJ26 parked rows.

## TL-A3 scoreboard (K3 / K12)

Score only **missing** or **stale** rows that could become product work. ROI = value to a Lamprey coding session. Risk = era-lock, Unburdening, K10 approvals, or new privileged surface.

| Candidate (from matrix) | ROI | Risk | Why it does not make the pick list |
|-------------------------|-----|------|------------------------------------|
| LSP / IDE diagnostics | M | M | Grep/read already cover the loop; an LSP client is a new subsystem, not a High-ROI snip. |
| Voice dictation | L | M | Niche; new I/O surface. |
| Claude.ai-synced plugins | L | H | Cloud identity + override rules. |
| GitHub Actions / GitLab CI product | L | M | Not a desktop-harness job. |
| Auto-mode bash classifier | M | H | Would skip or soften K10 approval/snip/gates. |
| Org managed settings | L | M | Single-owner app. |
| Vim / readline input flavors | L | L | Textarea is enough in a GUI. |
| `/teleport` / Remote Control | M | H | CJ26 parked remote-handoff. |
| Agent SDK / self-hosted runner | L | H | Different product. |
| VS Code / JetBrains extensions | M | H | Separate distribution; not this Electron app. |
| claude.ai/code web + mobile | M | H | CJ26 parked. |
| Fullscreen TUI renderer (stale) | L | L | Not a gap — Lamprey is already a GUI. |
| Always-on Planner→Coder→Reviewer (stale) | — | H | Unburdening deletion; must not return. |

Narrowed-but-present rows (plan mode, MCP elicitation, `/cost` HUD, notebook edit, skill `context: fork`) are already covered enough that copying Claude Code 2.1.x would be polish, not High ROI.

### Pick list

**Empty.** No High-ROI + Low/Med-risk deltas. Lane A closes inventory-only under **K12**.

TL-A4 … TL-A8 are N/A (DEVLOG-only commits).

### Wont table (K12)

| Wont | Reason |
|------|--------|
| All scored missing/stale rows above | Fail K3 (ROI not High, or risk High, or parked/Unburdening). |
| Any Unburdening pipeline revival | Plan non-goal. |
| Plugin-native tool runtime | K10 — local tools stay on approval/snip/gates. |
| Unsloth training UI | K6 (Lane C). |

Authored and reviewed by Basho Parks, copyright 2026

