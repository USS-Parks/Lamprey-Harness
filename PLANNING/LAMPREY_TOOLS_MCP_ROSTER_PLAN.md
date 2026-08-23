# LAMPREY_TOOLS_MCP_ROSTER_PLAN.md — Tools + MCP Roster Phase (TR-0 … TR-10)

**Status: PENDING** — awaiting explicit user green light + STS instruction.
This drafting session does not implement product prompts and does not run STS.

Drafted 2026-08-23 against tip **`origin/main` @ `7ea0f9e`** (OpenWiki minimal tree landed)
and app **v0.30.0**. User locked scope: **update both native tools and MCP curated catalog**.

**Closest ancestors (format):** `PLANNING/LAMPREY_OPERABILITY_DEBT_PLAN.md`,
`PLANNING/PSPR_TEMPLATE.md`, `PLANNING/archive/LAMPREY_CUSTOMIZE_PLAN.md` (C6 catalog intent),
`PLANNING/archive/CODEX_TOOLSET_PARITY_*.md` (native pack growth history).

**Target version:** **v0.30.1** (patch). Roster hygiene + curated catalog refresh — not a new FC architecture.

This file is the P-SPR. A plan's own "STS" wording is not approval. Only the user's
explicit go-ahead fills the Approval state line.

---

## §0 — Governance

### Goal (one sentence)
Make Lamprey's **native tool roster** and **MCP curated connector catalog** accurate,
discoverable, and in sync across code / on-disk catalog / Customize UI / OpenWiki —
without inventing speculative tools or rebuilding Unburdening/plugin-tool runtimes.

### Why this phase
- Curated MCP catalog is still the C6 day-one seven (`playwright`, `filesystem`, `github`,
  `postgres`, `sqlite`, `memory`, `fetch`). Customize C6 prose named Linear / Sentry /
  Notion as examples; those templates never shipped.
- Dual catalog (`resources/connectors/catalog.json` ↔ `src/data/connectors-catalog.ts`)
  has no parity lock test — drift is easy.
- Native surface grew to ~100 tools across 24 packs; Customize `NATIVE_TOOL_HINTS` is a
  stale 6-name subset (list incomplete vs `CORE_SURFACE_NAMES`).
- OpenWiki `domains/tools/catalog.md` documents the **model** catalog, not native tools —
  agents have no authored native-tool inventory page.

### Scope (what this phase touches)
- `resources/connectors/catalog.json` + `src/data/connectors-catalog.ts` — expand + sync
- New parity test locking the dual MCP catalog
- `src/components/customize/NewSkillWizard.tsx` — `NATIVE_TOOL_HINTS` align to live CORE
- Optional thin shared module so hints cannot drift from `CORE_SURFACE_NAMES`
- `electron/services/core-tool-names.ts`, `tool-packs.ts`, pack files — inventory locks /
  dead-name fixes only; **no speculative new native capabilities** unless K1 amends
- OpenWiki: add `openwiki/domains/tools/native.md`; fix tools `index.md`; keep model page as models
- `PLANNING/TR_BASELINE.md`, this plan, `PLANNING/README.md` live-canon pointer
- `DEVLOG.md`, `CLAUDE.md` / `AGENTS.md` Current State, `package.json` + `RELEASE_NOTES/v0.30.1.md` (wrap)

### Non-goals (explicitly out of scope)
- New FC architecture, tool_search redesign, or plugin-native tool runtime (AC K10 stands).
- Rebuilding Unburdening deletions (Planner→Coder→Reviewer, etc.).
- Live auth of every new MCP template (templates only; owner keys stay owner work).
- Replacing user-installed `mcp-servers.json` entries; catalog is Add-flow templates only.
- Computer Use / Chrome profile / Record-Replay / Remote Control (CJ26 follow-ons).
- Model catalog row edits (`MODEL_CATALOG`) — that is providers, not this phase.
- Full 40-page OpenWiki expansion; one native-tools page + MCP page touch-up only.

### Decision register (stances — amend before STS if you disagree)

