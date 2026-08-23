# LAMPREY_OPERABILITY_DEBT_PLAN.md — Operability Debt Phase (OD-0 … OD-14)

**Status: APPROVED 2026-08-23 — STS by Basho.**
User authorized: full OD-0…OD-14, Bucket v0.30.0, push to main, do not
stop until complete. One linear track (K10). This file is the P-SPR.

Drafted 2026-08-23 from the v0.29.0 Audit Closure leftovers that still
had no teeth: settlement proven only by WC-8 source-reading, honest gaps
listed as prose, mid-round drains uncommented next to the closer,
`tool_search` persist swallowing SQLite errors, CLAUDE/AGENTS Current
State still advertising two catalog stories, `AUGUST_2026_MODELS` still
pushed onto `MODEL_CATALOG` at import time, and 81 PLANNING markdown
files at the root.

**Closest ancestors (format, not scope):**
`PLANNING/LAMPREY_AUDIT_CLOSURE_PLAN.md` (honest leftover list),
`PLANNING/PSPR_TEMPLATE.md` (§0 headings),
`PLANNING/LAMPREY_SWEET_SPOT_PLAN.md` (K-register + evidence).

**Target version:** **v0.30.0** (K8 — user override; not 0.29.1).
`package.json` is `0.29.0` at start (`main` @ `3e0fde9`).

This file is the P-SPR. A plan’s own “STS” wording is not approval. Only
the user’s explicit go-ahead fills the Approval state line. That
go-ahead is on record: 2026-08-23.

---

## §0 — Governance

### Goal (one sentence)
Close the seven v0.29.0 operability leftovers — prove settlement, give
honest gaps teeth, comment the two drain kinds, fail unlock persist
loudly, tell one catalog story, archive spent plans — and ship **v0.30.0**.

### Why this phase
Audit Closure made the closer honest. It did not make the closer *proven
in motion*. A source-lock can pass while `finalizeTurn` is never called
with the status the catch computed. Unlock persist can “succeed” after
SQLite throws. The August rows still live in a side file that mutates
`MODEL_CATALOG` at import. Honest gaps were a wrap paragraph. This phase
gives those leftovers a roster and a version.

### Soft inventory (must close)

| # | Leftover | Prompts |
|---|---------|---------|
| S1 | Live settlement behavioral tests (cap / cancel / closer) | OD-1, OD-2, OD-3 |
| S2 | Honest gaps with teeth | OD-4 |
| S3 | Mid-round vs finalize drain comments | OD-5 |
| S4 | Loud-fail unlock persist | OD-6 |
| S5 | Sync CLAUDE/AGENTS Current State | OD-7 |
| S6 | Fold August catalog into one story | OD-8, OD-9 |
| S7 | Archive spent PLANNING trees + README pointer | OD-10, OD-11 |

Then OD-12 `OD_AFTER.md`, OD-13 `RELEASE_NOTES/v0.30.0.md`, OD-14 wrap.

### Scope (what this phase touches)
- `electron/services/finalize-turn.ts` + `.test.ts` — behavioral closer cases
- `electron/services/turn-interrupt.ts` + `.test.ts` — K1 lock
- `electron/ipc/chat.ts` — drain comments only (OD-5); no drain merge
- `electron/ipc/chat-turn-settlement.test.ts` — keep thin WC-8
- `electron/services/headless-turn-settlement.test.ts` (new, OD-1)
- `electron/services/operability-debt-safety.test.ts` (new, OD-4)
- `electron/services/tool-unlock-persist.ts` + `tool-unlock-state.ts` — loud fail
- `electron/services/providers/catalog.ts` — fold August rows
- `electron/services/providers/registry.ts` — drop overlay push-loop
- `electron/services/providers/catalog-august-2026.ts` + `.test.ts` — delete / retarget
- `PLANNING/` — this file, `OD_BASELINE.md`, `OD_AFTER.md`, `archive/`
- `CLAUDE.md`, `AGENTS.md`, `README.md`, `DEVLOG.md`, `package.json`
- `RELEASE_NOTES/v0.30.0.md`

