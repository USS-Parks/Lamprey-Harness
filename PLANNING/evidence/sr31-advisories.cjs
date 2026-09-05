const fs = require('node:fs')
const raw = fs.readFileSync('PLANNING/evidence/sr31-advisories.log', 'utf8')
const report = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
const summary = {
  counts: report.metadata.vulnerabilities,
  packages: Object.values(report.vulnerabilities).map(v => ({
    name: v.name, severity: v.severity, direct: v.isDirect, nodes: v.nodes,
    fixAvailable: v.fixAvailable,
    advisories: v.via.filter(x => typeof x === 'object').map(x => ({ title: x.title, url: x.url, range: x.range })),
    inherited: v.via.filter(x => typeof x === 'string')
  }))
}
fs.writeFileSync('PLANNING/evidence/sr31-advisories.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary.packages.map(({ name, severity, direct, inherited }) => ({ name, severity, direct, inherited })), null, 2))
