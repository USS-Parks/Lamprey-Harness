---
name: lamprey-research-methodology
description: The discipline that turns a hunch into an accepted result in Lamprey — the evidence bar (one mechanism explains all observations including negatives, and survives refutation), numbers predicted before running, the full idea lifecycle from hunch to adopted change or documented retirement, and where good ideas historically came from. Load when starting any investigation or improvement effort, or when tempted to act on a hypothesis that hasn't earned it yet.
---

# Lamprey Research Methodology

## When to use / when not

- **Use** at the start of any investigation or improvement idea, and whenever deciding whether a hypothesis has earned action.
- **Don't use** for the individual proof techniques (see `lamprey-proof-and-analysis-toolkit`), the change gates themselves (see `lamprey-change-control`), or the open problem statements (see `lamprey-research-frontier`).

## The evidence bar

A hypothesis is accepted here only when:

1. **One mechanism explains ALL observations — including the negatives.** If your explanation covers why it fails on Tuesday but not why it worked on Monday, it isn't the mechanism yet.
2. **It survives adversarial refutation.** Someone (you, wearing the other hat) actively tries to kill it: alternative mechanisms enumerated and discriminated against, suspicious tests inverted (toolkit recipe 7), the claim's negative space checked.
3. **It predicted numbers before the run.** A hypothesis that only "explains" after seeing the data is a narrative, not a result.

**Worked example — a fix hypothesis correctly killed (CR-6):** the plan assumed the intermittent reviewer verdict-line (F5) was a contract regression and scheduled a contract fix. The pre-fix re-run showed 4/4 verdict-line hits once the reviewer-packet bug (v0.11.1) was fixed — the single mechanism (missing work product in the packet) explained both the verdicts *and* their timing. CR-6 shipped as a documented **no-op**. Killing your own planned fix on evidence is the bar working.

**Worked example — mechanism must explain the green CI (v0.11.1):** any root-cause story for "reviewer always says CHANGES" also had to explain why CI stayed green. The answer (two tests codified the defect) was part of the mechanism, not a footnote — and produced its own fix.

## Numbers before running (the BASELINE pattern)

Before changing anything, measure and write down the current state, and state what the change should do to those numbers:

- Lampshade: baseline measured **~2,725 tokens** of operator instruction per coding turn and an 11,016-byte reviewer prompt *before* any edit; the L2 result (9,311 → 2,113 bytes, −77.3%) is meaningful only against that.
- Hygiene: predicted and then measured **−63.8%** tool-schema bytes/turn.
- July Maintenance: the audit recorded the failing baseline table (1 flaky test, 1 critical + 4 high audit vulns, obsolete Electron pin) before remediation; the wrap could then claim 0/0/current with receipts.

Mechanics: `PLANNING/<PHASE>_BASELINE.md` before, `<PHASE>_AFTER.md` after, same method and units both sides; misses reconciled honestly (CR_AFTER §1 reconciled a budget overshoot instead of hiding it). Full recipe: `lamprey-proof-and-analysis-toolkit` recipe 8.

## The idea lifecycle

```
hunch
  → read the archaeology (is this settled? — lamprey-failure-archaeology)
  → read-only discovery/audit pass (documented-vs-wired if the idea assumes a capability)
  → BASELINE doc (numbers + method)
  → P-SPR with predicted outcomes + per-prompt verify gates
  → explicit user approval                    ← nothing lands before this
  → STS execution (verify + DEVLOG + commit per prompt)
  → AFTER doc (same method) + playbook re-run if behavior-shaped
  → outcome:
      ADOPTED   → CLAUDE.md current-state entry + DEVLOG wrap
      RETIRED   → documented retirement with rationale kept forever
```

**Retirement is a first-class outcome, not a failure.** The canonical case: the multi-agent pipeline was fully built, instrumented, measured across four phases — and then deliberately deleted (Unburdening, v0.14.0) with its rationale recorded, because the evidence said the era-faithful single-agent product was better. The record of *why* it was retired is what stops the idea being expensively rediscovered (see `lamprey-failure-archaeology` #8).

Experiments run as **opt-in flags with era-faithful defaults** while under evaluation (`loopsEnabled` is the template — OFF by default through the entire evaluation period, and still).

## Where good ideas historically came from (verifiable in DEVLOG)

1. **Dogfooding pain, stated by the user** — "Lamprey is still tortured…" produced the Unburdening; "incorporate a Looping option" produced the Loop phase. User phenomenology outranks theory.
2. **Live playbook runs** — the F-code catalog came from actually running the 8 asks, not from code reading; it drove two full phases (CR, SP).
3. **Docs-vs-code cross-audits** — Wiring Closure and the July audit both came from systematically distrusting documentation (toolkit recipe 2).
4. **Direct comparison against the reference product** — the Hygiene phase came from auditing the real Claude Code harness side-by-side and noticing the differentiators were context hygiene and philosophy, not features.
5. **Incident follow-through** — v0.9.2's detection-gap fix (skip accounting) arrived two phases after the incident because the postmortem named it (toolkit recipe 5).

## New-idea intake checklist (junior-runnable)

1. Write the hunch in one sentence, plus the observation that triggered it.
2. Check `lamprey-failure-archaeology` — settled? rejected? already retired?
3. Check the era-lock: does this exist in the Opus 4.5-era product? If not → it needs explicit user authorization before any planning-beyond-a-proposal (`lamprey-change-control`).
4. State the mechanism and what it predicts — numbers, not adjectives.
5. Design the discriminating measurement (which toolkit recipe applies?).
6. Run the read-only discovery pass; write the BASELINE if proceeding.
7. Draft the P-SPR; present; **stop until approved**.
8. After execution: AFTER doc, playbook re-run if behavioral, DEVLOG wrap, and the adopted/retired verdict — in writing either way.

## Provenance and maintenance

Distilled from the repo's own record: CR-6 no-op (CR plan + CR_AFTER), v0.11.1 postmortem, LL/HY baseline-after pairs, the Unburdening rationale, and the JM audit's baseline table — all present in `PLANNING/` and `DEVLOG.md` at v0.16.0 (2026-07-02).

Re-verify:
- Baseline/after pairs: `ls PLANNING/*_BASELINE.md PLANNING/*_AFTER.md`
- The CR-6 no-op record: `grep -n "CR-6" PLANNING/LAMPREY_COGENCY_RESTORE_PLAN.md PLANNING/CR_AFTER.md | head`
- Lifecycle gates unchanged: CLAUDE.md Execution Rules