### Non-goals (explicitly out of scope)
- Rebuilding Unburdening deletes (pipeline, auto-router, runtime proof gate, composer).
- A second Browser Developer toggle (AC-24 pointer stays).
- Research campaigns (R1–R4 playbooks stay parked — K9).
- Deleting `AC_AFTER.md` / `AC_BASELINE.md` / `LAMPREY_AUDIT_CLOSURE_PLAN.md` /
  `PSPR_TEMPLATE.md` / `AC_PARALLEL_HANDOFF.md`.
- Merging mid-round drains into `finalizeTurn`.
- Renaming the audit event `turn.interrupted` (K1).
- Authenticode / signed Windows builds (K2 — permanent non-goal).
- OpenWiki authored-page refresh (K6 — park empty).
- Live `supportsTools` probes of every catalog row (K7 — park).
- Graft graph init. `noUncheckedIndexedAccess`. M4 / Code Mode.

### Decision register (stances — locked)

| # | Decision | Stance | Rationale |
|---|---------|--------|-----------|
| K1 | Interrupt leftover | Keep audit event `turn.interrupted` and payload `disposition: 'interrupted'`. Settlement status is `cancelled`. Lock the pair in a test. | Historical activity rows + `event-presentation.ts`. Unifying the event name is a wider migration; not this phase. |
| K2 | Unsigned builds | Permanent non-goal. Do not schedule, imply, or “gap” them as unfinished work. | Cert acquisition is an owner action. Saying “unsigned” as a hole invites fake closure. |
| K3 | Spent plans | Move to `PLANNING/archive/`. Do not delete AC authority files. | History is the archive; the root is the live canon. |
| K4 | August catalog | Fold `AUGUST_2026_MODELS` into `catalog.ts`. Registry re-exports `MODEL_CATALOG` / `RETIRED_MODEL_MAP` only. Remove the overlay `push` loop. | One array, one story. Import-time mutation is a second authority. |
| K5 | Settlement tests | Behavioral settle tests that *call* the closer / interrupt / status predicates. Keep the existing WC-8 source-locks thin — do not grow them. | AC-1/2/3 proved shape. This phase proves motion. |
| K6 | OpenWiki | Park empty. No authored `openwiki/*.md` in this checkout is not a defect to paper over. | AC-33 already recorded `user-verification-needed`. Do not hand-edit generated pages. |
| K7 | `supportsTools` probes | Park. Needs owner keys. Do not claim the flags were live-probed. | Same as AC-42. |
| K8 | Version | **v0.30.0** (user override; not 0.29.1). | Seven leftovers + a catalog fold + an archive pass is a minor. |
| K9 | R1–R4 playbooks | Park explicitly in Current State and the OD-4 lock file. | Owner-run live research playbooks. Not this roster. |
| K10 | Tracks | One linear track. OD-0 → OD-14 in order. | No parallel worktrees. |

### Keep / Refuse
Do not rebuild Unburdening deletes. No second Browser Dev toggle. No
research campaigns. Do not delete AC authority files listed in Non-goals.
Do not merge mid-round drains into `finalizeTurn`.

### Verify gate (every prompt must pass before commit)
1. `npx tsc --noEmit -p tsconfig.node.json` — clean
2. `npx tsc --noEmit -p tsconfig.web.json` — clean
3. `npx vitest run <the test files this prompt touches>` — clean
4. Any prompt that touches `electron/ipc/chat.ts` also runs `npm run verify:proof -- --no-tests` — exits 0
5. Final phase gate (OD-14): full `npx vitest run` + `npm run build` + `npm run verify:proof`