| # | Decision | Stance | Rationale |
|---|----------|--------|-----------|
| K1 | New native *capabilities* | **Refuse by default.** Hygiene + discoverability only (hints, inventory locks, OpenWiki). Amend with a named tool list if Basho wants adds. | Ship bar; "update roster" ≠ invent tools. |
| K2 | MCP curated catalog expansion | **Add** Linear, Sentry, Notion, Slack (`npx` templates with env placeholders). **Keep** existing 7. Refresh package args if upstream renamed. | Closes C6 intent gap without claiming live OAuth for each. |
| K3 | Dual catalog authority | **Both stay**; add a vitest that JSON `entries` ≡ TS `CONNECTORS_CATALOG` (ids + command/args/auth/category). | Customize already documents intentional dual copy. |
| K4 | `NATIVE_TOOL_HINTS` | **Replace** with `CORE_SURFACE_NAMES` (shared export). Do not invent a second list. | Stops stale 6-name subset. |
| K5 | OpenWiki | **Author** `openwiki/domains/tools/native.md` from live registry/packs. Prefer constrained CLI update; hand-author OK if CLI bloated. | Agents need an inventory; model page stays models. |
| K6 | Version + ship | Wrap to **v0.30.1**. Bucket only if user says so at wrap. | Patch roster phase after 0.30.0. |
| K7 | STS shape | One linear track on `feat/tools-mcp-roster`. | Small surface; no parallel. |
| K8 | Dead / renamed MCP packages | If an upstream package 404s at baseline, **replace or drop** with DEVLOG note — do not ship broken one-click templates. | Honest catalog. |

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run <touched tests>` — clean
4. Touching `electron/ipc/chat.ts` also needs `npm run verify:proof -- --no-tests`
5. Final gate (TR-10): full `npx vitest run` + `npm run build` + `npm run verify:proof`

### Commit discipline
- One commit per prompt. Present-tense imperative subject with prompt id (`feat(connectors): TR-2 add Linear Sentry Notion Slack`).
- DEVLOG entry per prompt under `## YYYY-MM-DD — Tools + MCP Roster Phase` (use real land date).
- Owner footer every commit: `Authored and reviewed by Basho Parks, copyright 2026`
- Never `--no-verify`. No push until wrap unless user says push earlier.

### Worktree / branch
- Branch: `feat/tools-mcp-roster` from current `origin/main` (re-`git fetch` before create).

### Completion criteria
1. Dual MCP catalog expanded per K2 (or K2 amended) and parity-locked (K3).
2. `NATIVE_TOOL_HINTS` cannot drift from CORE (K4).
3. OpenWiki native tools page exists and lists pack-backed names (K5).
4. TR_BASELINE + Current State honest; version **0.30.1**; final gate green.

### Soft inventory (owned this phase)

| # | Soft issue | Owner prompts |
|---|------------|---------------|
| S1 | MCP curated catalog thin vs C6 intent | TR-2, TR-3, TR-4 |
| S2 | Dual catalog drift risk | TR-3 |
| S3 | Skill wizard native hints incomplete | TR-5 |
| S4 | No authored native-tool inventory for agents | TR-6, TR-7 |
| S5 | No baseline measurement of current roster | TR-0 |

### Keep / Refuse locks

#### Do not delete
| Keep | Why |
|------|-----|
| 24 pack bootstrap in `tool-packs.ts` | Live FC surface |
| CORE surface ≠ normalize split | AC-11 intentional |
| `node-repl` mcp-defaults | Bundled default, not curated catalog |
| Plugin connector contribution path | C11 live |
| Model OpenWiki page | Separate concern |

#### Do not add (this phase)
| Refuse | Why |
|--------|-----|
| Speculative native tools without named list | K1 |
| Plugin-tool runtime | AC K10 |
| Live OAuth proof for every new template | Owner keys |
| MODEL_CATALOG edits | Wrong roster |

### Approval state
- **APPROVED 2026-08-23** by Basho Parks — STS with K1–K8 defaults (native hygiene only; MCP add Linear/Sentry/Notion/Slack; dual parity; hints=CORE; OpenWiki native.md; v0.30.1; no Bucket unless authorized at wrap).

---

## §1 — Prompt Roster

### Baseline

### **TR-0 — Lock roster baseline → `PLANNING/TR_BASELINE.md`**
- [x] Write `PLANNING/TR_BASELINE.md` with only:
  1. Tip SHA (`git rev-parse HEAD`) and `package.json` version.
  2. Count of `tool-packs.ts` imports; list of pack module basenames.
  3. `CORE_SURFACE_NAMES` and `CORE_NORMALIZE_NAMES` verbatim.
  4. Curated catalog ids from both JSON and TS (expect identical seven today).
  5. Current `NATIVE_TOOL_HINTS` verbatim.
  6. Note OpenWiki tools pages present: `catalog.md` (models), `mcp.md`; native inventory absent.
  No product code.
- **Closes:** S5
- **Files:** `PLANNING/TR_BASELINE.md` only
- **Verify:** file exists

### Track A — MCP curated catalog

### **TR-1 — K8: Prove or replace broken upstream packages**
- [x] For each current catalog package (`@playwright/mcp`, `@modelcontextprotocol/server-*`),
  record whether npm resolves. If any 404/deprecated, pick replacement args or drop with
  DEVLOG rationale before expansion. Do not expand on a broken base.
