---
name: lamprey-build-and-env
description: Recreate the Lamprey dev environment from scratch and get past its known traps — Node/Electron/better-sqlite3 ABI story, the ELECTRON_EXEC_PATH dev-server workaround, esbuild antivirus blocks, the tsconfig node/web split, electron-vite and electron-builder specifics. Load when setting up a machine, when npm install / dev server / build fails, or before touching build configuration.
---

# Lamprey Build & Environment

## When to use / when not

- **Use** for machine setup, `npm install`/dev-server/build failures, or changes to `electron.vite.config.ts` / `electron-builder.yml` / tsconfigs.
- **Don't use** for releasing (see `lamprey-ship-and-release`), test-suite mechanics (see `lamprey-validation-and-qa`), or runtime debugging (see `lamprey-debugging-playbook`).

## Prerequisites

- **Node ≥ 22** (enforced via `engines` in package.json), npm 10+, git.
- Windows is the primary dev platform; PowerShell 7 (`pwsh`) is required for the ship scripts; Git Bash works for POSIX-style commands.
- No global native toolchain needed — better-sqlite3 ships prebuilds; `electron-rebuild` handles the Electron ABI.

## From-scratch checklist (expected output at each step)

```bash
git clone https://github.com/USS-Parks/lamprey.git && cd lamprey
npm install          # postinstall runs: electron-rebuild -f -w better-sqlite3
npm run hooks:install  # git config core.hooksPath scripts/hooks
npx tsc --noEmit -p tsconfig.node.json   # expect: clean, exit 0
npx tsc --noEmit -p tsconfig.web.json    # expect: clean, exit 0
npm test             # expect (v0.16.0 baseline): 2334 passed / 130 skipped / 0 failed
npm run build        # electron-vite build → out/{main,preload,renderer}
npm run smoke:bundle && npm run smoke:renderer   # expect: both exit 0
```

Dev server (**the one command that needs the workaround**):

```bash
ELECTRON_EXEC_PATH="$(pwd)/node_modules/electron/dist/electron.exe" npx electron-vite dev
```

PowerShell equivalent: `$env:ELECTRON_EXEC_PATH="$PWD\node_modules\electron\dist\electron.exe"; npx electron-vite dev`.

Without it, on the primary machine `npm run dev` **exits immediately with no useful error**. On macOS/Linux the binary is `node_modules/electron/dist/electron` (no `.exe`). Documented in CONTRIBUTING.md.

If any step deviates → `lamprey-debugging-playbook` (bottom rows of the triage table).

## The tsconfig split (both must always pass)

| Config | Covers | Notes |
|---|---|---|
| `tsconfig.node.json` | `electron/**` (main + preload) + `electron.vite.config.ts` | `types: ['node']`, bundler resolution |
| `tsconfig.web.json` | `src/**` (renderer) | `jsx: react-jsx`, `@/*` → `src/*` alias |

The root `tsconfig.json` is only project references. Every verify gate runs **both**. `noUncheckedIndexedAccess` is deliberately off (measured ~700 errors, deferred — see `lamprey-architecture-contract` weak points).

## electron-vite specifics (`electron.vite.config.ts`)

- Entries: `electron/main.ts` + `electron/cli.ts` (main), `electron/preload.ts`, `src/index.html` (renderer).
- **`better-sqlite3` is external** to the main bundle — it's a native module, `require()`d at runtime, unpacked from asar.
- A custom inline `.env` loader exposes only `LAMPREY_`-prefixed keys to the main bundle; `LAMPREY_GITHUB_CLIENT_ID`/`SECRET` are injected as build-time string literals (empty in forks → runtime BYO-credentials fallback). The renderer never sees them.

## electron-builder specifics (`electron-builder.yml`)

- appId `com.lamprey.harness`; targets: Windows NSIS + zip, macOS dmg, Linux AppImage.
- Artifact names are **generic** (`Lamprey-x64.exe`, `Lamprey-x64.zip`) so CDN URLs stay stable across versions.
- `asarUnpack: **/*.node` — native binaries must live outside the asar archive.
- `signAndEditExecutable: false` → unsigned builds; because of that, an `afterPack` hook (`scripts/embed-win-icon.js`, rcedit) embeds the `.ico` manually. When a cert arrives, `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` env vars flip on signing automatically.
- `extraResources` bundles `resources/` (vendor JS, snip filters, skills, plugins, slash-commands, MCP servers, connector catalog) — these bootstrap into `userData` on first run.

## The ABI story (read this before trusting test results)

better-sqlite3 is a native module compiled per **ABI** (application binary interface — the V8/Node native-module version, `NODE_MODULE_VERSION`). `postinstall` rebuilds it for **Electron's** ABI so the packaged app works. Historically (Electron 35 era) that ABI differed from the Node running vitest, so ~23 DB test files guarded by a runtime probe silently skipped — which is exactly how the v0.9.2 P0 shipped undetected (`lamprey-failure-archaeology` #1).

Since JM-27 (Electron 43, Node 22) the ABIs match and those tests **run**. Treat any reappearing native skip as an incident:

```bash
npm run verify:proof -- --list-native-skips   # prints whether the binding loads + the guarded cohort
```

CI intentionally runs `npm ci --ignore-scripts` (skipping the Electron-ABI rebuild) and then fetches only the Electron binary (`node node_modules/electron/install.js`) for the test job — fast, and the vitest process uses Node's own ABI.

## Known traps

| Trap | Symptom | Fix |
|---|---|---|
| AV blocks esbuild | vitest/electron-vite fails to spawn `node_modules/esbuild/bin/esbuild.exe` | AV exclusion for `node_modules/esbuild`; or run `node node_modules/esbuild/bin/esbuild --version` once to trigger the on-access prompt; or reinstall after excluding (CONTRIBUTING.md) |
| Long paths | `npm install` "path too long" | `git config --global core.longpaths true` |
| Dev server instant exit | no window, exit 0-ish | `ELECTRON_EXEC_PATH` (above) |
| Native module load error after switching Node versions | `NODE_MODULE_VERSION` mismatch error | rerun `npm install` (postinstall rebuilds) or `npx electron-rebuild -f -w better-sqlite3` |
| Worktree builds fail | electron-builder "Cannot compute electron version" | worktrees have no `node_modules`; build from the primary checkout (`lamprey-ship-and-release`) |

## Provenance and maintenance

Based on direct reads of `package.json`, `electron.vite.config.ts`, `electron-builder.yml`, `vitest.config.ts`, CONTRIBUTING.md, and `.github/workflows/*.yml`, at v0.16.0 (2026-07-02).

Re-verify:
- Scripts/engines: `node -e "const p=require('./package.json');console.log(p.engines,Object.keys(p.scripts))"`
- Electron/better-sqlite3 versions: `node -e "const p=require('./package.json');console.log(p.devDependencies.electron,p.dependencies['better-sqlite3'])"`
- Signing gate: `grep -n "signAndEditExecutable\|CSC" electron-builder.yml`
- ABI health: `npm run verify:proof -- --list-native-skips`
