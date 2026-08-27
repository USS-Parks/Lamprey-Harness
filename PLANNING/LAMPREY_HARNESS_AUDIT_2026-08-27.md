# Lamprey Harness — Product / Ops Audit

**Date:** 2026-08-27  
**Scope:** Audit only. No product rewrite. No merge to main.  
**Tree:** local clone of `USS-Parks/Lamprey-Harness` at `/workspace`  
**Cited main SHA:** `39c2c5e` (Basho)  
**Verified HEAD:** `39c2c5ef6a4bba116d21fc9c3da9a8427bb8ca5b` — **matches.**  
`origin/main` is the same commit. `package.json` version is **0.31.0**.

**What this is:** ranked comparison of what the current tree and GitHub actually do versus what Current State, PLANNING, README, RELEASE_NOTES, and OpenWiki advertise.

**What this is not:** a P-SPR, an STS, a Bucket run, or a product change. The only tree change from this audit is this file.

---

## Method

Read source, hooks, workflows, PLANNING, README, CLAUDE.md, AGENTS.md, RELEASE_NOTES, OpenWiki, GitHub releases/CI, and PR #4 / #5. Did not run local vitest/lint/tsc (`node_modules` absent in this VM). Did not run Bucket (`pwsh` and `.bucket.json` absent). Graft MCP was **unavailable** (live discovery failed); no graph results are invented.

**CDN:** `https://cdn.islandmountain.io/Lamprey-x64.exe` returned Cloudflare challenge **403** from this VM. R2/CDN bytes are **unverified**.

**Rejected false alarm:** a naive `^\s+id:` count of `catalog.ts` yields 75 rows. That misses the MiniMax spread (`...[7 tuples].map(...)` at `catalog.ts:654-673`). Runtime `MODEL_CATALOG` is **82**. `provider-parity.test.ts:46` locks 82. Docs that say 82 are correct on count.

---

## Ranked findings

Severity: **P0** = operators or users can act on a false fact; **P1** = real breakage or incomplete safety; **P2** = stale/owed that will mislead the next STS; **P3** = parked/honest or residual.

### 1. What breaks

