const { test } = require('node:test')
const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { spawnSync } = require('node:child_process')
const { assertNativeResults } = require('./test-native-db.cjs')

const file = 'electron/services/schema-init.test.ts'
function report(status = 'passed') {
  return { success: true, testResults: [{ name: resolve(__dirname, '..', file), status: 'passed',
    assertionResults: [{ status }] }] }
}
test('requires each named suite to execute successfully', () => {
  assert.doesNotThrow(() => assertNativeResults(report(), [file]))
  assert.throws(() => assertNativeResults(report(), [file, 'missing.test.ts']))
  for (const status of ['skipped', 'pending', 'todo', 'failed']) {
    assert.throws(() => assertNativeResults(report(status), [file]))
  }
  const empty = report()
  empty.testResults[0].assertionResults = []
  assert.throws(() => assertNativeResults(empty, [file]))
})
test('rejects failed or incomplete reports even if a selected test passed', () => {
  for (const patch of [{ success: false }, { numFailedTests: 1 }, { numPendingTests: 1 }, { numTodoTests: 1 }]) {
    assert.throws(() => assertNativeResults({ ...report(), ...patch }, [file]))
  }
})
test('an unavailable native binding fails the actual command before suite discovery', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'lamprey-native-failure-'))
  const preload = resolve(dir, 'missing-binding.cjs')
  writeFileSync(preload, `const Module = require('node:module'); const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'better-sqlite3') throw new Error('fixture: unavailable native binding');
  return load.call(this, name, ...args);
};`)
  const result = spawnSync(require('electron'), ['--require', preload, resolve(__dirname, 'test-native-db.cjs')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8'
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /fixture: unavailable native binding/)
  assert.doesNotMatch(result.stdout, /file\(s\)/)
})
