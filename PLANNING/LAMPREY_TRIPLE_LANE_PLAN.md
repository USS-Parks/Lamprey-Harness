# LAMPREY_TRIPLE_LANE_PLAN.md — Triple Lane Phase (TL-0 … TL-W4)

**Status: PENDING** — awaiting explicit user green light + STS instruction.
This drafting session does not implement product prompts and does not run STS.

Drafted 2026-08-23 against tip **`origin/main` @ `8940dac`** and app **v0.30.1**.
User ask: one comprehensive P-SPR covering **all three lanes** (Claude Code refresh,
OpenRouter routing depth, Unsloth/Ollama local polish) for review ahead of STS and a
**new Bucket**.

**Closest ancestors:** `PLANNING/LAMPREY_OPERABILITY_DEBT_PLAN.md` (density/K-register),
`PLANNING/LAMPREY_TOOLS_MCP_ROSTER_PLAN.md` (just shipped), `PLANNING/PSPR_TEMPLATE.md`,
`PLANNING/CJ26_FOLLOW_ON_CANDIDATES.md` (Claude Code refresh candidate seed),
PX2 / v0.27.1 direct-provider routing history.

**Target version:** **v0.31.0** (minor). **Bucket at wrap** (default yes — user asked).

This file is the P-SPR. A plan's own "STS" wording is not approval. Only the user's
explicit go-ahead fills the Approval state line.

---

## §0 — Governance

### Goal (one sentence)
Close three complementary connectivity gaps in one phase — **(A)** refresh the Claude Code
peer inventory and land only high-ROI deltas, **(B)** deepen OpenRouter as an opt-in
aggregator (fallbacks, provider prefs, optional auto-route) without undoing direct-provider
default, **(C)** polish local OpenAI-compatible endpoints (Ollama / LM Studio / Unsloth Studio)
so fine-tuned and local models are first-class in Lamprey — then **Bucket v0.31.0**.

### Why this phase
After Operability Debt (v0.30.0) and Tools+MCP Roster (v0.30.1), Basho asked what remains
versus Unsloth and OpenRouter. Those are different product classes than a coding harness.
The honest Lamprey response is not to copy a trainer UI or become a model marketplace; it is
to (1) stay current against **Claude Code** as the true peer, (2) steal OpenRouter's **routing
depth** into Lamprey's existing OpenRouter provider path, (3) steal Unsloth's **serve local /
export / OpenAI API** integration pattern via custom endpoints.

### Lanes (names locked)

| Lane | Codename | Outcome |
|------|----------|---------|
| A | Claude Code Refresh | Pinned inventory + ≤5 High/Low-risk deltas or an empty wont table (K12) |
| B | OpenRouter Routing Depth | Fallbacks + provider prefs (+ optional auto) on the OpenRouter path only |
| C | Local Endpoint Polish | Presets, health probe, capability posture for Ollama / LM Studio / Unsloth API |

Shared: TL-0 baseline, TL-W* wrap + Bucket.

### Scope (what this phase touches)
- `PLANNING/TL_BASELINE.md`, this plan, `PLANNING/README.md` live-canon pointer
- Lane A: `PLANNING/TL_CLAUDE_CODE_INVENTORY.md`; selective product files **only** if A3 picks them
- Lane B: `electron/services/providers/*` (OpenRouter request shaping), settings persistence + UI, tests; short OpenWiki/ARCHITECTURE note
- Lane C: custom provider / endpoint UX + presets + probe; tests; short "train elsewhere → Lamprey" doc
- `DEVLOG.md`, `CLAUDE.md` / `AGENTS.md` Current State
- Wrap: `package.json` **0.31.0**, `RELEASE_NOTES/v0.31.0.md`, Bucket + CDN

