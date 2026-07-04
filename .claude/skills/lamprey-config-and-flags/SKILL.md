---
name: lamprey-config-and-flags
description: Catalog of every Lamprey configuration axis — AppSettings keys with defaults and readers, inert retired keys, keychain/keys.json, custom models, loop and timeout knobs, environment variables, per-conversation runtime state — plus the exact checklist for adding a setting without breaking the parity-lock test. Load when reading/changing settings.json, adding a setting, or wondering what a flag does or whether anything still reads it.
---

# Lamprey Config & Flags

## When to use / when not

- **Use** when adding/changing a setting, auditing what a flag does, debugging settings/keys persistence, or checking a default.
- **Don't use** for provider/model internals (see `lamprey-provider-and-model-reference`), the DB (see `lamprey-database-and-persistence`), or loop procedure (see `lamprey-loop-reliability-campaign`).

## Where config lives

| Store | Path | Writer | Notes |
|---|---|---|---|
| App settings | `%APPDATA%\Lamprey\settings.json` | `settings:set` IPC via `writeJsonAtomic` | Read = `{...DEFAULT_APP_SETTINGS, ...file}` (mtime-cached); corrupt file preserved as `settings.json.corrupt-<ts>` |
| API keys | `%APPDATA%\Lamprey\keys.json` | keychain service, atomic, mode 0o600 | Values safeStorage-encrypted (or `plain:`-prefixed after explicit consent when encryption unavailable) |
| MCP servers | `%APPDATA%\Lamprey\mcp-servers.json` | mcp-manager | Plugin connectors overlay at runtime |
| Custom models | inside settings.json (`customModels[]`) | `model:addCustom` IPC | Consulted by `resolveModel` (mtime-cached) |
| Ship pipeline | `.bucket.json`, `.aws/credentials`, `.cf/token` (repo root, gitignored) | `scripts/bucket-setup.ps1` | See `lamprey-ship-and-release` |

## AppSettings — full catalog (defaults verified against `electron/services/default-app-settings.ts`, 2026-07-02, v0.16.0)

| Key | Default | Read by | UI tab | Status |
|---|---|---|---|---|
| `theme` | `'dark'` | renderer theme engine | Appearance | era default |
| `themePreset` | `'arcgis-blue'` | theme loader | Appearance | era default |
| `themeMode` | `'dark'` | theme toggle | Appearance | era default |
| `fontSize` | `14` | renderer CSS vars | Appearance | era default |
| `defaultModel` | `'deepseek-v4-pro'` | chat init / model IPC | Models | era default |
| `sidebarCollapsed` | `false` | layout | General | era default |
| `artifactPanelWidth` | `420` | artifact panel | Appearance | era default |
| `minimizeToTray` | `false` | window close handler | General | era default |
| `autoCheckUpdates` | `true` | update checker | General | era default |
| `aiGeneratedTitles` | `false` | title generator | General | era default |
| `modelConfig` | `{}` | per-model temp/topP/maxTokens overrides | Models | era default |
| `customModels` | `[]` | `resolveModel`, `model:list` | Models | era default |
| `toolSurface` | `'full'` | chat tool dispatch (`'lazy'` enables HY2 surface) | settings.json only | era default; lazy = opt-in |
| `agenticCodingMode` | `false` | turn router + skill auto-activation | Coding Mode | opt-in |
| `agenticCodingSkills` | `['plan','context','verify']` | skill activation gate | Coding Mode | era default |
| `snipEnabled` | `true` | shell-output filter layer | Snip | era default |
| `snipVerbose` | `false` | snip activity log | Snip | opt-in |
| `safeSeedLength` | `8192` | fork/seed sizing | Seed Budget | era default |
| `includePastReasoningInContext` | `true` | chat history rehydrator | Reasoning Audit | era default |
| `loopsEnabled` | `false` | **master gate for all loop machinery** | Loops | **opt-in power extension** |
| `loopMaxIterations` | `25` | loop controller | Loops | 0 disables the ceiling |
| `loopMaxWallclockMs` | `1800000` (30 min) | loop controller (counts `active_ms`, not calendar) | Loops | 0 disables |
| `loopTokenBudget` | `500000` | loop controller | Loops | 0 disables |
| `loopMaxConcurrent` | `1` | loop controller | Loops | floor-clamped to ≥ 1 |
| `loopMinIntervalSeconds` | `30` | runaway floor | Loops | floor-clamped to ≥ 1 |
| `streamInactivityMs` | unset → 60000 | SSE watchdog (`providers/registry.ts`) | Timeouts | min clamp 5000; 0 disables |
| `mcpCallTimeoutMs` | unset → 120000 | MCP manager per-call timeout | Timeouts | min clamp 5000; 0 disables |