### Commit discipline
- One commit per prompt. Present-tense imperative subject, ≤72 chars, prompt id in the subject.
- DEVLOG entry per prompt under `## 2026-08-23 — Operability Debt Phase`.
- No squashing across prompts. No co-author trailer.
- Owner footer on every commit, own line: `Authored and reviewed by Basho Parks, copyright 2026`
- Never `--no-verify`. If a hook fails, fix the underlying issue.

### Worktree / branch
- Branch: `feat/operability-debt` from `origin/main` (house name).
- This cloud session lands the same work on `cursor/operability-debt-d9c8` and merges to `main`.
- One linear track (K10).

### Completion criteria
1. All OD-0…OD-14 prompts `[x]`.
2. `package.json` version `0.30.0`.
3. `RELEASE_NOTES/v0.30.0.md` written.
4. Final gate green.
5. Commits on `main` or a PR merged to `main`.
6. Soft inventory S1–S7 closed. K1–K10 held.

### Approval state
- **APPROVED 2026-08-23** by Basho: full OD-0…OD-14, Bucket v0.30, push to
  main, do not stop until complete. K8 amended to **v0.30.0**.

---

## §1 — Prompt Roster

### **OD-0 — Lock the baseline**
- [x] Write `PLANNING/OD_BASELINE.md` with the same line-count method as
  `AC_BASELINE.md` / `AC_AFTER.md` (`fs.readFileSync` split on newlines).
  Record: `chat.ts`, `finalize-turn.ts`, `turn-interrupt.ts`,
  `tool-unlock-state.ts`, `tool-unlock-persist.ts`, `registry.ts`,
  `catalog.ts`, `catalog-august-2026.ts`, the four settlement/unlock test
  files, PLANNING markdown count at root (81 at `3e0fde9`). Inventory the
  seven leftovers as still-open. Commit this P-SPR + the baseline. No
  product edits.
- Verify: tsc ×2. No new tests.

### **OD-1 — Cap failure settles `failed` (behavioral)**
- [x] New `electron/services/headless-turn-settlement.test.ts`. Build a
  real `TurnRuntimeRegistry`, throw `ToolRoundCapError`, apply the same
  status rule `chat.ts` uses (`aborted || isUserAbortError` → `cancelled`,
  else `failed`), then call `finalizeTurn`. Assert settlement is `failed`,
  queue is withheld, documents/artifacts drain. Do **not** extract a new
  helper from `chat.ts`. Keep `chat-turn-settlement.test.ts` WC-8 thin —
  add no new source-reading cases there (K5).
- Verify: tsc ×2; `npx vitest run electron/services/headless-turn-settlement.test.ts electron/services/finalize-turn.test.ts electron/services/tool-round-cap-error.test.ts`

### **OD-2 — Cancel settles `cancelled`; event stays `turn.interrupted`**
- [x] Lock K1 in `turn-interrupt.test.ts` (or a short addition to
  `operability-debt-safety.test.ts` if OD-4 already created it — prefer
  extending `turn-interrupt.test.ts` so the pair lives next to the
  action). Assert: result `status === 'cancelled'`; recorded event
  `type === 'turn.interrupted'`; payload `disposition === 'interrupted'`.
  Keep `chat:cancel` awaiting `interruptTurn` (existing wiring lock).
  Do not rename the event.
- Verify: tsc ×2; `npx vitest run electron/services/turn-interrupt.test.ts electron/ipc/turn-interrupt-wiring.test.ts`

### **OD-3 — Closer queues only on `completed`**
- [x] Extend `finalize-turn.test.ts`: `cancelled` drains and withholds the
  queue (same as `failed`). `completed` still queues. Thin WC-8 in
  `chat-turn-settlement.test.ts` stays; do not add more source reads.
- Verify: tsc ×2; `npx vitest run electron/services/finalize-turn.test.ts electron/services/headless-turn-settlement.test.ts`