| Rank | Finding | Evidence | Class |
|------|---------|----------|-------|
| **P0** | **Installer / Bucket story is split three ways.** GitHub already has a `v0.31.0` release with EXE/ZIP/DMG/AppImage and `latest.yml` `version: 0.31.0` (EXE 301,957,676 bytes, published 2026-08-23). README download table and “Bucketed installers … are on v0.31.0” (`README.md:26-41`) follow GitHub. CLAUDE.md / AGENTS.md Current State, `RELEASE_NOTES/v0.31.0.md`, DEVLOG TL-W3, and `PLANNING/README.md` still say **Bucket owed / artifacts remain v0.30.0**. TL-W4 is still `[ ]`. PR #5 body states Bucket **did** run: R2 + Cloudflare purge published local bytes, then `gh release upload` raced the tag workflow and marked the ship PARTIAL because CI assets had a **different size/digest** than local `dist/`. PR #5 only retried the GH upload script; it did not re-run Bucket or rewrite notes. | `gh release view v0.31.0`; `PLANNING/LAMPREY_TRIPLE_LANE_PLAN.md:276-279`; `RELEASE_NOTES/v0.31.0.md:3-4,34`; `CLAUDE.md:13`; `DEVLOG.md:13-24`; PR #5 | **Doc lie + possible binary fork** |
| **P1** | **Scheduled OpenWiki workflow is red every day since 2026-08-24.** Fail: `ANTHROPIC_API_KEY is required for non-interactive runs.` Secret unset. Last successful in-tree OpenWiki stamp is `2026-08-23T18:47:35Z` at gitHead `e355551` (v0.30.0 era, before Triple Lane). | `.github/workflows/openwiki-update.yml:36-37`; runs `33105242363`, `32948807532`, `32827610861`, `32707742623`; `openwiki/.last-update.json` | **Ops break** |
| **P1** | **`files:*` is not fully workspace-confined** despite JM-19 / Current State claiming it is. `listDir` / `readText` / `walkProject` use `confineToWorkspace`. `files:process` forwards renderer paths to `processFiles` with no root check. `files:openInVSCode` and `files:openInExplorer` take `args.targetPath \|\| process.cwd()` and spawn / `shell.openPath` with no confine. `app:openPath` opens an arbitrary OS path. | `electron/ipc/files.ts:150-225,319-352`; `electron/main.ts:575-583`; CLAUDE.md JM-19 paragraph | **Security gap vs advertised** |
| **P1** | **Native-DB CI still skips 8 tests.** Comment says “18 ABI-guarded suites”; walker finds **17** files. Under Electron (`ELECTRON_RUN_AS_NODE=1`) CI log: 135 passed / **15 skipped**. Entire files still skip: `sessions-search.test.ts` (6), `loop-runner.test.ts` (2) — `nativeOk()` / `getDb()` need a real Electron `app`. The v0.9.2 class of hole is smaller, not closed for FTS/sidebar or loop wake-up integration. | `.github/workflows/ci.yml:91-93`; `scripts/test-native-db.cjs`; CI run `32756283206` | **Gate honesty** |
| **P1** | **IPC envelope is not universal.** Documented contract is `{ success, data \| error }`. `ping` returns `'pong'`. `shell:openExternal` returns `undefined` and swallows non-http(s) with no error. | `electron/main.ts:510-515`; CLAUDE.md / AGENTS.md Architecture | **Contract break** |
| **P2** | **Primary vitest job skips 157 tests by design** (no better-sqlite3 rebuild). Compensated in part by `native-db`. Coverage floors are 13/12/9/14% — regression guards, not quality. | CI `32756283206`: 2948 passed / 157 skipped; `vitest.config.ts` | **Known, still a hole** |
| **P2** | **`build.yml` does not run on PRs.** A PR can merge with green `ci.yml` and never exercise electron-vite + installer smokes. | `.github/workflows/build.yml` triggers: `main`, `v*`, dispatch | **CI gap** |
| **P2** | **Unsigned Windows/macOS builds.** `signAndEditExecutable: false`. Auto-update integrity is **sha512 in GitHub `latest.yml` only**. Locked as permanent non-goal by `operability-debt-safety.test.ts` K2. | `electron-builder.yml:77-91`; `electron/services/updater.ts:21-47` | **Honest / permanent** |
| **P3** | **No `v0.30.1` GitHub release.** Source wrap only; tags jump `v0.30.0` → `v0.31.0`. | `gh release list`; `RELEASE_NOTES/v0.30.1.md` | **Expected if K6 held** |

**What is not broken (product CI on main):** latest `ci.yml` and `build.yml` on `main` at `39c2c5e` succeeded (2026-08-24). Tag workflow `32671185022` on `v0.31.0` succeeded and attached platform artifacts.

---

### 2. What is stale

