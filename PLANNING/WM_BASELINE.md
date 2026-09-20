# WM_BASELINE.md — Workspace World Model Phase baseline (WM-0)

Recorded 2026-09-20 at v0.33.1, commit `0888750` (origin/main tip at phase start), before
any WM code. Companion to `PLANNING/LAMPREY_WORLD_MODEL_PLAN.md`. Paper: GAVEL,
arXiv:2609.19315.

## 1. Approval record

The plan was approved by the owner on 2026-09-20 with STS instruction, with two explicit
overrides of the plan's §0 text:

- Push policy: commit AND push to `main` after every verified successful prompt (the
  plan's "no push until the wrap prompt" line is superseded by the owner's instruction).
- Branch: work proceeds on the session branch `claude/lamprey-harness-pspr-vltrbb`
  with each prompt's commit pushed to both that branch and `main` in one push
  invocation (the plan's `feat/workspace-world-model` line is superseded; a separate
  feature branch that never diverges from main would be ceremony).

Era-lock: this phase is the third deliberate extension past the Opus 4.5 era-lock, per
the owner's direction that long-horizon parity with the paper is the phase's point.
Defaults ship ON (`workspaceWorldModel: 'full'`); `'off'` is the escape hatch and is
locked byte-compatible with today's dispatch (WM-16).

## 2. Toolchain baseline (this session, cloud Linux container)

- `npx tsc --noEmit -p tsconfig.node.json` — clean
- `npx tsc --noEmit -p tsconfig.web.json` — clean
- `npx vitest run` — **318 files, 3314 passed / 4 skipped / 0 failed**, 34.8s
- better-sqlite3 native binding loads under Node 22 (`npm rebuild better-sqlite3` was
  required once after `npm ci`'s electron-rebuild postinstall failed in the container;
  the Node-ABI rebuild is what vitest needs, and the native-DB cohort RUNS here)
- Hooks installed (`npm run hooks:install`): pre-commit = artifact scan + lint + tsc ×2;
  commit-msg = owner trailer + subject/body caps + slop denylist; pre-push = verify:proof

## 3. Mapping anchors (file:line, verified by direct read this session)

| Concept | Anchor |
| --- | --- |
| Per-call dispatch seam | `electron/services/chat-tool-dispatch.ts:62` (`resolveSingleToolCall`) |
| Current dispatch order (the byte-baseline for the `'off'` lock) | parse args (:74) → object check (:95) → empty-params guard (:101) → unknown-tool check (:129) → schema validation (:137) → tool_search branch (:157) → audit start (:159) → plan-mode gate (:209) → shell inspection (:212) → approval (:238) → hooks → native/MCP dispatch (:278) → audit end |
| WM-3 insertion point (per-call VALIDATE) | after schema validation / tool_search branch, i.e. after `chat-tool-dispatch.ts:157`, before the audit-start block at :159 |
| Batch seam (WM-5 rollforward) | `electron/services/chat-tool-dispatch.ts:355` (`resolveToolCallWindows`), before the window loop at :365 |
| Turn entry (WM-7 extraction, per-turn state reset) | `electron/ipc/chat.ts:513` (`runHeadlessTurn`); prompt assembly :547-:664 |
| Final-answer branch (WM-9 follow-through hook) | `electron/ipc/chat.ts:1052` (`if (!effectiveToolCalls …)`) |
| Continuation-round precedent to copy | corrective round `chat.ts:1008-1048` (JM-10) and steering continuation `chat.ts:1081-1121` — save rows, push messages, recurse `runChatRound` with `round + 1`; `MAX_TOOL_ROUNDS` remains the hard cap (`chat.ts:832`) |
| Patch grammar + applier | `electron/services/apply-patch-tool.ts:71` (`parsePatch`), :217 (`applyHunk`), :267 (`applyOps` pre-validation: escape / add-exists / update-delete-missing), :323 (`executeApplyPatch`) |
| Path confinement | `apply-patch-tool.ts:49` (`resolvePathWithinWorkspace`) |
| Mutation authority | `electron/services/tool-registry.ts:135` (`mutates` field), :165 (`isMutatingDescriptor`), default derivation :301 |
| Per-conversation state pattern | `electron/services/tool-unlock-state.ts` (in-memory maps + clear-on-delete + test reset) |
| Shell danger inspection (reused, not extended) | `electron/services/dangerous-command-policy.ts:150` (`inspectShellCommand`) |
| Goal store (GA milestone, WM-8 substrate) | `electron/services/plan-goal-persistence.ts` (`loadGoals` :136, `upsertGoal` :180; lifecycle/blocker/completion columns already present) |
| Deterministic command runner (goal predicates) | `electron/services/verify-workspace-tool.ts` (bounded commands, receipts, previews) |
| Model tool surface | `electron/services/core-tool-names.ts:8` (`CORE_SURFACE_NAMES`) |

## 4. Architecture finding that shapes the design (WM-0 discovery)