**Loop semantics precision** (`electron/services/loop-config.ts`, verified): `resolveLoopConfig` accepts any finite number ≥ 0 (so **0 is a valid stored value**); `maxConcurrent` and `minIntervalSeconds` are then clamped to ≥ 1 — meaning you *cannot* disable the concurrency limit or the runaway floor. The three ceilings (iterations/wallclock/token) treat 0 as "disabled" at the controller.

## Inert retired keys (harmless if present in settings.json)

`agentMode`, `agentRoster`, `proofGate`, `agenticCodingComposer` (retired UB-7), `stageBudgetMs`, `stageInactivityMs` (retired UB-6). Nothing reads them; the merge semantics pass them through silently. Do not re-add readers — that's rebuilding deleted machinery (`lamprey-failure-archaeology` #8).

## Keychain key ids

Providers: `deepseek`, `google`, `dashscope`, `openrouter`, `zhipu` (+ `google-client-id`/`google-client-secret` for OAuth). Search providers use the separate namespace `web_search:<id>` (`web_search:tavily`, `web_search:brave`, `web_search:serpapi`). IPC: `settings:saveProviderKey` / `:testProviderKey` / `:deleteProviderKey` / `:listProviderKeys`, and the `settings:*SearchProviderKey` variants. Key mutations emit audit events (action + provider + storage mode — never the key value).

## Environment variables

| Var | When | Purpose |
|---|---|---|
| `ELECTRON_EXEC_PATH` | dev | explicit Electron binary path for `electron-vite dev` (required on the primary machine) |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | release | Authenticode signing (auto-detected by electron-builder; unsigned without them) |
| `LAMPREY_GITHUB_CLIENT_ID` / `LAMPREY_GITHUB_CLIENT_SECRET` | build time | injected as literals into the main bundle for the GitHub OAuth flow; empty in forks → BYO credentials fallback |
| `ALLOW_AI_ARTIFACTS=1` | commit | deliberate bypass of the staged-diff artifact scan |
| `GIT_TERMINAL_PROMPT=0` | runtime git ops | suppress interactive auth prompts |

Only `LAMPREY_`-prefixed keys from `.env` are exposed to the main bundle (custom loader in `electron.vite.config.ts`).

## Per-conversation runtime state that acts like config (not persisted)

In `electron/services/tool-unlock-state.ts`: lazy-surface active set, unlocked-tool sets, malformed-`tool_search` counters (downgrade at `MALFORMED_SEARCH_DOWNGRADE_THRESHOLD = 3`), downgrade set. Cleared on conversation delete; reset by app restart.

## Checklist: adding a setting (the SP-1 parity lock makes half-measures fail)

1. Add key + default to `DEFAULT_APP_SETTINGS` in `electron/services/default-app-settings.ts`.
2. Mirror the default in the renderer literal in `src/stores/settings-store.ts` — `default-app-settings.test.ts` locks the two **byte-for-byte**; touching only one side fails the suite. This is deliberate (the D1 drift incident: renderer said one default, main another, main silently won).
3. Add the type to `AppSettings` in `src/lib/types.ts`.
4. Implement the reader (service or renderer). A setting nobody reads is a lie — don't land it.
5. Optional UI: add to the relevant tab component under `src/components/settings/` (tab registry in `SettingsDialog.tsx`); settings.json-only is acceptable (precedent: `toolSurface`).
6. Choose the era-faithful default (OFF for anything power-shaped — `loopsEnabled` is the template).
7. Verify: both tsc configs + `npx vitest run electron/services/default-app-settings.test.ts` + affected tests.

## Provenance and maintenance

Defaults table verified by direct read of `electron/services/default-app-settings.ts` and `electron/services/loop-config.ts` on 2026-07-02 (v0.16.0). Keychain/env/UI facts from `electron/services/keychain.ts`, `electron/ipc/settings.ts`, `electron.vite.config.ts`, `src/components/settings/SettingsDialog.tsx`.

Re-verify:
- Defaults: `sed -n '/DEFAULT_APP_SETTINGS/,/^}/p' electron/services/default-app-settings.ts`
- Parity lock: `npx vitest run electron/services/default-app-settings.test.ts`
- Loop clamps: `sed -n '/resolveLoopConfig/,/^}/p' electron/services/loop-config.ts`
- Settings tabs: `grep -n "id: '" src/components/settings/SettingsDialog.tsx`
- Timeout defaults: `grep -n "DEFAULT_STREAM_INACTIVITY_MS" electron/services/providers/registry.ts; grep -rn "120_000\|DEFAULT_MCP" electron/services/mcp-manager.ts | head -3`
