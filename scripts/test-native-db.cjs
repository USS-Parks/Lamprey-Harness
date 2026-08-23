#!/usr/bin/env node
// AC-36 — run the ABI-guarded native-DB suites. Same file walk as
// scripts/verify-proof.cjs listNativeGuardedTestFiles(). Local `npm run
// test:native-db` uses this Node. CI launches this file under Electron
// (ELECTRON_RUN_AS_NODE=1) so better-sqlite3 loads against Electron's ABI.

const { readdirSync, statSync, readFileSync } = require('fs')
const { join } = require('path')
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

const files = listNativeGuardedTestFiles()
if (files.length === 0) {
  console.error('[test:native-db] no ABI-guarded test files found')
  process.exit(1)
}
console.log(`[test:native-db] ${files.length} file(s):`)
for (const f of files) console.log(`[test:native-db]   - ${f}`)

const vitestCli = join(root, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(process.execPath, [vitestCli, 'run', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: process.env
})
process.exit(result.status === null ? 1 : result.status)
