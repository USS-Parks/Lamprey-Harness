---
name: lamprey-architecture-contract
description: Lamprey's load-bearing design decisions, the invariants that must hold, what was deliberately deleted, and the honestly-stated weak points. Load before modifying electron/ipc, electron/services, the provider or tool layers, or the renderer stores — or when you need to know WHY the system is shaped the way it is.
---

# Lamprey Architecture Contract

## When to use / when not

- **Use** before changing any main-process, preload, or store code; when deciding where new logic belongs; when an invariant might be at stake.
- **Don't use** for data-layer depth (see `lamprey-database-and-persistence`), provider/model specifics (see `lamprey-provider-and-model-reference`), config keys (see `lamprey-config-and-flags`), or loop internals (see `lamprey-loop-reliability-campaign`).

## TL;DR

Electron three-process app: `electron/main.ts` → `electron/ipc/*` (handlers) → `electron/services/*` (logic); `electron/preload.ts` exposes a typed `window.api`; renderer is React 19 + Zustand + Tailwind 4 in `src/`. One chat-turn seam (`runHeadlessTurn`) serves both interactive sends and headless loop iterations. Everything power-shaped is opt-in; the era default is a plain single-agent harness.

## The shape and why

**Main / preload / renderer split.** All privileged work (DB, keys, shell, providers, MCP) lives in the main process behind IPC. The preload exposes a *narrow, typed* surface (`window.api`); the renderer must guard `window.api` existence so the app doesn't crash in plain-browser dev mode. Never reach around this: no Node APIs in the renderer, no business logic in IPC handlers (they validate, delegate to services, wrap results).

**The IPC envelope invariant.** Every handler returns `{ success: true, data: T } | { success: false, error: string }`. The renderer depends on this exact shape for error handling. New channels follow it without exception.

**One turn seam.** `chat:send` → `runHeadlessTurn` → `runChatRound` (all in `electron/ipc/chat.ts`). Loops and wake-ups run *real* turns through the same seam via an injected runner (`setLoopTurnRunner`, wired at handler-registration time) — injection exists specifically to avoid a services→ipc import cycle. History: the original loop scaffold bypassed this and never ran a turn (LP-0/G1). If you add another way to trigger a turn, it goes through this seam.

**Provider registry.** `electron/services/providers/registry.ts` owns `MODEL_CATALOG` (descriptors with capability flags), `chatStream`/`chatOnce`, and `resolveModel` with a strict priority chain: catalog → `RETIRED_MODEL_MAP` → custom models from settings.json (mtime-cached) → synthetic OpenAI-compatible fallback. Behavior differences are expressed as *descriptor flags* (`supportsTools`, `supportsVision`, `isReasoner`, `defaultMaxTokens`, `reasoningCapOnToolUse`), never as `if (model === '…')` scattered through dispatch. Details: `lamprey-provider-and-model-reference`.

**Tool registry.** `electron/services/tool-registry.ts` describes every tool with **risk metadata** (`read`/`write`/`network`/`destructive`/`secret`/`sandboxBypass`) and `requiresApproval`. Approval is driven by descriptor metadata, not hard-coded server lists. Load-bearing consequences:
- Parallel execution windows only for parallelizable, approval-free, non-mutating calls.
- Plan mode blocks mutating tools regardless of approval settings (`mutates` defaults from risks).
- Fallback-parsed calls get `fb_`-prefixed ids and **skip persisted "always allow"** policies (trust degradation).
- Provider schema normalization: core tools fail fast on mismatch, non-core drop with a warning.

**System prompt discipline.** `electron/services/system-prompt-builder.ts` composes identity + a deliberately small contract + role fragments + memory/skills blocks. Prompt **bytes are measured and guard-tested** — the Lampshade→Hygiene→Unburdening arc proved over-instruction measurably degrades cheap-model output. If you grow the prompt, you re-measure and justify against the byte guards (see `lamprey-proof-and-analysis-toolkit` recipe 3).

**Context economy valves (opt-in).** Lazy tool surface (CORE set + `tool_search` unlock round-trip; auto-downgrades to full after 3 malformed searches) and the tool-result spill valve (results > 8192 chars spill to `userData/tool-results/`, model gets head+tail preview + `read_tool_result` ref; **the DB/UI keep the full result** — the asymmetry is intentional). Era defaults: `toolSurface: 'full'`, spill on.

**Persist-side hygiene.** `sanitizePseudoTags` rewrites shell-shaped pseudo-XML (`<bash>`…) into fenced markdown on every assistant `saveMessage`; the verbatim original is preserved in `messages.content_raw`. The safety net lives at persistence, not in prompt nagging (L6 decision).