### **OD-4 — Honest gaps with teeth**
- [x] New `electron/services/operability-debt-safety.test.ts` source-locks:
  1. `electron-builder.yml` still has `signAndEditExecutable: false` (K2 —
     unsigned is a permanent non-goal, not a hole).
  2. `turn-interrupt.ts` still records `type: 'turn.interrupted'` and
     `disposition: 'interrupted'` while returning `status: 'cancelled'` (K1).
  3. CLAUDE.md / AGENTS.md Current State name R1–R4, live `supportsTools`
     probes, and OpenWiki as **parked** (not `user-verification-needed`
     unfinished work). Unsigned builds are named a **non-goal**, not a gap.
  4. `PLANNING/archive/` is allowed to be absent until OD-10; this prompt
     only locks the *wording* of the parked items once OD-7 has not yet
     run — so OD-4 writes the lock against the **post-OD-7** phrases and
     OD-7 must satisfy this file. If OD-4 lands first, lock the *intent*
     in comments and assert the current wrap paragraph still lists the
     four parked items (R1–R4, supportsTools probes, OpenWiki, unsigned)
     so a silent deletion is visible; OD-7 then flips the wording to
     parked/non-goal and updates this test in the same file if needed.
  Prefer: OD-4 asserts the four items are still *named* in CLAUDE.md
  Current State (so they cannot vanish). OD-7 changes “honest gap” /
  `user-verification-needed` to parked/non-goal and updates the same
  assertions to the new phrases.
- Verify: tsc ×2; `npx vitest run electron/services/operability-debt-safety.test.ts`

### **OD-5 — Mid-round drains are not the closer**
- [x] At both mid-round `drainPendingDocuments` / `drainPendingArtifacts`
  sites in `electron/ipc/chat.ts` (the no-tool-calls persist path and the
  stream-error persist path), add a short comment: these attach docs/
  artifacts to the in-flight assistant row; they are not turn-closers;
  `finalizeTurn` owns close-drain. Do not move or merge those calls into
  `finalizeTurn`. Source-lock the two comments in
  `chat-turn-settlement.test.ts` with one thin WC-8 case (allowed — it is
  a comment lock, not a new settlement proof).
- Verify: tsc ×2; `npx vitest run electron/ipc/chat-turn-settlement.test.ts`; `npm run verify:proof -- --no-tests`

### **OD-6 — Unlock persist fails loud**
- [ ] `createSqliteToolUnlockPersist().save` / `.clear` must not swallow
  unexpected SQLite errors. Missing-table during tests may still no-op
  *only when* the error message names a missing table; every other throw
  rethrows. `unlockTools` must not catch persist failures. Add a test:
  a persist `save` that throws fails `unlockTools` (in-memory set may
  already have the names — that is fine; the call must not return
  normally). Load may still return `[]` on missing table so hydrate
  stays safe; unexpected load errors rethrow.
- Verify: tsc ×2; `npx vitest run electron/services/tool-unlock-state.test.ts`

### **OD-7 — Sync CLAUDE.md / AGENTS.md Current State**
- [ ] Rewrite the Audit Closure Current State honest-gap clause to match
  K1/K2/K6/K7/K9: R1–R4 parked; live `supportsTools` probes parked;
  OpenWiki parked (empty checkout); unsigned builds permanent non-goal;
  `turn.interrupted` is a kept event name, not a leftover hole.
  Native-DB CI first Actions run is closed (2026-08-23 commit on main) —
  drop that `user-verification-needed` if the wrap paragraph still has
  it. Do not add a v0.30.0 Current State entry yet (OD-14). Update
  `operability-debt-safety.test.ts` assertions to the new phrases.
- Verify: tsc ×2; `npx vitest run electron/services/operability-debt-safety.test.ts`