| Rank | Finding | Evidence | Class |
|------|---------|----------|-------|
| **P0** | **Current State “artifacts remain v0.30.0” is false for GitHub.** See §1. Narrow reading (“full Bucket = R2+CDN closeout”) is not what those sentences say. | CLAUDE.md:13-14; AGENTS.md:13-14; RELEASE_NOTES/v0.31.0.md:3-4 | **Doc lie** |
| **P0** | **README “Bucketed” overclaims** relative to TL-W4 still open and PR #5’s PARTIAL GH ship. GitHub URLs work; CDN bytes unverified here. | README.md:41; Triple Lane plan:276-279; PR #5 | **Doc lie or unverified** |
| **P1** | **AGENTS.md provider count is 32; code is 33.** AGENTS omits `meta` from the built-in list and says “thirty-two” / “32 built-ins”. CLAUDE.md, README, `ProviderId`, and `provider-parity.test.ts` all say **33**. | AGENTS.md:4,9; `registry.ts` PROVIDERS; `src/lib/types.ts` | **Doc stale** |
| **P1** | **CLAUDE.md still says “M9 remains unapproved.”** CJP-WRAP is `COMPLETE` in `CJ26_AFTER.md`, the parity P-SPR, and AGENTS.md. | CLAUDE.md:70; `PLANNING/CJ26_AFTER.md:45` | **Doc lie** |
| **P1** | **Triple Lane plan header is still `PENDING`.** Body: **APPROVED 2026-08-23**. TL-0…TL-W3 `[x]`; only TL-W4 open. PLANNING/README still calls it the current working P-SPR. | `LAMPREY_TRIPLE_LANE_PLAN.md:3,144,276` | **Doc stale** |
| **P2** | **OpenWiki is frozen on v0.30.0.** Pages stamp Version v0.30.0 and “82 models / 33 providers” (count still true). Generated `catalog.md` at 2026-08-23T18:40. Does not mention Triple Lane, OpenRouter extras, or local presets. | `openwiki/domains/tools/catalog.md:24-33`; `.last-update.json` | **Doc stale** |
| **P2** | **`PLANNING/archive/README.md` live-canon list predates Triple Lane / Tools+MCP.** Root `PLANNING/README.md` is newer. | archive/README.md:7-15 vs PLANNING/README.md:11-25 | **Doc stale** |
| **P2** | **Historical JM-0 trailer text in CLAUDE/AGENTS Current State blocks.** Hook requires `Authored and reviewed by Basho Parks, copyright 2026`. Historical JM-0 bullet still quotes `Agentically Engineered and Reviewed by Basho Parks - 2026`. | `scripts/hooks/commit-msg:7`; CLAUDE.md:58 | **Historical; hook is source of truth** |
| **P2** | **`package.json` repository/homepage still point at `USS-Parks/lamprey`.** Actual repo and `electron-builder.yml` publish target are `USS-Parks/Lamprey-Harness`. Updater uses builder publish (GitHub Lamprey-Harness), so updates are not following the stale field. | `package.json:17-21`; `electron-builder.yml:112-115` | **Stale metadata** |
| **P2** | **CLAUDE.md vs AGENTS.md peer framing.** CLAUDE: Claude Code. AGENTS: Codex. Same product. Load-bearing only as onboarding contradiction, not as runtime. | Both files L4 | **Doc dual-canon** |
| **P3** | **MCP “github/postgres/sqlite replaced”** in Current State is easy to misread as dropped. Templates remain; **packages** were replaced (Docker GitHub MCP, Bytebase DBHub, `mcp-server-sqlite-npx`). Fetch dropped. README v0.30.1 blurb is the accurate wording. | `resources/connectors/catalog.json`; README.md:43-46 | **Wording drift** |
| **P3** | **CLAUDE.md “82 models” is true.** Do not “fix” it down to 75. | `catalog.ts` + MiniMax spread; `provider-parity.test.ts:46` | **Not a bug** |

`operability-debt-safety.test.ts` **locks** Current State in both CLAUDE.md and AGENTS.md to keep `R1–R4`, `supportsTools`, `OpenWiki`, `unsigned`, `turn.interrupted`, `Parked:`, and `Permanent non-goal: unsigned builds`. Any Current State edit must keep those phrases or the lock fails.

---

### 3. What is owed

