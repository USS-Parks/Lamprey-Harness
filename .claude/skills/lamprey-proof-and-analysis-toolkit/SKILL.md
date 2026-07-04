---
name: lamprey-proof-and-analysis-toolkit
description: Lamprey's first-principles analysis recipes — "prove it, don't just install it" — each with a worked example from this repo's history: source-lock test construction, documented-vs-wired audits, prompt byte measurement, behavioral smoke playbook design, causal-chain postmortems, native-binding probing, adversarial test inversion, and BASELINE/AFTER measurement docs. Load when you need to establish that something is true (or was never true) rather than assume it.
---

# Lamprey Proof & Analysis Toolkit

## When to use / when not

- **Use** when a claim needs establishing: "is X actually wired?", "did this change help?", "why did this really break?", "is this test proving anything?"
- **Don't use** for the routine gate mechanics (see `lamprey-validation-and-qa`) or ready-made diagnostics (see `lamprey-diagnostics-and-tooling`). For the full idea-to-result lifecycle, see `lamprey-research-methodology`.

## Recipe 1 — Source-lock test construction

**When:** the claim is structural — "X is wired / gated / absent / identical in two places" — and a regression would be silent.

**Steps:** (1) state the invariant as a sentence; (2) find the minimal source text that proves it (a call site, a literal, the absence of a string); (3) write a vitest that reads the file(s) with `fs.readFileSync` and asserts presence/absence/equality; (4) name the incident it locks in a comment.

**Worked examples:** `electron/services/loop-safety.test.ts` asserts the `loopsEnabled` gate exists at every loop entry point (locks the LP-4 P0). `electron/services/default-app-settings.test.ts` asserts the canonical defaults and the renderer literal match byte-for-byte (locks the SP-1 drift defect). `src/components/layout/Sidebar.project-flow.test.ts` asserts `window.prompt(` never reappears (a *negative* lock).

**False positive to watch:** the lock passes because the string moved, not because the invariant broke. Lock the tightest expression that is still refactor-meaningful, and prefer several small asserts over one giant snapshot.

## Recipe 2 — Documented-vs-wired audit

**When:** documentation (or a plan, or a comment) claims a capability exists. Periodically; always before building on top of a claimed feature.