### Non-goals (explicitly out of scope)
- Rebuild Unburdening Planner→Coder→Reviewer / router / proof-gate / composer
- Embed Unsloth **training** / LoRA / RL / dataset recipes in core Electron UI
- Make OpenRouter the default router for pinned `MODEL_CATALOG` rows (v0.27.1 direct-provider stands)
- Computer Use, Chrome-profile control, Record/Replay, remote handoff, Office/Sites plugins (CJ26)
- Authenticode / flipping unsigned-builds non-goal
- Live `supportsTools` owner-key campaign (remains parked)
- `MODEL_CATALOG` row fabrication
- Plugin-native tool runtime (AC K10)
- Parallel multi-track STS (K9)


### Decision register

| # | Decision | Stance |
|---|----------|--------|
| K1 | Lane order | TL-0 then A inventory then B then C then optional A deltas then wrap |
| K2 | Claude evidence | Pin Claude Code version and evidence date before product deltas |
| K3 | A deltas | At most 5 High-ROI Low/Med-risk items from scoreboard; else wont-table |
| K4 | Provider default | Direct-provider default unchanged; OpenRouter stays opt-in |
| K5 | OpenRouter depth | Fallbacks plus provider prefs plus optional openrouter/auto |
| K6 | Unsloth surface | No training UI in core; OpenAI-compatible endpoint polish only |
| K7 | Local presets | Ollama, LM Studio, Unsloth Studio API presets (editable) |
| K8 | Version and Bucket | Wrap v0.31.0 and run Bucket at TL-W4 |
| K9 | STS shape | One linear track feat/triple-lane |
| K10 | Local tools authority | Approval, snip, gated filters still apply |
| K11 | OpenWiki | Short OR and local endpoint notes only |
| K12 | Empty Lane A | Inventory-only close is success if nothing scores |

### Verify gate (every prompt must pass before commit)
1. Typecheck node project — clean
2. Typecheck web project — clean
3. Vitest for touched tests — clean
4. If electron/ipc/chat.ts touched: run verify-proof no-tests mode
5. Final TL-W3/W4: full vitest + production build + verify-proof + Bucket

### Commit discipline
- One commit per prompt with prompt id in subject
- DEVLOG under Triple Lane Phase section using real land date
- Owner footer: Authored and reviewed by Basho Parks, copyright 2026
- Do not skip hooks. No push until wrap unless user asks earlier.

### Worktree / branch
- Branch: feat/triple-lane from current origin/main (fetch before create).

### Completion criteria
1. TL-0 and all Lane B + C prompts done.
2. Lane A: inventory complete; deltas done or explicit wont table (K12).
3. Current State honest; version 0.31.0; Bucket artifacts published.
4. Final gate green.

### Soft inventory

| # | Soft issue | Owner prompts |
|---|------------|---------------|
| S1 | Claude parity claims may be stale vs current Claude Code | TL-A1 to A3 (+ A4+ if any) |
| S2 | OpenRouter path lacks first-class fallback / provider prefs | TL-B1 to B6 |
| S3 | Local/fine-tuned models second-class vs cloud keys | TL-C1 to C5 |
| S4 | Risk of pulling training UI into core | TL-C6 + K6 |
| S5 | Risk of undoing direct-provider default | K4 + TL-B tests |
| S6 | No phase baseline measurement | TL-0 |
| S7 | Docs/canon lag after multi-lane ship | TL-W1 to W2 |
| S8 | Installers still on older Bucket until wrap | TL-W4 |

### Keep / Refuse locks

#### Do not delete
| Keep | Why |
|------|-----|
| Direct-provider pinned catalog routing | v0.27.1 |
| OpenRouter as opt-in provider + live import | Existing |
| settings.json customProviders / custom endpoints | Lane C builds on this |
| Approval / snip / gated tool filters | K10 |
| CJ26 candidates not in this phase | Scope |
| Tools+MCP Roster v0.30.1 catalog locks | Just shipped |

#### Do not add (this phase)
| Refuse | Why |
|--------|-----|
| Unsloth Studio training/RL UI in core | K6 |
| OpenRouter as default for all pinned models | K4 |
| Unburdening pipeline revival | Non-goals |
| Computer Use / remote handoff / Office plugins | CJ26 |
| More than 5 Claude deltas without A3 rescoring | K3 |