| Rank | Item | Status | Evidence |
|------|------|--------|----------|
| **P0** | **TL-W4 closeout** — decide whether GitHub v0.31.0 + claimed R2 purge is “Bucket done,” or whether owner must re-run Bucket and prove GH digest == local `dist/` == CDN. | Unchecked; PR #5 left it PARTIAL | Triple Lane plan:276-279; PR #5 |
| **P1** | **OpenWiki secret + regenerate past Triple Lane** | Workflow broken; tree at v0.30.0 | openwiki-update.yml; `.last-update.json` |
| **P1** | **Confirm or refute GH vs local vs CDN EXE digest split** | Unverified (CDN 403 here) | PR #5; `latest.yml` sha512 on GitHub only |
| **P2** | **R1–R4 live playbooks + live `supportsTools` probes** | Honestly parked; locked in Current State | OD plan; CLAUDE.md:15; operability-debt-safety.test.ts:30-43 |
| **P2** | **CJ26 owner playbooks** (Steering replay, MCP OAuth, Browser CDP, GA background, disposable GH PR) | Implementation-complete / OWNER-VERIFICATION-NEEDED | `CJ26_AFTER.md:37-45` |
| **P2** | **Live authentication of catalog rows** (Meta Muse, August 2026 first-party, many PX2 hosts) | Parked on owner keys | CLAUDE.md:17 |
| **P2** | **Lane A deltas** | Empty pick list (K12). Inventory pinned 2.1.241. No product code. | Triple Lane plan; DEVLOG TL-A8 |
| **P2** | **M4 / Code Mode** | Parked indefinitely | PLANNING/README.md:31 |
| **P2** | **CJ26 follow-ons** (Record/Replay, Computer Use, remote handoff, Office/Sites) | Candidates only; not PSPRs | `CJ26_FOLLOW_ON_CANDIDATES.md` |
| **P2** | **`sessions-search` + `loop-runner` native coverage** | Still skip under Electron native-db | CI native-db log |
| **P3** | **`forceDebugTraceOn()`** | Dead export; not called from `main.ts` (JM-1). Still importable. | `debug-trace.ts:33`; `main.ts:603-605` |
| **P3** | **Retired settings** (`agentMode`, `proofGate`, `agentRoster`, `agenticCodingComposer`) | Inert by construction; parity-locked absent from defaults | `default-app-settings.ts:27-30` |
| **P3** | **Historical proof/composer DB columns and after-action readers** | Kept on purpose (UB K2) | after-action-report.ts comments |
| **P3** | **`browserDeveloperModeEnabled`** | No Settings tab; Browser panel only. Wiring test expects that. | ToolSettings.tsx; tools-settings.wiring.test.ts |
| **P3** | **`noUncheckedIndexedAccess`** | Measured ~700 errors; deferred | CLAUDE.md JM-31 |

**Half-landed that is actually shipped (do not re-plan):** Triple Lane B/C is **wired**. OpenRouter extras only when `desc.provider === 'openrouter'` (`registry.ts`). `openrouter/auto` is injected in the picker when an OpenRouter key exists; not a catalog row. Local presets: `src/lib/local-endpoint-presets.ts` (`ollama`, `lmstudio`, `unsloth`). Connection-refused copy: `connection-error.ts`. Live import tools/vision default false: `model-import.ts`. No training UI: `no-training-ui.lock.test.ts`.

---

### 4. Harness vs advertised

**What the app actually is at `39c2c5e` / v0.31.0**

An Electron **43** desktop **single-agent** coding harness (React 19, Zustand, Tailwind 4). One turn seam: `chat:send` → `runHeadlessTurn` → `runChatRound`. Privileged work is main-process IPC. Keys are `safeStorage` + atomic `keys.json`. Conversations live in SQLite.

**33 built-in providers** (including `meta`). **82 pinned `MODEL_CATALOG` rows.** **13** retired-id remaps. OpenRouter has **zero** pinned broker aliases. **11 providers have no pinned rows** and exist as key/import/keyless doors: `openrouter` (opt-in live + auto), `aihubmix`, `freellmapi`, `nvidia`, `github-models`, `sambanova`, `siliconflow`, `deepinfra`, `hyperbolic`, `ollama`, `lmstudio`. Unsloth is a **custom-endpoint preset**, not a built-in `ProviderId`.

Era default: single-agent, `toolSurface: 'full'`, `proofGate` gone, `loopsEnabled: false`, `orchestrationEnabled: false`, `browserDeveloperModeEnabled: false`. Unburdening deletions **stay deleted** (`agent-pipeline`, `agent-router`, `proof-gate`, `final-response-composer` have no source files). `multi_agent_run` remains as an explicit tool.

Shipped surfaces that planning still talks about as if they were the product: Steering/Queue, task graph, artifacts, PR chat, MCP resources/OAuth, Browser Developer (off), automations/goals, Deep Research, Snip, Skills/Plugins, Loops (off), Orchestration (off).

**What planning/docs claim that is too large**