- **Closes:** K8 gate
- **Files:** `PLANNING/TR_BASELINE.md` amend (results table) and/or DEVLOG; code fixes fold into TR-2
- **Verify:** baseline table present

### **TR-2 — K2: Expand curated catalog (Linear, Sentry, Notion, Slack)**
- [x] Add four templates to **both** `resources/connectors/catalog.json` and
  `src/data/connectors-catalog.ts`:
  - `linear` — category Project; env placeholder per current upstream package
  - `sentry` — category Observability
  - `notion` — category Knowledge
  - `slack` — category Chat
  Use current official `npx -y <package>` invocations (verify at TR-1). `auth: 'none'` +
  env placeholders unless Lamprey OAuth is truly required (default: env/token).
  Keep existing seven unchanged except K8 fixes.
- **Closes:** S1 (add slice)
- **Files:** dual catalog files
- **Verify:** tsc web; JSON parse

### **TR-3 — K3: Dual-catalog parity lock test**
- [x] Add a vitest that imports TS catalog and reads `resources/connectors/catalog.json`,
  asserting same ids and matching `command`/`args`/`auth`/`category`/`name` (env key sets equal).
- **Closes:** S2
- **Files:** new test; maybe tiny shared normalize helper
- **Verify:** that vitest file green

### **TR-4 — Customize Add-flow smoke for new entries**
- [x] Extend or add a thin test so catalog length and new ids appear in the module
  AddConnectorFlow reads. No Playwright E2E required.
- **Closes:** S1 remainder
- **Files:** test near AddConnectorFlow / catalog import
- **Verify:** that test

### Track B — Native roster hygiene

### **TR-5 — K4: Align `NATIVE_TOOL_HINTS` to `CORE_SURFACE_NAMES`**
- [x] Stop maintaining a second list. Smallest correct path (ponytail): extract
  `CORE_SURFACE_NAMES` to a shared module both electron and web can import, **or**
  duplicate once with a test that electron CORE equals the shared export used by the wizard.
- **Closes:** S3
- **Files:** `NewSkillWizard.tsx`, possibly `core-tool-names.ts` + shared extract + tests
- **Verify:** tsc ×2; touched tests

### **TR-6 — Native inventory machine-readable lock**
- [x] Add/extend a test that: (1) after pack bootstrap, every `CORE_SURFACE_NAMES` entry is
  registered; (2) every `tool-packs.ts` import path file exists; (3) fails if a pack
  registers zero tools. Prefer structural locks over a brittle full-name golden file.
- **Closes:** part of S4
- **Files:** new/extended test under `electron/services/`
- **Verify:** that test; packs still load

### **TR-7 — K5: OpenWiki native tools page**
- [ ] Add `openwiki/domains/tools/native.md` listing CORE surface + pack map.
  Update tools `index.md`. Clarify `catalog.md` remains **model** catalog.
  Prefer constrained `openwiki code --update -p`; hand-author if CLI over-scopes.
- **Closes:** S4
- **Files:** `openwiki/domains/tools/*`
- **Verify:** page exists; no Unburdening ghosts

### Track C — Docs wrap

### **TR-8 — Point PLANNING live canon at this P-SPR**
- [ ] Update `PLANNING/README.md` live-canon table: this plan is current working P-SPR;
  OD remains shipped reference (v0.30.0).
- **Files:** `PLANNING/README.md`
- **Verify:** greppable

### **TR-9 — Current State + DEVLOG catch-up**
- [ ] Sync CLAUDE.md / AGENTS.md Current State; ensure DEVLOG section has TR entries.
  Keep OD honest-gap lock tests green if wording changes.
- **Files:** `CLAUDE.md`, `AGENTS.md`, `DEVLOG.md`
- **Verify:** greppable; OD lock tests

### **TR-10 — Phase wrap → v0.30.1**
- [ ] Full gate: vitest + build + verify:proof.
  - `package.json` → `0.30.1`
  - `RELEASE_NOTES/v0.30.1.md`
  - Current State: Tools + MCP Roster released as v0.30.1
  - DEVLOG phase-complete
  - Bucket **only** if user authorized at wrap
- **Verify:** final phase gate (§0 item 5)

---

## Open K-stances for Basho (answer to approve)

1. **K2 catalog set** — default Linear + Sentry + Notion + Slack on top of the seven. Drop any? Add others?
2. **K1 native adds** — default none beyond hygiene. Paste a named list if you want real new tools.
3. **K6** — v0.30.1 patch OK? Bucket at wrap?
4. **STS** — say STS (and any K amends) to run TR-0…TR-10 end-to-end.

---

Authored and reviewed by Basho Parks, copyright 2026