**Steps:** (1) list the load-bearing claims; (2) for each, find the **call site** — not the definition: `grep -rn "<functionName>(" electron/ src/ | grep -v "def\|export\|test"`; (3) classify: wired (cite file:line) / dead code (exists, never called) / vapor (doesn't exist); (4) dead+vapor become findings; fix or delete, and record "Invoked from: file:line" in the architecture doc (the WC-9 standard).

**Worked examples:** Wiring Closure (v0.9.1) found seven documented-but-dead features, including `normalizeToolsForProvider` and `filterToolsForRole` with no callers. LP-0 found the entire loop scaffold ran no turn (G1). JM's audit found the FC-6 fallback tool contract was never injected (CC-4) — documented for two phases, dead the whole time.

**Lesson embedded:** a merged PR + a doc paragraph is not evidence of function. Only a call site is.

## Recipe 3 — Prompt byte measurement

**When:** any change to system-prompt composition, contracts, or skill/stub injection.

**Steps:** (1) measure before: build the exact prompt a turn would send and take `Buffer.byteLength(s, 'utf8')`; (2) make the change; (3) measure after, same method; (4) if growing, justify against the guard tests (contract < 3,300 B, coding prompt < 3,900 B as of UB-8) — raising a guard is a reviewed decision; (5) behavioral confirmation via the playbook (recipe 4) if the change targets model behavior.

**Worked example:** L2 collapsed the agent contract 9,311 → 2,113 bytes (−77.3%); the Reviewer stage prompt dropped 11,016 → 697 bytes in L5; UB-8 re-measured after the deletions (3,401 → 3,118) and tightened the guards. The entire Lampshade→Unburdening arc is byte-measured — no "feels smaller."

## Recipe 4 — Behavioral smoke playbook design

**When:** the property under test is model behavior (cogency, discipline, chrome) that unit tests can't reach.

**Steps:** (1) fix a small ask set spanning the behavior space (the LL playbook: 8 asks from trivia to phase-ship); (2) define per-ask **binary expected signals** ("≤2 read calls", "verdict on its own line", "no unrequested cleanup"); (3) pin the configuration (settings, model) — unpinned config invalidated a whole round once: the v0.11 "router misbehavior" was actually the user's `agentMode:'multi'` pin bypassing the router; (4) run live, record per-ask pass/fail; (5) failures become coded findings (the F-codes) that drive a fix phase; (6) re-run same asks after.

**Worked example:** the LL 8-ask playbook run against v0.11.0/v0.11.1 produced F1–F15, which drove the Cogency Restore phase; the v0.12 re-run validated fixes 4/4 on the reviewer-verdict asks and *rejected* one planned fix as unnecessary (CR-6 no-op).

## Recipe 5 — Causal-chain postmortem (the v0.9.2 method)

**When:** any shipped defect.

**Steps:** (1) reproduce and capture the exact failure; (2) walk backward to the **first cause** (not the proximate one); (3) identify the **amplifier** (what turned a bug into an outage); (4) identify the **detection gap** (why no gate caught it); (5) fix all three; (6) archive as symptom → root cause → evidence → resolution in the failure record.

**Worked example:** v0.9.2 — proximate: missing column. First cause: illegal expression-PK DDL throwing during init. Amplifier: `getDb()` caching the half-initialized handle (fixed much later, JM-16 — amplifiers deserve their own fix even when the first cause is patched). Detection gap: the regression test silently skipping under the ABI mismatch (fixed as SP-9 accounting + the Electron 43 ABI alignment). Three fixes, three different phases — because all three were named.

## Recipe 6 — Native-binding probing

**When:** anything native (better-sqlite3, sharp-like modules) might silently degrade tests or runtime.

**Steps:** probe at runtime (`try { new BetterSqlite3(':memory:') } catch`), gate with `describe.skipIf`, and — the important half — **make the skip loud**: `verify:proof` prints whether the binding loads and enumerates the guarded cohort (`--list-native-skips`). A skip you didn't see is a gate you didn't run.

**Worked example:** SP-9, the direct institutional answer to v0.9.2's detection gap.

## Recipe 7 — Adversarial test inversion

**When:** behavior contradicts intuition but tests are green; or a test's asserted invariant sounds suspicious when read aloud.

**Steps:** (1) read the test name and assertion as a sentence — does the sentence describe a *desirable* property?; (2) if unclear, invert the assertion and run; (3) if the inverted test passes against your mental model of correct behavior, the original was locking a defect; (4) fix code + test together, and add a positive assertion of the real invariant.

**Worked example:** v0.11.1 — "sends an evidence packet to Reviewer **without** coder narrative" was a green test asserting the bug. Read aloud, it's obviously wrong: a reviewer that never sees the work product. Both tests were flipped and a positive `.toContain(coderReply)` assertion added.

## Recipe 8 — BASELINE/AFTER measurement docs

**When:** any phase whose value is an improvement claim (smaller, faster, saner, safer).

**Steps:** (1) before touching anything, write `PLANNING/<PHASE>_BASELINE.md` with the measured numbers and the method; (2) state predicted numbers in the plan; (3) execute; (4) write `<PHASE>_AFTER.md` with the same method, same units; (5) reconcile misses honestly (CR's contract-regrowth overshoot was reconciled in CR_AFTER §1 rather than hidden).

**Worked examples in-repo:** `PLANNING/LL_BASELINE.md`/`LL_AFTER.md` (prompt bytes), `HY_BASELINE`/`HY_AFTER` (tool-schema bytes/turn: −63.8%), `CR_BASELINE`/`CR_AFTER`, `SP_BASELINE`, `UB_BASELINE`, `LP_BASELINE`.

## Provenance and maintenance

Recipes distilled from the repo's own history (Wiring Closure, SP-9, v0.9.2/v0.11.1 postmortems, the L/HY/CR/SP/UB measurement docs) — all referenced files verified present at v0.16.0 (2026-07-02).

Re-verify:
- Exemplar tests exist: `ls electron/services/loop-safety.test.ts electron/services/default-app-settings.test.ts src/components/layout/Sidebar.project-flow.test.ts`
- Baseline docs: `ls PLANNING/*_BASELINE.md PLANNING/*_AFTER.md`
- Guard byte values: `grep -rn "3300\|3900" electron/services/*.test.ts | head -5`