**Ghost-reply guard.** Any turn failing with no visible reply row persists a `role:'system'` notice (user aborts exempt). Every failure path must settle the turn (JM-8). If you add a new failure path, it must uphold both.

**Security posture (JM-19/20, v0.16.0):** `will-navigate` guard on the top frame; `shell.openExternal` restricted to http(s); webviews denied; artifact sandbox is a `WebContentsView` (not deprecated BrowserView) with strict CSP incl. `form-action 'none'` and window-open lockdown; `files:*` IPC confined to the workspace root; stdio-MCP adds show the command and require approval; API keys via safeStorage in `keys.json` with atomic writes and plaintext-consent gating when encryption is unavailable.

## The invariants (verify before relying; each has a guard or a story)

1. IPC envelope shape — everywhere, no exceptions.
2. `loopsEnabled` gates **every** loop entry point (schedule_wakeup, fireDueWakeups, tickLoops, loop_control continue, cron automations) — source-locked by `electron/services/loop-safety.test.ts`.
3. Migrations: one transaction per migration including the version stamp; idempotent re-run; reachable from init (the v0.9.2 lesson).
4. Atomic JSON writes for keys/settings; corrupt files preserved as `.corrupt-<ts>`, never healed to `{}`.
5. Sanitizer on every assistant save; original in `content_raw`.
6. Ghost-reply guard + universal turn settlement.
7. Tool windows: parallel only when parallelizable ∧ no approval ∧ no write/destructive/secret risk.
8. `fb_` fallback provenance skips "always allow".
9. Spill asymmetry: model sees preview, DB keeps truth.
10. Settings merge `{...DEFAULT_APP_SETTINGS, ...file}`; canonical and renderer default literals locked byte-for-byte by `default-app-settings.test.ts` — change both or fail tests.
11. Retired settings keys are inert by construction (nothing reads them).
12. Capability downgrade (FC-10): 3 mismatches → session-scoped fallback mode; per-conversation state cleared on delete.
13. Era chrome: no pipeline/stage/proof jargon in the UI — locked by `src/components/chat/era-chrome.test.ts`.
14. `window.api` guarded in renderer code.
15. Reasoning is preserved end-to-end (audit phase): reasoning chunks persist with the message; past reasoning re-fed when `includePastReasoningInContext` (default true).

## What no longer exists (do not search for it, do not rebuild it)

Deleted in Unburdening (v0.14.0): the Planner→Coder→Reviewer pipeline, the auto-router + telemetry, the runtime proof gate (receipts scan, ProofGateBanner, implicit contracts), and the final-response composer. The reply is the model's reply byte-for-byte. Kept: `multi_agent_run` tool, coworker side chat, and the historical DB tables. Full inventory and rationale: `lamprey-failure-archaeology` #8. Rebuilding any of it is an era-lock exception requiring explicit user authorization (`lamprey-change-control`).

## Known weak points, stated plainly (as of v0.16.0, 2026-07-02)

- **Unsigned Windows builds** — code signing is env-gated and ready (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) but awaits an Authenticode cert (owner action). Updates verify via sha512 in `latest.yml` only.
- **Live GUI smoke of Electron 43 and a real RAG ingest under `@huggingface/transformers` 4.x** were still owner first-install checks at ship time.
- **`noUncheckedIndexedAccess` deferred** — measured at ~700 errors; a future dedicated cleanup.
- **Renderer tests run in a node environment** (no jsdom suite); renderer coverage leans on source-lock tests and smokes.
- **Coverage thresholds are regression floors** (statements 13 / branches 12 / functions 9 / lines 14 %), not quality targets.
- **Loop reliability is mechanically fixed but not yet proven live at scale** — that is the active campaign (`lamprey-loop-reliability-campaign`).

## Provenance and maintenance

Based on source reads of `electron/ipc/chat.ts`, `electron/services/{providers/registry,tool-registry,system-prompt-builder,ghost-reply-guard,tool-unlock-state,tool-result-spill,sanitize-pseudo-tags,atomic-json,loop-config}.ts`, the guard tests named above, and `ARCHITECTURE/*.md`, at v0.16.0 (2026-07-02).

Re-verify:
- Invariant guards still exist: `ls electron/services/loop-safety.test.ts electron/services/default-app-settings.test.ts src/components/chat/era-chrome.test.ts`
- Deleted modules stay deleted: `ls electron/services | grep -E "agent-pipeline|agent-router|proof-gate|final-response-composer"` (expect empty)
- Turn seam: `grep -n "setLoopTurnRunner\|runHeadlessTurn" electron/ipc/chat.ts electron/services/loop-runner.ts`
- Weak points list: re-read CLAUDE.md "honest gaps" for entries newer than 2026-07-02