- “Bucket still owed — installer artifacts remain v0.30.0” — **false for GitHub; CDN unverified; Bucket attempted and PARTIAL per PR #5.**
- “Bucketed installers are on v0.31.0” — **true for GitHub URLs; “Bucketed” is stronger than TL-W4 admits.**
- “32 providers” (AGENTS) — **false.**
- “M9 unapproved” (CLAUDE) — **false.**
- “files:* confined to workspace root” — **partial.**
- “Native-DB hole closed” — **mostly; 8 tests still skip.**
- “Current Codex / Claude Code parity” — **not claimed in the honest files; do not upgrade this.** CJ26 is implementation-complete with owner playbooks open.
- OpenWiki “every model is pinned because it has been tested or documented” — **docs-pinned and convention-pinned rows exist; live auth is still owed.**
- README “Let’s go.” in Quick Start is marketing voice; not a functional lie.

**What the docs under-claim**

- Triple Lane B/C is in the product, not a plan-only wish. Settings UI for OpenRouter routing and local presets exists.
- GitHub already serves v0.31.0 installers. Auto-update (`electron-updater` + `publish.provider: github` → `USS-Parks/Lamprey-Harness`) will offer **0.31.0** to packaged apps with `autoCheckUpdates: true` (default true). That path does **not** wait on CDN.

---

## Architecture / IPC / security notes

**Still load-bearing and present**

- Turn seam + `setLoopTurnRunner` injection.
- Provider registry + catalog extract (`catalog.ts`).
- Atomic JSON (JM-13).
- `will-navigate` + http(s) `setWindowOpenHandler` + webview deny (`main.ts:348-402`).
- `forceDebugTraceOn()` not called at boot.
- Settings default parity file pair (`default-app-settings.ts` ↔ `settings-store.ts`).
- Dual MCP catalogs + `CORE_SURFACE_NAMES` (12) vs `CORE_NORMALIZE_NAMES` (8) — intentional split.
- Ten curated MCP templates (playwright, filesystem, github, postgres, sqlite, memory, linear, sentry, notion, slack).

**Dangerous / privileged paths (mitigated or not)**

| Path | Mitigation |
|------|------------|
| `shell:openExternal` | http(s) prefix only; no envelope |
| `app:openPath` | **none** |
| `files:openInVSCode` / `openInExplorer` | **no workspace confine**; spawn without `shell: true` |
| `files:process` | **no confine** in handler |
| `files:listDir/readText/walk` | confined |
| `mcp:addServer` stdio | dialog shows command; requires approval |
| `terminal:spawn` / monitor / browser CDP | UI-gated; Browser Dev off by default |
| Artifact `WebContentsView` | CSP + sandbox (not re-traced line-by-line this pass) |
| `debugTrace: true` in settings.json | Still writes plaintext tool-arg traces if the owner opts in |

**Dead / historical (do not rebuild)**

Planner→Coder→Reviewer, auto-router, runtime proof gate, composer. Comments and `proofStatus` types remain. Era-chrome test still forbids pipeline jargon in UI.

---

## Tests / CI / hooks (actual)

| Gate | What it proves |
|------|----------------|
| `ci.yml` lint | `verify:proof --no-tests` (eslint + tsc node + tsc web). Name “lint” is narrower than the job. |
| `ci.yml` test | vitest + coverage on ubuntu **and** windows; Electron binary installed; native sqlite **not** rebuilt. 2948 / 157 skip on latest main. |
| `ci.yml` native-db | Electron ABI walk of ABI-guarded files. 17 files, 8 tests still skip. |
| `build.yml` | tsc + `build:win/mac/linux` + bundle/renderer smokes + artifacts. **Not on PRs.** Tag attach to GitHub Release. |
| `openwiki-update.yml` | **Failing.** Would also rewrite AGENTS.md / CLAUDE.md / openwiki if the secret existed. |
| Repo hooks | `commit-msg` trailer + slop denylist; `pre-commit` artifact scan + lint + tsc×2; `pre-push` full `verify:proof` except docs-only. This VM’s `core.hooksPath` is Cursor agent hooks, **not** `scripts/hooks`, until `npm run hooks:install`. |
| `typecheck` npm script | `tsc --noEmit` on root `tsconfig.json` (`files: []` + references). Real gate is the two project flags. |

