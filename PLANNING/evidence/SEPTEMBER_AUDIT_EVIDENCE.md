# September audit evidence index

Date: 5 September 2026. Local tested source: `39c2c5ef6a4bba116d21fc9c3da9a8427bb8ca5b`. Upstream inspected source: `673fd1b815ac38412d8769627eebae85646e487e`. None of these audit fixtures mutates a production database or sends a tool request to an external MCP server.

## Receipts

| File | Contents |
|---|---|
| [inspect helper](september-audit-inspect.py) | Numbered reads, inventory, scans, Git provenance, validation log capture and remote/worktree/release inventory |
| [source probes](september-audit-probes.cjs) | Actual TS transpiled in memory with fixture dependencies; optional Git ref selects immutable upstream source |
| [local observations](september-audit-probes.json) | Seven reproduced source behaviors |
| [upstream observations](september-audit-probes-upstream.json) | Same seven plus async external-open failure and attachment rejection |
| [scan](september-audit-scan.json) | Literal import graph/dead candidates and source-pattern triage; not runtime reachability proof |
| [provenance](september-audit-provenance.json) | Moved-code-aware blame for SA-01 through SA-19 |
| [remote](september-audit-remote.json) | Remote SHA/delta, open PRs, hosted runs; missing filtered CI excerpts are not evidence of zero tests |
| [upstream diff](september-audit-upstream.diff) | Full source delta inspected from local HEAD to fetched main |
| [release](september-audit-release.json) | Live GitHub asset metadata and CDN HTTP observations; no final CDN digest match |
| [worktrees](september-audit-worktrees.json) | Registered paths, exact local SHAs, state, bytes and node_modules junction targets |

After this worktree snapshot, all four AC HEADs were checked with `git merge-base --is-ancestor <HEAD> origin/main`, each exit 0, against fetched main `673fd1b815ac38412d8769627eebae85646e487e`. No worktree was removed. The canonical status in that snapshot predates final report/PSPR files.

## Local check receipts

The following logs are local audit artifacts; repository ignore rules may exclude `.log` files from a future commit. This Markdown summary and JSON receipts preserve key outcomes. Do not stage ignored files with a blanket force-add.

| Log | Outcome |
|---|---|
| [Node TypeScript](september-audit-tsc-node.log) | Exit 0 |
| [Web TypeScript](september-audit-tsc-web.log) | Exit 0 |
| [Lint](september-audit-lint.log) | Exit 0 |
| [Vitest](september-audit-vitest.log) | Exit 0; 268 files passed/14 skipped; 2,948 tests passed/157 skipped |
| [Native DB](september-audit-native-db.log) | Exit 0; 3 files passed/14 skipped; 4 tests passed/146 skipped — false-green gate |
| [Unused node](september-audit-unused-node.log) | Exit 2; 46 advisory diagnostics |
| [Unused web](september-audit-unused-web.log) | Exit 2; 3 advisory diagnostics |

No production build was run. The full suite needed normal child-process/native filesystem access beyond the sandbox; the sandbox launch failure was not treated as a product test failure. Subsequent actual suite outcomes are above.

## Reproduction

Run from the canonical project directory using an available Python, Node and installed dependencies:

```text
python PLANNING/evidence/september-audit-inspect.py check tsc-node
python PLANNING/evidence/september-audit-inspect.py check tsc-web
python PLANNING/evidence/september-audit-inspect.py check lint
python PLANNING/evidence/september-audit-inspect.py check vitest
python PLANNING/evidence/september-audit-inspect.py check native-db
node PLANNING/evidence/september-audit-probes.cjs
node PLANNING/evidence/september-audit-probes.cjs 673fd1b815ac38412d8769627eebae85646e487e
```

Re-running check helpers overwrites their named local log. Preserve original receipts when comparing remediation. The probes reproduce bad behavior; their current successful completion is NOT a remediation acceptance gate. During STS, convert the relevant expectations to safe behavior in focused tests at existing test seams. Real stdio, SQLite, filesystem and UI acceptance remain necessary where the PSPR requires them.

Authored and reviewed by Basho Parks, copyright 2026