### **OD-8 — Fold August rows into `catalog.ts`**
- [ ] Append the twelve `AUGUST_2026_MODELS` descriptors to
  `MODEL_CATALOG` in `electron/services/providers/catalog.ts` (no row
  edits to existing entries). Drop the “Mechanical extract… No row
  edits” comment or rewrite it to “canonical catalog including the
  August 2026 first-party rows.” Do not delete the overlay file yet
  (OD-9). Catalog invariants must still pass after the append even if
  the overlay also pushes (duplicate-id guard in the overlay already
  skips). Prefer appending then immediately relying on id uniqueness.
- Verify: tsc ×2; `npx vitest run electron/services/providers/catalog-august-2026.test.ts electron/services/providers/catalog-invariants.test.ts`

### **OD-9 — Thin registry; delete the overlay**
- [ ] Remove `AUGUST_2026_MODELS` import and the `MODEL_CATALOG.push`
  loop from `registry.ts`. Delete `catalog-august-2026.ts`. Retarget
  `catalog-august-2026.test.ts` at `MODEL_CATALOG` (keep the twelve ids
  and the Anthropic / guard-pairing cases). Registry still re-exports
  `MODEL_CATALOG` and `RETIRED_MODEL_MAP` only. No other overlay remains.
- Verify: tsc ×2; `npx vitest run electron/services/providers/catalog-august-2026.test.ts electron/services/providers/catalog-invariants.test.ts`

### **OD-10 — Archive spent PLANNING trees**
- [ ] Create `PLANNING/archive/`. `git mv` every spent `PLANNING/*.md`
  except the keep list below. Do **not** delete. Add
  `PLANNING/archive/README.md` naming the keep list and saying these
  files are reference-only.
  **Keep at `PLANNING/` root:** `README.md`, `PSPR_TEMPLATE.md`,
  `LAMPREY_AUDIT_CLOSURE_PLAN.md`, `AC_AFTER.md`, `AC_BASELINE.md`,
  `AC_PARALLEL_HANDOFF.md`, `LAMPREY_OPERABILITY_DEBT_PLAN.md`,
  `OD_BASELINE.md`, `LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md`,
  `CJ26_AFTER.md`, `CJ26_FOLLOW_ON_CANDIDATES.md`.
  Everything else at `PLANNING/*.md` moves. Update in-repo links that
  would 404 (CONTRIBUTING.md → archive path for FINAL; pre-push-scope
  tests still match `PLANNING/` prefix so they stay green).
- Verify: tsc ×2; `node scripts/pre-push-scope.test.cjs` if present; no product tests required.

### **OD-11 — PLANNING README pointer**
- [ ] Rewrite `PLANNING/README.md` so the live canon is this phase +
  Audit Closure authority + the Codex July 2026 parity ledger. Point at
  `archive/` for spent trees. Do not claim current-Codex parity.
- Verify: tsc ×2. Docs only.

### **OD-12 — Write `OD_AFTER.md`**
- [ ] Same measurement method as OD-0. Record after line counts, that
  `catalog-august-2026.ts` is gone, PLANNING root markdown count, and
  each soft-inventory row as closed. No version bump.
- Verify: tsc ×2.

### **OD-13 — Release notes**
- [ ] Write `RELEASE_NOTES/v0.30.0.md` in the same plain voice as
  `RELEASE_NOTES/v0.29.0.md`. Name settlement tests, parked gaps,
  persist loud-fail, one catalog, archive. No marketing verbs.
- Verify: tsc ×2.

### **OD-14 — Phase wrap**
- [ ] Full gate: lint, tsc ×2, full vitest, build, `verify:proof`.
  Bump `package.json` (and lock if it carries version) to **0.30.0**.
  Add Operability Debt to CLAUDE.md + AGENTS.md Current State. README
  “New in v0.30.0”. DEVLOG phase-complete entry with house tail.
  Mark every roster prompt `[x]`. Bucket is the owner’s Windows
  `pwsh scripts\bucket.ps1` — this cloud session cannot finish R2
  upload; leave `main` green so local Bucket can run.
- Verify: final phase gate (§0 item 5)

---

Authored and reviewed by Basho Parks, copyright 2026
