#!/usr/bin/env node
// Native acceptance must execute every selected test under the installed Electron ABI.

const { readdirSync, statSync, readFileSync, mkdtempSync } = require('fs')
const { join, resolve } = require('path')
const { tmpdir } = require('os')
const { spawnSync } = require('child_process')

const root = join(__dirname, '..')
const guards = ['HAS_NATIVE_SQLITE', 'nativeOk()']

function listNativeGuardedTestFiles() {
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full)
      else if (/\.test\.tsx?$/.test(name)) {
        const text = readFileSync(full, 'utf8')
        if (guards.some((g) => text.includes(g))) {
          out.push(full.slice(root.length + 1).replace(/\\/g, '/'))
        }
      }
    }
  }
  walk(join(root, 'electron'))
  walk(join(root, 'src'))
  return out.sort()
}

function assertNativeResults(report, files) {
  if (!report.success || report.numFailedTests || report.numPendingTests || report.numTodoTests) {
    throw new Error('Required native tests failed, skipped, or were left as TODO')
  }
  for (const file of files) {
    const suite = report.testResults?.find((item) => resolve(item.name) === resolve(root, file))
    if (!suite || suite.status !== 'passed' || !suite.assertionResults?.length ||
        suite.assertionResults.some((test) => test.status !== 'passed')) {
      throw new Error(`Required native suite did not execute completely: ${file}`)
    }
  }
}

function main() {
  if (!process.versions.electron) {
    const result = spawnSync(require('electron'), [__filename], {
      cwd: root, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    return result.status ?? 1
  }
  // Probe before Vitest can convert a missing binding into a successful skip.
  const Database = require('better-sqlite3')
  const probe = new Database(':memory:')
  try { probe.prepare('SELECT 1').get() } finally { probe.close() }
  const files = listNativeGuardedTestFiles()
if (files.length === 0) {
  console.error('[test:native-db] no ABI-guarded test files found')
  process.exit(1)
}
console.log(`[test:native-db] ${files.length} file(s):`)
for (const f of files) console.log(`[test:native-db]   - ${f}`)

const vitestCli = join(root, 'node_modules', 'vitest', 'vitest.mjs')
const reportPath = join(mkdtempSync(join(tmpdir(), 'lamprey-native-report-')), 'results.json')
const result = spawnSync(process.execPath, [vitestCli, 'run', ...files,
  '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`], {
  cwd: root,
  stdio: 'inherit',
  env: process.env
})
if (result.status !== 0) return result.status ?? 1
assertNativeResults(JSON.parse(readFileSync(reportPath, 'utf8')), files)
console.log(`[test:native-db] All required suites executed; receipt: ${reportPath}`)
return 0
}

module.exports = { assertNativeResults }
if (require.main === module) {
  try { process.exitCode = main() } catch (error) {
    console.error(`[test:native-db] ${error.message}`)
    process.exitCode = 1
  }
}
