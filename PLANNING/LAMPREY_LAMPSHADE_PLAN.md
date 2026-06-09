# LAMPREY_LAMPSHADE_PLAN.md — Lampshade Phase (L1–L11)

**Target version:** v0.10.0
**Branch:** `claude/intelligent-agnesi-b00922` (worktree)
**Status:** COMPLETE — shipped 2026-06-09 as v0.10.0
**One-line goal:** Make outputs from DeepSeek / Gemma / Qwen feel as cogent and natural as Claude or Codex by peeling the over-instruction layer that currently tortures every turn, without touching the UX, tools, FC infrastructure, proof harness, panels, Snip, RAG, Skills, Plugins, Reasoning-Trace, Bucket pipeline, or any other shipped surface.

## §0 — Governance

### Scope (what this phase touches)
- `electron/services/system-prompt-builder.ts` (contract, role fragments, identity head, composer, agent role prompts, `PSEUDO_TAG_GUARD` usage)
- `electron/services/system-prompt-builder.test.ts` (snapshots rewritten in sync)
- `electron/ipc/chat.ts` only where it threads `supportsNativeTools` / role / composer assembly / **adaptive route decision**
- `src/stores/agent-store.ts` — add `'auto'` mode + heuristic router import + default flip
- `electron/services/agent-router.ts` (new) — pure heuristic classifier `routeAgentMode(text, ctx): 'single' | 'multi'`
- `electron/services/agent-router.test.ts` (new) — pure-function unit tests for the classifier
- `src/components/settings/AgentSettings.tsx` — add `'Auto (recommended)'` mode option, mark as default
- `DEVLOG.md`, `README.md`, `package.json` version bump
- `CLAUDE.md` — append Lampshade Phase complete bullet at L10
- New planning files: `PLANNING/LAMPREY_LAMPSHADE_PLAN.md` (this file), `PLANNING/LL_BASELINE.md`, `PLANNING/LL_SMOKE_PLAYBOOK.md`, `PLANNING/LL_AFTER.md`

