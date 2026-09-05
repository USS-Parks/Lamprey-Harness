const ts = require('typescript')
const { readFileSync, writeFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { posix } = require('node:path')
const assert = require('node:assert/strict')
const paths = execFileSync('git', ['ls-files', 'src', 'electron'], { encoding: 'utf8' }).trim().split('\n').filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.d.ts'))
const source = new Map(paths.map((path) => [path, readFileSync(path, 'utf8')]))
const edges = new Map(paths.map((path) => [path, []]))
for (const [path, text] of source) {
  for (const { fileName: spec } of ts.preProcessFile(text, true, true).importedFiles) {
    const base = spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), spec)) : null
    if (!base) continue
    const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => source.has(candidate))
    if (target) edges.get(path).push(target)
  }
}
const reached = new Set()
function visit(path) { if (reached.has(path)) return; reached.add(path); for (const target of edges.get(path) ?? []) visit(target) }
visit('src/main.tsx')
const candidates = JSON.parse(readFileSync('PLANNING/evidence/september-audit-scan.json', 'utf8')).renderer_unreachable_candidates
const rows = candidates.map(({ path }) => ({ path, lines: source.get(path).split(/\r?\n/).length - (source.get(path).endsWith('\n') ? 1 : 0), reachable: reached.has(path), importers: [...edges].filter(([, targets]) => targets.includes(path)).map(([importer]) => importer), disposition: path.startsWith('src/components/github/') && !path.endsWith('IssuesPanel.tsx') ? 'retained: SR-24 restored PR surface' : 'remove: no renderer entry path, dynamic registration or public package export' }))
const removed = rows.filter((row) => row.disposition.startsWith('remove'))
assert.equal(removed.length, 20)
for (const row of removed) assert.equal(row.reachable, false, row.path)
for (const row of rows.filter((row) => !removed.includes(row))) assert.equal(row.reachable, true, row.path)
const report = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), method: 'TypeScript import preprocessing and renderer entry reachability, plus manual export/reference and dynamic-loader review. Test-only imports do not make production code reachable.', rows, removedProductionLines: removed.reduce((sum, row) => sum + row.lines, 0), removedHelperTests: ['src/lib/agent-run-routing.test.ts', 'src/lib/citation-parser.test.ts', 'src/lib/interleave-notices.test.ts'] }
writeFileSync('PLANNING/evidence/sr27-dead-code.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