### Approval state
- **APPROVED 2026-08-23** by Basho Parks — STS with K1–K12 defaults; cloud agent model grok-4.6, effort high, fast false; Bucket v0.31.0 at TL-W4; merge to main and report once when complete.

---

## §1 — Prompt Roster

Execute in order. Do not batch. Each prompt is one commit.

### Shared baseline

### **TL-0 — Lock Triple Lane baseline**
- [x] Write PLANNING/TL_BASELINE.md with only: tip SHA; package version; lane goals A/B/C; code touchpoint map for OpenRouter and customProviders; cite CJ26 Claude Code refresh row; soft inventory S1-S8; pointer to this P-SPR. No product code.
- **Closes:** S6
- **Files:** PLANNING/TL_BASELINE.md
- **Verify:** file exists

---

### Lane A — Claude Code Refresh

### **TL-A1 — Pin Claude Code evidence**
- [x] Record Claude Code version/build, evidence date, and sources in inventory preamble (or TL_BASELINE amend). No product deltas until this pin exists (K2).
- **Files:** PLANNING/TL_CLAUDE_CODE_INVENTORY.md (create) and/or TL_BASELINE
- **Verify:** greppable version + date

### **TL-A2 — Write Claude vs Lamprey inventory**
- [x] Author PLANNING/TL_CLAUDE_CODE_INVENTORY.md matrix (tools, MCP/connectors, skills, projects, permissions, UX micro-interactions, status line, plan mode, etc.). Mark each retained / narrowed / stale / missing vs Lamprey tip. No product code.
- **Closes:** S1 (measure)
- **Verify:** file exists; every row has a status

### **TL-A3 — Scoreboard and delta pick list**
- [x] Score missing/stale rows: ROI (H/M/L) times risk/effort (H/M/L). Select at most 5 High-ROI and Low/Med-risk candidates into TL-A4.. list, or declare empty under K12 with wont table.
- **Closes:** S1 (decide)
- **Verify:** pick list or explicit empty + wont table

### **TL-A4 — Delta 1 (optional)**
- [ ] If A3 listed item 1: implement that single delta with tests. If empty: DEVLOG note TL-A4 N/A (K12) and skip code.
- **Verify:** typecheck + touched tests, or DEVLOG N/A

### **TL-A5 — Delta 2 (optional)**
- [ ] Same pattern as TL-A4 for A3 item 2 / N/A.

### **TL-A6 — Delta 3 (optional)**
- [ ] Same pattern for item 3 / N/A.

### **TL-A7 — Delta 4 (optional)**
- [ ] Same pattern for item 4 / N/A.

### **TL-A8 — Delta 5 (optional)**
- [ ] Same pattern for item 5 / N/A.

---

### Lane B — OpenRouter Routing Depth

### **TL-B1 — Map OpenRouter code paths**
- [ ] Document in DEVLOG or PLANNING/TL_OPENROUTER_MAP.md: OpenRouter keys, chatStream body, catalog import, model ids. Identify the single request-build seam for fallbacks/prefs. No behavior change required.
- **Closes:** S2 (orient)
- **Verify:** map exists

### **TL-B2 — Fallback model list on OpenRouter requests**
- [ ] When settings supply an ordered fallback list, send OpenRouter fallback fields on OpenRouter-provider calls only (K4/K5). Leave non-OpenRouter providers untouched.
- **Files:** providers helpers/registry, settings types, tests
- **Verify:** typecheck; unit tests for request body shaping

### **TL-B3 — Provider preferences object**
- [ ] Support OpenRouter provider prefs: sort in {price, latency, throughput} and optional order/ignore if low-cost. Same seam as TL-B2.
- **Verify:** tests for prefs serialization

### **TL-B4 — Settings UI: OpenRouter routing panel**
- [ ] Settings surface to edit fallback model ids + sort preference; persist settings.json. Clearly opt-in (hide or disable unless OpenRouter key present is OK).
- **Files:** settings UI + store/IPC as needed
- **Verify:** web typecheck; thin test or source-lock

