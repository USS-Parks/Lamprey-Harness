# TL_CLAUDE_CODE_INVENTORY.md — Claude Code vs Lamprey (Lane A)

**Prompt:** TL-A1 (preamble). Matrix lands in TL-A2. Scoreboard in TL-A3.
**Lamprey tip at pin:** `8364ba3` (`origin/main`) / working branch `feat/triple-lane` after TL-0 `2c5e4b5`
**package.json:** `0.30.1`

## Evidence pin (K2)

No product deltas until this pin exists.

| Field | Value |
|-------|-------|
| Product | Claude Code (Anthropic) |
| Pinned version | **2.1.241** |
| Release published | 2026-08-23 00:52:16 UTC (`v2.1.241` GitHub tag) |
| Evidence date | **2026-08-23** |
| Channel | Latest GitHub release of `anthropics/claude-code` (not Homebrew `claude-code` stable-lag cask) |
| What 2.1.241 itself shipped | Bug fixes and reliability only. Surface inventory uses 2.1.x docs + changelog through 2.1.241. |

### Sources (fetched 2026-08-23)

1. GitHub release: https://github.com/anthropics/claude-code/releases/tag/v2.1.241
2. Changelog (repo main): https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
3. Docs changelog: https://code.claude.com/docs/en/changelog
4. Product overview (surfaces + capabilities): https://code.claude.com/docs/en/overview
5. In-repo historical Claude/Codex toolset notes: `PLANNING/archive/CODEX_TOOLSET_PARITY_RESEARCH.md` (dated 2026-06-01; **not** the live pin)
6. CJ26 seed: `PLANNING/CJ26_FOLLOW_ON_CANDIDATES.md` row `LAMPREY_CLAUDE_CODE_REFRESH_PSPR.md`

### Honesty

- This cloud session did **not** run a local `claude --version`. The pin is the public GitHub tag + docs, not an installed binary on this VM.
- Claude Code 2.1.x is **past** Lamprey's Opus 4.5 era-lock (2025-11-24 → 2026-01-24). Lane A may *inventory* post-era surfaces. Product deltas still need High-ROI **and** Low/Med risk (K3), and must not revive Unburdening deletions or CJ26-parked items (Computer Use, Chrome-profile control, Record/Replay, remote handoff, Office/Sites).

Authored and reviewed by Basho Parks, copyright 2026
