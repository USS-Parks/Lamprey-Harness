---
name: lamprey-docs-and-writing
description: Maintaining Lamprey's documents of record — CLAUDE.md, DEVLOG.md, README.md, ARCHITECTURE/, PLANNING/ — with the exact DEVLOG entry template, the README-on-every-ship checklist, commit-message house style, the no-slop/no-fake-polish doctrine, and the rules for what may be claimed publicly. Load when writing any DEVLOG/README/plan/commit text, wrapping a phase, or making public claims about the project.
---

# Lamprey Docs & Writing

## When to use / when not

- **Use** when writing DEVLOG entries, README updates, plan documents, CLAUDE.md updates, commit messages, or anything public-facing.
- **Don't use** for the change-control rules themselves (see `lamprey-change-control`) or release mechanics (see `lamprey-ship-and-release`).

## The document hierarchy (one home per fact)

| Doc | Role | Rules |
|---|---|---|
| `CLAUDE.md` | live current-state source of truth | updated at every phase wrap; when material drift is found, correct it (the JM-30 precedent) — but historical phase entries are never rewritten, they're marked historical |
| `DEVLOG.md` | append-only build history | one entry per prompt/release; never edited after commit |
| `README.md` | public landing page | updated on **every** ship — standing rule, "This is where the main release updates go. Always." |
| `ARCHITECTURE/*.md` | deep wiring docs | wiring claims cite real call sites ("Invoked from: `<file>:<line>`" — the WC-9 standard); `MECHANICAL_PROOF.md` is historical |
| `PLANNING/*.md` | P-SPRs + baseline/after measurement docs | reference-only once shipped; corrections are **appended as notes**, never edited in place (WC-10 precedent) |

## DEVLOG entry template (use verbatim)

```markdown
## [Phase Name — Prompt XN] <Title>  —  <YYYY-MM-DD>

**Files changed:** <list>
**Verify gate:**
- tsc node ✓
- tsc web ✓
- vitest <subset> ✓ (N tests)
- <manual smoke steps + result, OR "user-verification-needed: <what to check>">

**Notes:** <anything surprising, deferred, or worth knowing>

**Commit:** <SHA>
```

Rules: plain-text dates, real SHAs, append-only. A phase-wrap entry additionally records the full final gate line: `lint OK · tsc node+web OK · vitest N passed / M skipped · build OK · verify:proof exit 0`, plus **honest gaps** (below).

## README-on-every-ship checklist

1. Download section: heading + table URLs point at the new version's release.
2. "New in vX.Y.Z" paragraph — plain summary of what shipped (template: 3–6 concrete items, no marketing verbs).
3. Quick start link still resolves.
4. Roadmap: new top entry / completed items moved.
5. Any claim added is repo-verifiable (see claims discipline below).

## Commit-message house style

Mirrors the hook (`lamprey-change-control` has the full enforced list): subject states the change in ≤72 chars; body ≤12 lines; the required trailer; no filler openers, no assistant voice, no `Key changes:` headers. **Long explanations belong in DEVLOG.md, not the commit.** Write like a person: "Fix the vec-row leak in deleteCollection", not "This commit updates the deletion logic to seamlessly…" (three banned words in one clause).

## The no-slop / no-fake-polish doctrine

- Broken glyphs, fabricated "verified" comments, and status lines that misreport reality all read as **fake** — deliver, or state the limit plainly.
- Never write "verified"/"tested" for something not actually run in this session. If a check needs the GUI or the owner, write `user-verification-needed: <what to check>` — that phrase is the house convention.
- **Honest gaps** are a first-class deliverable: every phase wrap lists what is unproven, deferred, or owner-action. Unproven things stay labeled open/candidate everywhere they're mentioned.
- The staged-diff scan (`scripts/check-ai-artifacts.cjs`) mechanically rejects elision placeholders, placeholder secrets, and narration comments in code — don't write them in docs either (docs are exempt from the hook, not from the standard).

## Plan-document house style (P-SPR)

Follow `PLANNING/PSPR_TEMPLATE.md`: §0 governance (goal, scope, non-goals, verify gate, commit discipline, worktree, completion criteria, **approval state**) + §1 ordered prompt roster (deliverable, files, verify per prompt). Measurement phases pair it with `<PHASE>_BASELINE.md` before work and `<PHASE>_AFTER.md` after (see `lamprey-research-methodology`). Corrections post-ship: append a dated correction note.

## External claims discipline (papers, releases, README, social)

- Every public claim needs a repo-verifiable receipt: test counts from an actual run, `npm audit --omit=dev` output, measured byte counts, playbook results with the configuration pinned.
- What must be proven before claiming, by claim type:
  - "X works" → the gate run + (if behavioral) a playbook or live smoke.
  - "X is safe/gated" → the source-lock test that locks it.
  - "X is faster/smaller" → BASELINE and AFTER numbers, same method both sides.
  - Research-flavored claims (cheap-model performance, autonomy safety) → the falsifiable milestone defined in `lamprey-research-frontier`, met and reproducible.
- Unsigned-builds status, unverified-on-live-install items, and other honest gaps are disclosed, not hidden — the project's credibility asset is that its records are true.

## Templates

**Phase-wrap DEVLOG tail:**
```markdown
**Final gate:** lint OK · tsc node+web OK · vitest <N> passed / <M> skipped / 0 failed · build OK · verify:proof exit 0
**Honest gaps:** <bulleted; or "none">
```

**README "New in" paragraph:**
```markdown
**New in vX.Y.Z** — <one-sentence theme>. <3–6 concrete items, comma-separated or bulleted>. <Any user-action note, e.g. re-enter keys / re-run installer>.
```

**Plan correction note:**
```markdown
> **Correction (YYYY-MM-DD):** <what the plan said> — <what turned out to be true>, see DEVLOG <date> / commit <SHA>. Original text left as written.
```

## Provenance and maintenance

Based on `PLANNING/PSPR_TEMPLATE.md`, recent DEVLOG entries, README.md structure, the commit-msg hook, and the standing README-on-ship rule, at v0.16.0 (2026-07-02).

Re-verify:
- DEVLOG format: read the top 2 entries of `DEVLOG.md`
- README sections: `grep -n "^#\|^##" README.md`
- Hook wording: `cat scripts/hooks/commit-msg`
- Template: `ls PLANNING/PSPR_TEMPLATE.md`