Bucket (`scripts/bucket.ps1`) is **not** an npm script. It is Windows + `.bucket.json` + AWS + Cloudflare. Not runnable here.

---

## First fix I would do

**Reconcile the installer / Bucket narrative. Do not touch Electron product code.**

Write one true paragraph and put it in CLAUDE.md + AGENTS.md Current State (Triple Lane bullet), `RELEASE_NOTES/v0.31.0.md`, DEVLOG honest-gaps, and `PLANNING/README.md`. Leave TL-W4 `[ ]` until the owner confirms digests.

Suggested truth, pending owner CDN check:

> Triple Lane source is **v0.31.0**. GitHub release `v0.31.0` exists (tag workflow `32671185022`; `latest.yml` version 0.31.0). README download links point there. A Bucket run attempted R2 + CDN purge and then lost the GitHub Windows upload race to CI (PR #5). TL-W4 is **not** closed: prove GitHub asset sha256 == local `dist/` == CDN, or re-run Bucket. Do not tell operators the installers are still v0.30.0.

Keep the OD-4 locked phrases (`R1–R4`, `supportsTools`, `OpenWiki`, `unsigned`, `turn.interrupted`, `Parked:`) so `operability-debt-safety.test.ts` stays green.

**Do not do next (until that paragraph is true):** mark TL-W4 `[x]`, rewrite providers, rebuild Unburdening, or “fix” the catalog down to 75.

**Second, if ops access exists:** set `ANTHROPIC_API_KEY` on the OpenWiki workflow or disable the cron so main stops going red daily.

**Third, if a product fix is wanted after the docs:** confine `files:process`, `files:openInVSCode`, `files:openInExplorer`, and `app:openPath` the same way `listDir` already is — the JM-19 sentence already claims this.

---

## Non-binding hypotheses (labeled)

1. **Hypothesis (unverified):** CDN/`cdn.islandmountain.io` currently serves the **local Bucket** Windows bytes from the PARTIAL ship, while GitHub serves the **CI** Windows bytes. PR #5 says those two sets had different size/digest at ship time. **Could not verify** (CDN 403 challenge). If true, the public website and the GitHub README can hand users two different 0.31.0 EXEs, and auto-update follows GitHub.

2. **Hypothesis (unverified):** after PR #5’s retry logic, nobody re-ran Bucket, so the race was fixed only for the *next* ship.

3. **Hypothesis (low confidence):** `sessions-search` / `loop-runner` skips are `getDb()` needing `app.whenReady()`, not missing SQL. Not traced into those tests this pass.

---

## Inventory snapshot (code, not docs)

| Item | Count / state |
|------|----------------|
| HEAD | `39c2c5ef6a4bba116d21fc9c3da9a8427bb8ca5b` |
| App version | 0.31.0 |
| Built-in providers | 33 (incl. `meta`) |
| `MODEL_CATALOG` | 82 (incl. 7 MiniMax spread rows + `minimax-m3`) |
| `RETIRED_MODEL_MAP` | 13 |
| Providers with zero pinned models | 11 (listed in §4) |
| Curated MCP templates | 10 |
| `CORE_SURFACE_NAMES` | 12 |
| GitHub latest release | v0.31.0 (6 assets) |
| Missing GH release | v0.30.1 |
| OpenWiki last in-tree update | 2026-08-23 / `e355551` |
| Graft | unavailable this session |
| Local vitest this session | not run |

---

## Commands run

```
git rev-parse HEAD
# 39c2c5ef6a4bba116d21fc9c3da9a8427bb8ca5b
node -e "console.log(require('./package.json').version)"
# 0.31.0
gh release view v0.31.0
gh release list --limit 8
gh run list --branch main --limit 20
gh pr view 4 ; gh pr view 5
curl -sI https://cdn.islandmountain.io/Lamprey-x64.exe
# HTTP/2 403  cf-mitigated: challenge
```

Authored and reviewed by Basho Parks, copyright 2026