**Lamprey has no native `read_file` / `list_dir` / `grep` tools.** The model's file
interface is `shell_command` (cat / Get-Content / sed / grep), `apply_patch`,
`workspace_context`, and `view_image`. (`subagent-types.ts:44` allowlists
`read_file` / `grep_search` / `glob_search` — names that resolve to nothing in the
registry; historical.) Consequences, decided now:

1. **The live filesystem is the authoritative graph.** Unlike GAVEL's robot, Lamprey can
   consult ground truth at validation time for free. Preconditions checked directly
   against the filesystem (exists / absent / parent-exists / within-workspace /
   hunk-anchors-against-current-bytes) are authoritative. The apply_patch **dry run** —
   parse the patch and anchor every hunk against current file bytes (or the batch
   overlay) before dispatch — is the strongest single check in the phase and predicts
   the exact "patch did not apply at hunk N" failure class before execution.
2. **The observation ledger is evidence, not a gate.** Shell-read attribution (which
   files a `cat`-class command observed) is best-effort parsing and MUST NOT produce
   false-positive blocks. It feeds verdict evidence, staleness notes, and the search
   ledger. A "you have not read this file" claim appears in a verdict only as context,
   never as the sole reason to refuse a call whose direct checks pass.
3. **Shell effect attribution is three-tier:** known-read heads observe; known-write
   heads (redirection, tee, mv, cp, rm, touch, mkdir, sed -i, Set-Content, Out-File,
   New-Item, Remove-Item, git checkout/restore/apply) invalidate their attributable
   paths in the overlay; everything else (npm/node/make/…) marks an unattributed-
   mutation timestamp used only as verdict evidence. This keeps the false-positive rate
   near zero, which is the property that keeps the gate trustworthy.

## 5. Metric definitions (fixed before any code)

- **First-dispatch validity (FDV):** over all `mutates: true` tool calls in a run, the
  fraction whose FIRST dispatch ends with audit status `done` (not `error` / `denied`).
  Source: the `tool_calls` table.
- **LLM calls per completed task (LPC):** provider round-trips (`runChatRound`
  invocations that reach the provider) divided by bench tasks whose goal predicates all
  pass.
- **Bench success:** all of a task's goal predicates pass after the turn (and any
  follow-through rounds) settle. Single and multi benches reported separately.
- **Continuation rounds used (CRU):** follow-through rounds consumed per task (0 when
  the first settle already meets the goals).
- **Intervention counts:** world-model verdicts, repairs, downgrades per task.
- **Net tokens per completed task:** `tokensEstimate` from `runHeadlessTurn` divided by
  completed tasks.

## 6. Pre-registered pass margins (per lamprey-research-methodology: written before any run)

On the WM-15 bench with Qwen3-8B via Ollama, five seeds, the phase's live claim PASSES
only if all four hold:

1. `'full'` beats `'off'` on multi-task bench success by **≥ 25 points absolute**.
2. `'full'` beats `'off'` on single-task bench success by **≥ 20 points absolute**.
3. `'repair'` beats `'verify'` on single-task success by **≥ 8 points absolute** at
   equal-or-fewer LLM calls per completed task (the gavel-basic finding).
4. `'full'` LPC ≤ `'verify'` LPC on tasks both complete (repair must not cost extra
   model calls; that is its entire point).

Complementarity check (Experiment 3 analog): one frontier-keyed model row; expected
observation is that `'full'` does not reduce its success and closes residual
applicability failures. No margin is registered for it; it is reported as observed.

Replay-suite claims (CI-provable this session): the WM-16 zero-delta locks pass; the
recorded failure corpus shows the repair tier resolving 100% of the mechanically
derivable class (anchor-whitespace, missing-parent, wrong-separator, workspace-relative
resolution) without a model round trip, because that class is deterministic by
construction. Live-model claims wait for the owner's Ollama runs; misses get recorded
as misses in WM_AFTER.md.

## 7. Live-capture protocol (owner-run; feeds WM-16 fixtures)

1. Build and launch Lamprey with Ollama serving `qwen3:8b`; select it as the chat model.
2. Set `workspaceWorldModel: 'off'` (post-WM-13 the Settings toggle; before that,
   settings.json).
3. Run the 10 capture asks (5 single-step edits, 3 multi-file changes, 2 multi-part
   instructions) listed in WM_SMOKE_PLAYBOOK.md §capture against a scratch clone of any
   small repo.
4. Export per-ask transcripts (messages + tool_calls rows) with
   `.claude/skills/lamprey-diagnostics-and-tooling/scripts/db-health.cjs` guidance;
   deposit JSON under `bench/wm/replay/captured/`.
5. Until that lands, WM-16 ships with synthetic transcripts labeled `synthetic: true`
   in each fixture header; the suite treats the two identically.

## 8. Dispatch-order byte baseline

The `'off'` lock (WM-16) asserts the order in §3 row 2 is unchanged: source text of
`resolveSingleToolCall` and `resolveToolCallWindows` contains the world-model call
sites ONLY behind the `workspaceWorldModel` setting read, and with the setting `'off'`
the function bodies execute the identical sequence recorded here.

---

Authored and reviewed by Basho Parks, copyright 2026
