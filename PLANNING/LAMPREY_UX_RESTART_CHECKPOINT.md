# Lamprey UX restart checkpoint - 2026-09-06

User requested standby to restart the app with astra-advisor. All forty prompts and v0.33.0 STS/Bucket remain authorized; pause execution until the user resumes. Use Codex UX for unsettled design choices. Do not ask again for the existing scope.

## Resume

Canonical checkout: C:/Users/17076/Documents/Claude/Lamprey Harness, branch codex/ux-simplification. Read the canonical UX PSPR and latest DEVLOG first. UX-00 through UX-30 are locally complete. The introducing commit of evidence/ux-simplification/UX30.json identifies this checkpoint. Next implementation: UX-31 control density/motion, then UX-32 responsive accessibility, UX-33 measurement, UX-34 measured fixes, UX-35 integration, UX-36 source certification, UX-37 metadata, UX-38 Bucket, UX-39 closeout.

Remote main is 801660ea9324d09b65cf83bfe1615048e60a08c2 (UX-24), all 3 workflows and 10 checks green; UX24_HOSTED.json records it. Publication queue in order: UX-25 c6fc60d, UX-26 fcc774c, UX-27 b4708ba, UX-28 d2116ed, UX-29 862de0f, UX-30 checkpoint. Push each exact prompt SHA to main with normal hooks, checking all hosted checks before advancing. Do not squash, force push or call the unpublished commits shipped. Resume publication before accumulating more local commits.

UX-30 passed full proof: 3,124 tests, 176 explicit native ABI skips, lint, both type checks and both smokes; build and 17 contrast tests passed. UX30_RUN2 has 16 real-theme captures and clean lifecycle. Full preset token contrast is proven; direct image inspection covered default light/dark, mint light and drab dark. Captures include transient loading. Do not treat them as performance evidence or complete G4 acceptance.

## Remaining checks to carry forward

UX-31: normalize functional glyphs and hit targets, including accent-button icon contrast; retain meaningful brand art. Locate remaining activity uppercase text with rg. UX-32: narrow/200% titlebar and settings layouts, WorktreeModal focus trapping and async error/stale handling, browser Escape ownership, full three-state keyboard/motion/scaling matrix. UX-33/34: actual task-switch baseline is approximately 425-504 ms versus 250 ms target; measure and repair from traces. UX-35: run the entire scenario manifest; contextual setup is integrated but visual-only currently remains focused. UX-36: rerun native suite and full certification, reconcile skips. Do not modify source during running checks or live acceptance.

## Preserved scope and storage

The preexisting tracked three-line website hold in PLANNING/LAMPREY_SEPTEMBER_2026_REMEDIATION_PSPR.md and unrelated untracked August/Saddle plans plus SR37/SR38 evidence/scripts remain untouched. Never blanket stage, stash, reset or delete them. Website restoration remains paused. Current installed/released version is v0.32.0; v0.33.0 has not been packaged or published. Final Bucket must verify six GitHub/CDN/local artifacts and place Lamprey-0.33.0-x64.exe directly in dist.

Five worktrees retained: canonical active UX lane plus prior AC-Add, AC-Delete, AC-Improve and AC-Wrap audit lanes. UX29_STORAGE.json records old lanes clean, no unpublished work, shared node_modules, output sizes approximately 0.49/0.52/0.50/61.41 MB. No removal authorization; those lanes stay preserved. Canonical generated sizes at that inventory: dist 29.73 GB, node_modules 1.40 GB, out 47.08 MB, coverage 38.47 MB. No duplicate tree was created. The current fixture is cleaned; no Bucket is running. Do not claim global repository cleanliness because the unrelated files are intentionally preserved.

Authored and reviewed by Basho Parks, copyright 2026

## Resume update - 2026-09-06

The user subsequently requested UX-25 through UX-30 be merged to main. All six individual commits were pushed, ending at 71e64c0898c44ed7a3e17d555966a74eceefbceb. All three workflows and ten checks are now green (UX30_HOSTED.json). The user resumed the remaining approved roster using astra-advisor:orchestration; the standby above is historical and no longer active. UX-31 implementation and acceptance continue with fresh independent review. The original website hold and preserved unrelated files remain untouched.