### **TL-B5 — Optional openrouter/auto**
- [ ] Allow selecting openrouter/auto (or current official auto id) when OpenRouter is configured. Document session stickiness / cache caveat in UI help or OpenWiki (K5). If upstream id differs at implement time, use official id and note in DEVLOG.
- **Verify:** model resolve/menu accepts id; test

### **TL-B6 — Tests + short architecture/OpenWiki note**
- [ ] Harden tests for K4 (non-OpenRouter unchanged). Add short openwiki or ARCHITECTURE note on OpenRouter routing depth (K11).
- **Closes:** S2, S5
- **Verify:** touched vitest; doc exists

---

### Lane C — Local Endpoint Polish

### **TL-C1 — Audit custom endpoint path**
- [ ] Baseline how customProviders / custom OpenAI-compatible endpoints appear in keychain, validateProviderKey, model menu, and tool surface. Record gaps in TL_BASELINE or DEVLOG.
- **Closes:** S3 (orient)
- **Verify:** written notes

### **TL-C2 — Connection presets**
- [ ] Ship editable presets (K7): Ollama http://127.0.0.1:11434/v1, LM Studio common port, Unsloth Studio API base placeholders. One-click add/merge into custom providers without stomping user edits (idempotent).
- **Files:** UI + defaults module + tests
- **Verify:** web typecheck; tests

### **TL-C3 — Health check / models list probe**
- [ ] Test-connection (or equivalent) probes base URL and lists models when endpoint supports models listing. Loud failure on connection refused.
- **Verify:** unit tests with mocked HTTP

### **TL-C4 — Capability posture for local endpoints**
- [ ] Align with PX2 import posture: tool calling / vision flags default off until probed or user explicitly enables. No silent supportsTools true.
- **Verify:** tests for defaults

### **TL-C5 — Docs: Train elsewhere, serve, Lamprey**
- [ ] Short OpenWiki or README section: fine-tune in Unsloth (or elsewhere), export/serve OpenAI-compatible, add preset in Lamprey (K6/K11). No training UI.
- **Closes:** S3
- **Verify:** doc exists

### **TL-C6 — Lock non-goal: no training UI**
- [ ] DEVLOG + optional absence note that core does not ship LoRA/RL trainer UI. Satisfies S4 without code churn if already true.
- **Closes:** S4
- **Verify:** greppable lock

---

### Wrap

### **TL-W1 — Point PLANNING live canon at this P-SPR**
- [ ] Update PLANNING/README.md: this plan is current working P-SPR; Tools+MCP Roster and OD remain shipped references (v0.30.1 / v0.30.0).
- **Verify:** greppable

### **TL-W2 — Current State + DEVLOG catch-up**
- [ ] Sync CLAUDE.md / AGENTS.md Current State; ensure DEVLOG Triple Lane section complete. Keep OD honest-gap lock tests green if wording changes.
- **Closes:** S7
- **Verify:** greppable; OD lock tests

### **TL-W3 — Phase wrap to v0.31.0**
- [ ] package.json to 0.31.0; RELEASE_NOTES/v0.31.0.md; README New-in; DEVLOG phase-complete. Full gate: vitest + build + verify-proof.
- **Verify:** final gate minus Bucket

### **TL-W4 — Bucket v0.31.0**
- [ ] Run full Bucket (tag, GitHub release, R2, CDN purge) per existing scripts/bucket path. Report artifact URLs once. (K8)
- **Closes:** S8
- **Verify:** release tag v0.31.0 exists; CDN URLs live

---

## Open K-stances for Basho (answer to approve)

1. **K8 Bucket** — confirm Bucket at wrap for v0.31.0 (default yes per your ask).
2. **K12** — confirm Lane A may ship inventory-only if nothing scores High/Low-risk.
3. **K5 auto** — ship openrouter/auto in this phase, or defer auto and keep fallbacks+prefs only?
4. **K7 Unsloth URL** — OK to use Unsloth Studio documented OpenAI base as an editable preset placeholder (exact port/path may need a one-line amend at implement time)?
5. **STS** — say STS (and any K amends) to run TL-0 through TL-W4 end-to-end.

---

Authored and reviewed by Basho Parks, copyright 2026
