---
name: lamprey-research-frontier
description: The two open problems where Lamprey could advance the state of the art — the cheap-model harness thesis (harness engineering makes budget models perform like frontier models) and safe local autonomy (unattended desktop loops with hard ceilings and full local audit) — with why current SOTA fails, this repo's specific assets, the first three concrete steps for each, and falsifiable "you have a result when…" milestones. Load when planning research-flavored work or deciding what is worth proving next.
---

# Lamprey Research Frontier

## When to use / when not

- **Use** when choosing research direction, scoping an experiment, or checking whether a result claim is earned yet.
- **Don't use** for the method discipline (see `lamprey-research-methodology`), the loop test protocol (see `lamprey-loop-reliability-campaign`), or claims wording (see `lamprey-docs-and-writing`).

Both problems below are user-confirmed as the project's ambition (2026-07-02). Everything here is labeled **open/candidate** — nothing is a result yet.

---

## Problem 1 — The cheap-model harness thesis

**Claim to prove:** harness engineering (context hygiene, prompt discipline, structural gates) can make budget models — DeepSeek V4, Qwen 3.x, GLM 5.2, at cents per Mtok — perform agentic coding work at a level users would attribute to frontier models.

**Why current SOTA fails to answer this:** public leaderboards measure raw-model benchmark scores, not *harness-mediated* behavior on a real repo with tools, approvals, and multi-round turns. Most harnesses are model-agnostic and untuned per model class; nobody publishes longitudinal "same harness, tightened context, same asks" curves.

**This repo's specific assets:**
- A five-provider registry with per-model capability flags — the same harness genuinely drives all of them (`lamprey-provider-and-model-reference`).
- A measured tuning history: the Lampshade→Hygiene→Cogency→Sweet-Spot→Unburdening arc already produced longitudinal data (prompt bytes vs behavioral outcomes across versions — the BASELINE/AFTER docs in `PLANNING/`).
- A repeatable behavioral benchmark: the LL 8-ask playbook with per-ask binary signals (`PLANNING/LL_SMOKE_PLAYBOOK.md`).
- Real token/cost accounting per turn (JM-12) and a full reasoning audit trail for qualitative failure analysis.

**First three concrete steps in this repo:**
1. Formalize the playbook into a scored rubric: each of the 8 asks decomposed into binary signals (they mostly already are), a per-ask score, a pinned configuration block (model, settings, workspace state). Deliverable: a proposal doc — note that adding `PLANNING/BENCHMARK_BASELINE.md` is a repo change outside `.claude/skills/`, so it goes through `lamprey-change-control` (propose, get approval).
2. Run the rubric across the 5-provider × default-settings matrix on one pinned build; record score + cost per run (three repetitions per cell — single runs of stochastic systems are anecdotes).
3. Add the cost axis: tokens and $ per passed ask, using the JM-12 accounting, so the thesis becomes "quality per dollar", which is the actually novel claim.

**You have a result when:** a named budget model, at ≤ some stated fraction of frontier per-token cost, passes ≥ N/8 playbook asks *reproducibly across 3 runs* under a pinned configuration — where the same model failed those asks under a documented earlier configuration. The delta must be attributable to harness changes (same model, same asks, config diff documented).

**Falsifier (state it honestly):** if across providers the score tracks model tier regardless of harness configuration — i.e., tightening context/prompts moves nothing the model class didn't already determine — the thesis is false, and the honest publishable finding is "harness tuning has bounded effect; model class dominates." That is also a result.

**Do not claim publicly before:** the 3-run reproducibility bar is met and the configuration is pinned in a committed doc (`lamprey-docs-and-writing` claims discipline).

---

## Problem 2 — Safe local autonomy

**Claim to prove:** an unattended desktop agent loop can run on a user's own machine safely — hard ceilings that actually bind, duplicate-free execution, crash recovery, and a complete after-the-fact audit from local tables alone — with the safety machinery as the contribution.

**Why current SOTA fails to answer this:** hosted agent platforms assume server-side sandboxes, external orchestrators, and vendor-side logging. Local-first desktop autonomy with *verifiable* ceilings (working-time, iteration, token), OFF-by-default posture, and reconstructable local audit is under-explored and under-documented. "It ran overnight and seemed fine" is the current state of the art in most local agent tooling.

**This repo's specific assets:**
- The post-JM loop subsystem: every entry point gated by a master toggle (source-locked), in-flight mutex, sequential wake-up drain, `active_ms` working-time ceilings, crash-recovery sweep, transactional iteration commits (`lamprey-failure-archaeology` #5).
- Full local audit surfaces: `loops`/`loop_runs`/`loop_wakeups`/`tool_calls`/`events` + the reasoning trace (`lamprey-diagnostics-and-tooling`).
- A deliberate safety posture to measure against: ships OFF by default, era-faithful when off.

**First three concrete steps in this repo:**
1. Execute `lamprey-loop-reliability-campaign` phases 1–4 (static + live interval + self-paced/autonomous + ceilings) and record the results as a dated AFTER doc.
2. Define the autonomy-safety scorecard from the tables: ceiling adherence (0 violations), duplicate rate (0 overlapping runs by timestamp), recovery success (orphaned runs settled on relaunch), audit completeness (every iteration reconstructable from rows alone). All four are computable from `loop-state.cjs`/`db-health.cjs` output.
3. Run the campaign's Phase 6 bounded soak (24h machine-uptime, synthetic 20-task backlog) against that scorecard.

**You have a result when:** a documented 24h soak shows 0 ceiling violations, 0 duplicate iterations, 100% crash-recovery settlement, and a complete audit reconstruction — with the raw DB preserved so the reconstruction is checkable by someone else.

**Falsifier:** any silent ceiling breach, unexplained iteration, or audit hole that requires app logs (not tables) to explain. One such hole means the audit-completeness claim dies and gets redesigned, not re-worded.

**Do not claim publicly before:** the soak milestone, and never phrase autonomy claims without the OFF-by-default caveat.

---

## Interaction between the two problems

The soak (Problem 2) is also a cheap-model endurance test (Problem 1): autonomous-mode cogency (does the model use `loop_enqueue`/`loop_complete_task` sensibly over hours?) is exactly the harness-vs-model-class question. Record model id and per-iteration behavior in every soak; the datasets pay twice.

## Provenance and maintenance

Framing user-confirmed 2026-07-02; assets verified against the repo at v0.16.0 (playbooks, baseline docs, loop test suite, accounting). All milestones are open — nothing here has been achieved yet.

Re-verify:
- Playbook + baselines still present: `ls PLANNING/LL_SMOKE_PLAYBOOK.md PLANNING/*_BASELINE.md`
- Loop campaign preconditions: see `lamprey-loop-reliability-campaign` Phase 0
- Whether a benchmark doc now exists (someone may have done step 1): `ls PLANNING/*BENCHMARK* 2>/dev/null`