### Non-goals (explicitly out of scope)
- No changes to tool registry, native function calling, `validateToolArguments`, fallback parser, capability mismatch detection
- No changes to `sanitizePseudoTags` (HX3/HX4 stays — it's the safety net that makes L6 safe)
- No changes to Mechanical Proof Harness (M1–M13): receipts, proof gate, failure ledger, deterministic Verification footer all keep current shape
- No changes to Snip, RAG, Skills, Connectors, Plugins, Customize
- No changes to Panels, right-panel cards, `FloatingEnvironmentCard`, Reasoning-Trace Viewer
- No changes to Deep Research pipeline or its banner
- No changes to Bucket pipeline or release tooling
- No deletion of multi-agent mode — it stays available; L8 adds `'auto'` as a third option and defaults to it

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run electron/services/system-prompt-builder.test.ts electron/services/agent-router.test.ts` — clean
4. Any prompt that touches `electron/ipc/chat.ts` also runs `npm run verify:proof -- --no-tests` — exits 0
5. Final phase gate (L11): full `vitest run` + `npm run build` + `npm run verify:proof`

### Commit discipline
- One commit per prompt, present-tense imperative subject (`feat(prompts): L2 …`)
- DEVLOG entry per prompt under a new `## 2026-06-09 — Lampshade Phase` section
- No squashing across prompts; no co-author trailer (per `feedback_no_coauthor_trailer`)
- No push until L11 unless the user explicitly says push earlier

### Approval state
- **APPROVED 2026-06-09** by user inline with answers (1) Lampshade name OK, (2) v0.10.0 confirmed, (3) Adaptive routing required, (4) L9 must author the playbook itself, (5) STS.

---

## §1 — Prompt Roster

### **L1 — Baseline measurement + `LL_BASELINE.md`**

**Files**
- New: `PLANNING/LL_BASELINE.md`
- Read-only on: `system-prompt-builder.ts`, `chat.ts`

**Acceptance**
- `LL_BASELINE.md` contains:
  - Full rendered system prompt for single-agent coding role (no skills / no memory), exact byte + word count + approximate token count (chars/4 heuristic)
  - Full rendered agent prompt for each of `planner`, `coder`, `reviewer` with the same counts
  - The full rendered composer prompt with counts
  - A pasted "what the model sees first" dump for each — verbatim, no editorial

**Verify:** tsc node + web pass (no source changes); diff of file tree: only `PLANNING/LL_BASELINE.md` added.
**Commit:** `docs(planning): L1 Lampshade baseline — current prompt envelope sizes`

---

### **L2 — Collapse 52-bullet contract to one ~12–15 bullet operating block**

**Files**
- `electron/services/system-prompt-builder.ts` — replace `CONTRACT_SECTIONS` + `renderContract()` shape
- `electron/services/system-prompt-builder.test.ts` — rewrite snapshot expectations

**Acceptance**
- One section, heading `## How you work`, ~12–15 short imperatives covering: read intent → check scope → use tools as evidence → smallest correct change → verify behavior → name what changed → call out blockers
- All defensive duplicates removed
- `<contract>…</contract>` XML wrapper retained
- Byte count of `renderContract()` drops at least 60% vs L1 baseline

**Verify:** tsc node + web + the updated builder tests pass.
**Commit:** `refactor(prompts): L2 collapse 52-bullet contract to single operating block`

---

### **L3 — `<think>` becomes conditional, not mandatory**

**Files**
- `electron/services/system-prompt-builder.ts`

**Acceptance**
- New chain-of-thought wording is one bullet inside the new operating block: *"When the answer involves planning, multiple options, or a non-obvious decision, work through it inside a `<think>…</think>` block before the visible reply. Skip the block for one-line acknowledgements, simple confirmations, and direct factual answers. Close `</think>` cleanly before any tool call, code, or final answer."*
- The "every single turn MUST" language is gone
- For models with `supportsNativeTools` (already a routing signal), the chain-of-thought sentence is dropped entirely — same mechanism that strips `PSEUDO_TAG_GUARD` today

**Verify:** tsc + builder tests; manual render diff between native-tools and non-native-tools.
**Commit:** `refactor(prompts): L3 make think-block conditional, drop every-turn mandate`

---

### **L4 — Slim `ROLE_FRAGMENTS` to 2–3 lines each**

**Files**
- `electron/services/system-prompt-builder.ts`
- `electron/services/system-prompt-builder.test.ts`

**Acceptance**
- Each fragment is 2–3 short sentences, imperatives only
- `coding` example target: *"You are writing code. Read files before you edit them. Make the smallest correct change. After edits, run `verify_workspace` and report what passed."*
- `review` keeps the `SHIP` / `CHANGES` verdict-word rule
- `frontend` keeps the "ask for the dev-server URL, then `frontend_qa`" rule
- `non_technical_user` keeps the "avoid jargon" rule
- Each fragment ≤ 280 chars

**Verify:** tsc + builder tests with relaxed snapshot bounds.
**Commit:** `refactor(prompts): L4 slim role fragments to tight imperatives`

---

### **L5 — Agent sub-stage prompts drop the full base contract**

**Files**
- `electron/services/system-prompt-builder.ts` — `buildAgentSystemPrompt`, `AGENT_ROLE_PROMPTS`
- `electron/services/system-prompt-builder.test.ts` — pipeline assertions rewritten

**Acceptance**
- Planner / Coder / Reviewer no longer receive the full identity + contract. They receive:
  - One-line identity (*"You are running inside Lamprey. Be honest about which model you are."*)
  - The applicable role prompt from `AGENT_ROLE_PROMPTS` (slimmed)
  - For `coder` only: a 3-line operating-principles excerpt (read → smallest change → verify)
- `reader` and `verifier` already-tight shapes preserved
- `coworker` keeps a thin contract (it's user-facing)
- Byte count of rendered Reviewer prompt drops at least 70% vs L1 baseline

**Verify:** tsc + builder tests; `runAgentPipeline` integration tests still pass.
**Commit:** `refactor(prompts): L5 strip full contract from agent sub-stage prompts`

---

### **L6 — Drop `PSEUDO_TAG_GUARD` from the prompt path; keep persist-side sanitizer**

**Files**
- `electron/services/system-prompt-builder.ts` — remove `PSEUDO_TAG_GUARD` injection from every assembly path; keep the `export const` itself as `@deprecated` for one cycle
- `electron/services/system-prompt-builder.test.ts` — remove HX2 coverage tests, add a negative test asserting `<bash>` does not appear in any rendered prompt
- `electron/services/sanitize-pseudo-tags.ts` — **untouched**

**Acceptance**
- No prompt sent to any model names the forbidden tag list
- `sanitizePseudoTags` continues to rewrite stray pseudo-tags on persist
- All 22 vitest cases for `sanitizePseudoTags` pass unchanged
- New negative test: `expect(buildSystemPrompt(...)).not.toContain('<bash>')`

**Verify:** tsc + builder + sanitizer tests.
**Commit:** `refactor(prompts): L6 drop pseudo-tag guard from prompts; sanitizer keeps safety`

---

### **L7 — Slim `COMPOSER_SYSTEM`**

**Files**
- `electron/services/system-prompt-builder.ts`

**Acceptance**
- Drop the mandatory `<think>` line
- Drop the *exactly this structure* mandate; replace with: *"Write a short wrap-up grounded only in the supplied run summary. When proof receipts are supplied, cite each receipt id and parsed metric exactly from the summary; never invent counts. If verification was skipped, say so. Do not invent files, commands, or outcomes."*
- Keep proof-receipt citation rule verbatim — load-bearing for the M-phase gate
- Drop `PSEUDO_TAG_GUARD` reference (already cut in L6)
- The deterministic `**Verification:**` footer appended by `runAgentPipeline` is unchanged — that's code, not prompt

**Verify:** tsc + builder tests; `npm run verify:proof -- --no-tests` exits 0.
**Commit:** `refactor(prompts): L7 slim composer system, keep proof-receipt rule`

---

### **L8 — Adaptive route: `'auto'` mode becomes the default (REVISED per user direction)**

**Files**
- New: `electron/services/agent-router.ts` — pure function `routeAgentMode(userText, ctx?): { mode: 'single' | 'multi', reason: string }`
- New: `electron/services/agent-router.test.ts` — unit tests covering 16+ classification cases
- `src/stores/agent-store.ts` — widen `agentMode` type to `'auto' | 'single' | 'multi'`; default to `'auto'` for new users; hydration migration preserves explicit `'single'`/`'multi'` choices
- `src/components/settings/AgentSettings.tsx` — add radio for `'Auto (recommended)'` mode; explain the heuristic in one sentence
- `electron/ipc/chat.ts` — when settings resolve to `agentMode: 'auto'`, call `routeAgentMode` on the user's turn text and dispatch to single-agent or multi-agent path accordingly; thread the routing decision into the chat metadata so the UI can show a one-line *"Routed to multi-agent because: long, multi-file refactor request"* hint

**Classifier rules (heuristic, no LLM call)**
- **Promote to multi-agent if any of:**
  - Prompt length > 800 characters
  - Contains build-from-scratch phrases: `/\b(build|create|scaffold|implement)\b.*\b(full|complete|entire|whole|app|application|game|tool|system|harness|pipeline)\b/i`
  - Contains multi-file phrases: `/\b(refactor|audit|rewrite|migrate)\b.*\b(across|entire|all|every)\b/i`
  - Contains explicit phase phrases: `/\b(P-?SPR|STS|stem to stern|Phase)\b/`
  - 3+ comma-separated deliverables or 3+ bullet/dash items
  - Sequential markers: `/\b(and then|after that|once .* is done|step \d)\b/i` (≥ 2 hits)
- **Stay single-agent otherwise** — short asks, questions, single-file edits, quick fixes
- **Honor explicit override:** if the user message contains `--single` or `--multi` flags (case-insensitive), use that. Strip the flag from the message before dispatch.

**Acceptance**
- Pure classifier with 16+ tests covering each rule + boundary cases
- `'auto'` is the new default for `agentMode`; existing settings rows with explicit `'single'`/`'multi'` pass through unchanged
- Settings UI shows three options with `'Auto (recommended)'` as default
- One-line routing hint surfaces in chat metadata when auto-mode is active
- No deletion of `'single'` or `'multi'` modes
- No LLM call in the router — pure heuristic, fast, deterministic, testable

**Verify:** tsc + new router tests + agent-store tests + `npm run verify:proof -- --no-tests`.
**Commit:** `feat(agents): L8 add adaptive 'auto' agent-mode router, default new users to auto`

---

### **L9 — Snapshot tests + smoke playbook (authored, not punted)**

**Files**
- `electron/services/system-prompt-builder.test.ts` — add 6 new snapshot/bound tests
- New: `PLANNING/LL_SMOKE_PLAYBOOK.md` — fully authored, see content below

**Snapshot tests pin:**
1. Rendered single-agent coding prompt for non-native-tools model: byte length under 4096 (was ~9500 at baseline)
2. Rendered Reviewer prompt: byte length under 1024 (was ~3500 at baseline)
3. Negative — none of these strings appear in any rendered prompt: `<bash>`, `task complete`, `MUST begin`, `Every single assistant turn`, `52 bullets`, `PSEUDO_TAG_GUARD`
4. Positive — `## How you work` heading is present in single-agent prompts
5. Native-tools-on: the conditional `<think>` sentence is absent from the rendered prompt
6. Native-tools-off: the conditional `<think>` sentence is present exactly once

**`LL_SMOKE_PLAYBOOK.md` — fully authored playbook (8 canonical asks)**

Each ask includes the prompt verbatim, the expected single-vs-multi route, what to look for in the output (subjective cogency signals + objective signals like proof receipt citation), and a one-line failure mode if the route picks wrong.

The 8 asks span:
- (1) trivia question — *"What does the keychain module do?"* — expect single, expect under 200 words, expect no forced `<think>` preamble
- (2) one-line edit — *"Rename `runChatRound` to `dispatchSingleAgentTurn` in chat.ts"* — expect single, expect 1–2 tool calls, expect concrete diff
- (3) typo fix — *"Fix the typo 'lampshde' in the README"* — expect single, expect verify hint
- (4) bug investigation — *"Why is the build failing?"* — expect single (open-ended diagnostic), expect read-then-act loop
- (5) feature build — *"Add a button to the chat header that exports the transcript as markdown"* — expect single OR multi depending on length signals; either acceptable
- (6) cross-file refactor — *"Refactor the chat store to use Zustand 5 slices across every consuming component"* — expect multi (matches multi-file phrase rule)
- (7) phase ship — *"STS the new error-boundary phase"* — expect multi (matches STS phrase rule)
- (8) plan request — *"Show me the P-SPR for adding telemetry"* — expect single (it's a plan-draft ask, not phase execution), but explicitly does NOT touch code

**Verify:** tsc + new builder tests pass.
**Commit:** `test(prompts): L9 snapshot the new envelope + ship smoke playbook`

---

### **L10 — Paperwork: DEVLOG, README, CLAUDE.md, version, before/after diff**

**Files**
- `DEVLOG.md` — new `## 2026-06-09 — Lampshade Phase wrap` summary entry (the per-prompt entries land in L1–L9 commits as we go)
- `README.md` — update download heading, CDN URL row, "New in v0.10.0" paragraph, Quick start link version, Roadmap top entry (per `feedback_readme_is_part_of_ship`)
- `package.json` — version bump to `0.10.0`
- `CLAUDE.md` — append Lampshade Phase complete bullet at the end of the State list
- `PLANNING/LAMPREY_LAMPSHADE_PLAN.md` — flip APPROVED → COMPLETE; append brief retrospective
- New: `PLANNING/LL_AFTER.md` — same shape as `LL_BASELINE.md` so the byte/word/token drop is recorded

**Verify:** tsc node + web pass; `npm run verify:proof -- --no-tests` exits 0.
**Commit:** `chore(release): L10 v0.10.0 — Lampshade Phase wrap doc updates`

---

### **L11 — Ship arc (build + tag + Bucket)**

**Acceptance**
- Full local verify: `tsc node + tsc web + vitest run + npm run build + npm run verify:proof` — all clean
- Push branch: `git push origin claude/intelligent-agnesi-b00922`
- Merge to `main`, push main, tag `v0.10.0`, push tag
- `pwsh scripts\bucket.ps1` — uploads to R2, publishes GH release, purges CF cache
- Final check: https://github.com/USS-Parks/lamprey shows v0.10.0; `cdn.islandmountain.io/Lamprey-x64.exe` returns new binary

**Verify:** all gates green; release artifacts present on GH + R2.
**Commit:** none (ship arc only).

---

## §2 — Retrospective (L10)

**Headline outcome.** Every numeric target was met or beaten by a wide margin. `renderContract()` 9,311 → 2,113 bytes (target was ≤3,700, hit −77.3% vs target −60%). Coding-mode single-agent prompt 10,897 → 2,753 bytes (target ≤4,096, hit −74.7% vs target −62%). Reviewer agent prompt 11,016 → 697 bytes (target ≤1,024, hit −93.7% vs target −90%). The reviewer's shared-boilerplate ratio inverted from 89% boilerplate / 11% role to 19% boilerplate / 81% role.

**What worked.**
- The split into L2 (collapse contract) + L3 (`<think>` conditional) + L5 (strip from sub-stages) was the right factoring. Each had a clear acceptance criterion and a clean diff; nothing had to be reopened.
- The `THINK_BULLET` extraction made the native-tools strip pattern uniform with `PSEUDO_TAG_GUARD`'s pre-existing strip. Less special-case code.
- L8's pure-heuristic router (no LLM call) made the auto-mode decision both fast and testable. 22 unit tests cover the precedence rules with zero flakiness risk.
- L9's playbook was authored, not punted. The user explicitly warned about this in their approval message: *"L9 better be robust enough to author this, or you will look foolish for saying so."* It is.

**Surprises.**
- The Reviewer's role text already contained the load-bearing failure-modes / file:line / SHIP / CHANGES rules — the contract had been adding boilerplate on top, not value. L5 dropped 87.5% of bytes without touching any operational rule.
- Multiple existing tests pinned the OLD over-prescriptive shape (the 9-section heading list, the byte-identical RT1 reviewer snapshot, the HX2 `<bash>`-name-listing locks). Updating them was load-bearing for the phase; the new negative-presence locks are tighter than the old positive-presence locks.
- The `final-response-composer.test.ts` cared about the exact phrase *"cite receipt ids and parsed metrics"* (plural). My first L7 draft pluralized that to *"each receipt id and parsed metric"*; restoring plural was a one-line fix and the test became a useful contract guard between the prompt and the M-phase gate's expectation.

**Carried forward (out of scope but noted).**
- `docs/function-calling-matrix.md` lines 53–54 still have a checklist item asserting `PSEUDO_TAG_GUARD is present in fallback-model system prompts`. Now obsolete; not load-bearing for runtime. Worth a follow-up cleanup but not in this phase.
- `PLANNING/CODEX_TOOLSET_PARITY_PROGRESS.md` references the old composer section markers — those still match (the markers stayed), so no edit needed.

**For future phases.** The new envelope shape is durable but the model-side cogency is provisional until the L9 playbook gets exercised against real DeepSeek / Gemma / Qwen runs. If 2+ asks fail their primary cogency signal, the playbook's closing section names the failure-mode-to-rule mapping a follow-up phase would use. The `'auto'` router heuristic is the most likely future tuning point; collect counterexamples and add to `agent-router.test.ts`.

**Authorization trail.**
- Plan drafted inline 2026-06-09 in response to user's prompt-cogency concern
- User approved with 5 clarifications: (1) Lampshade name OK, (2) v0.10.0 confirmed, (3) `'auto'` router required (L8 revised), (4) L9 must author playbook itself, (5) STS
- STS executed L1 → L10 on `claude/intelligent-agnesi-b00922` worktree, branch synced with `origin/main` at start
- L11 (ship arc) executed after L10 paperwork commit

