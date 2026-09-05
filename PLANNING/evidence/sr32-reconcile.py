"""Apply the reviewed current-state documentation corrections, preserving history."""
from pathlib import Path

def replace(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    assert old in text, (path, old)
    p.write_text(text.replace(old, new, 1), encoding='utf-8', newline='\n')

replace('AGENTS.md', '**thirty-two built-in providers**', '**thirty-three built-in providers**')
replace('AGENTS.md', 'Sarvam, Inception, and keyless', 'Sarvam, Inception, Meta (Muse), and keyless')
replace('AGENTS.md', 'any of the 32 built-ins', 'any of the 33 built-ins')
replace('CLAUDE.md', 'M8 shipped through GA-6; M4 / Code Mode remains parked indefinitely and is neither a dependency nor a blocker; M9 remains unapproved.', 'The July 2026 Codex initiative is closed through CJP-WRAP; M4 / Code Mode remains parked indefinitely and is neither a dependency nor a blocker.')
replace('README.md', 'API keys stay in the operating-system keychain.', 'API keys are stored locally, encrypted with Electron safeStorage when available; plaintext storage requires explicit consent.')
for name in ['package.json', 'package-lock.json']:
    p = Path(name)
    text = p.read_text(encoding='utf-8').replace('https://github.com/USS-Parks/lamprey.git', 'https://github.com/USS-Parks/Lamprey-Harness.git').replace('https://github.com/USS-Parks/lamprey"', 'https://github.com/USS-Parks/Lamprey-Harness"')
    p.write_text(text, encoding='utf-8', newline='\n')

report = Path('PLANNING/LAMPREY_SEPTEMBER_2026_REAUDIT.md')
text = report.read_text(encoding='utf-8')
text = text.replace('Status: audit delivered; remediation NOT executed or approved.', 'Status: full STS and Bucket authorized on 5 September 2026. Source remediation is complete through SR-31I; final source acceptance and publication remain open.')
text = text.replace('## Conclusion', '## Original audit conclusion (before execution)', 1)
text = text.replace('This report records 30 actionable findings', 'The original audit recorded 30 actionable findings', 1)
text = text.replace('No product fixes, dependency changes, builds, commits, pushes, releases, or deletions were performed.', 'At that audit-only checkpoint, no product fixes, dependency changes, builds, commits, pushes, releases, or deletions had been performed.', 1)
text = text.replace('## Verification actually performed', '## Original audit verification (before execution)', 1)
text = text.replace('This draft awaits the user\'s review and approval. The following is the repository\'s required attribution footer, not an execution approval.', 'The user subsequently approved the full STS roster and Bucket, including per-prompt commits and pushes to main. The original audit evidence above remains a historical baseline.')
marker = 'Authored and reviewed by Basho Parks, copyright 2026'
addendum = '''## SR-32 execution reconciliation

The full ledger now contains 40 numbered findings. SA-31/32 were discovered during live acceptance; SA-33 through SA-40 are documented with original source evidence in [SR-31 adjudication](evidence/SR31_ADJUDICATION.md). Each row below links its completed source-repair receipt. Final source certification (SR-34), release serialization (SR-35), Bucket (SR-37) and published closeout (SR-38) remain open at this checkpoint.

| Added finding | Repair | Evidence |
|---|---|---|
| SA-33: fork creation lacks atomicity and reliable cleanup | SR-31A | Native rollback and cleanup-failure tests; [receipt](evidence/sr31a.json) |
| SA-34: provider retry delays cancellation | SR-31B | Actual HTTP failure/backoff cancellation; [receipt](evidence/sr31b.json) |
| SA-35: browser lifecycle and listener ownership | SR-31C | Chrome race fixture and real Electron view visibility; [receipt](evidence/sr31c.json) |
| SA-36: quit does not drain normal turns/subagents | SR-31D | SQLite inspected after real shutdown, before restart recovery; [receipt](evidence/sr31d.json) |
| SA-37: startup/model persistence can use the wrong model | SR-31E | Delayed/rejected startup, keyless local setup and actual local provider; [receipt](evidence/sr31e.json) |
| SA-38: recursive supported tool-schema subset is not enforced | SR-31F | Invalid calls never reach real stdio receiver; [receipt](evidence/sr31f.json) |
| SA-39: workflow status and provider runner are unwired | SR-31G | Palette launch, status navigation and local provider completion; [receipt](evidence/sr31g.json) |
| SA-40: vulnerable dependency graph | SR-31H | Zero npm advisories after repairs, real image/archive and native DB checks; [receipt](evidence/sr31h.json) |

SR-31I additionally removes a confirmed redundant Git invocation and handles environment refresh failures with stale-state disclosure, retry, request ordering and lifecycle cleanup. Both production environment surfaces passed real temporary Git commit/push acceptance; [receipt](evidence/sr31i.json).

Current local baseline: 3,007 default tests passed, 174 skipped; all 169 dedicated native database tests in 21 files executed with zero skips. The default suite is not a substitute for that native gate. Production builds and focused real Electron acceptance have run during remediation. A Windows hosted PowerShell AST test intermittently returns uninspectable; CI run 33984062387 failed on that assertion. Final hosted acceptance remains pending, not green by inference from local tests.

PR #12's provider-count correction is reused after checking the 33-provider parity test and registry. PR #14's CJP-WRAP correction is reused against CJ26_AFTER's COMPLETE ledger. PR #13's native-DB work was reused in SR-01 and hardened in SR-02. These are content reuse records, not claims that the original PRs were merged. Historical provider counts and original audit receipts remain intact.

Package metadata now points to the canonical Lamprey-Harness repository. README credential storage copy now distinguishes local safeStorage encryption from consented plaintext fallback. The installed/downloaded release remains v0.31.0 at this checkpoint; source repairs are not yet an installer release. TL-W4 stays open without final GitHub/local/CDN byte proof. Existing parked provider/playbook gates and unsigned-build non-goal remain explicit. User-owned planning files are preserved.

'''
text = text.replace(marker, addendum + marker)
report.write_text(text, encoding='utf-8', newline='\n')

plan = Path('PLANNING/LAMPREY_SEPTEMBER_2026_REMEDIATION_PSPR.md')
text = plan.read_text(encoding='utf-8').replace('all 30 findings have evidence-backed dispositions', 'all 40 numbered findings and SR-31I maintenance candidates have evidence-backed dispositions')
text = text.replace('| SA-15 | SR-07 | SA-30 | SR-23 |', '| SA-15 | SR-07 | SA-30 | SR-23 |\n| SA-31 | SR-18A | SA-32 | SR-29 |\n| SA-33 | SR-31A | SA-34 | SR-31B |\n| SA-35 | SR-31C | SA-36 | SR-31D |\n| SA-37 | SR-31E | SA-38 | SR-31F |\n| SA-39 | SR-31G | SA-40 | SR-31H |')
plan.write_text(text, encoding='utf-8', newline='\n')
print('Reconciled current claims; preserved historical baselines and open publication gates.')
