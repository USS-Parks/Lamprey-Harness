#!/usr/bin/env node
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const root = process.cwd()
const requireSmokes = process.argv.includes('--require-smokes')

const steps = [
  ['lint', ['npm', ['run', 'lint']]],
  ['tsc:node', ['npx', ['tsc', '--noEmit', '-p', 'tsconfig.node.json']]],
  ['tsc:web', ['npx', ['tsc', '--noEmit', '-p', 'tsconfig.web.json']]],
  ['test', ['npm', ['test']]]
]

const hasBuildOutput =
  existsSync(join(root, 'out', 'main', 'index.js')) &&
  existsSync(join(root, 'out', 'renderer', 'index.html'))

if (hasBuildOutput || requireSmokes) {
  steps.push(['smoke:bundle', ['npm', ['run', 'smoke:bundle']]])
  steps.push(['smoke:renderer', ['npm', ['run', 'smoke:renderer']]])
}

let failed = false
for (const [label, [cmd, args]] of steps) {
  console.log(`\n[verify:proof] ${label}`)
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (result.status !== 0) {
    failed = true
    console.error(`[verify:proof] ${label} failed with exit ${result.status ?? 'unknown'}`)
    break
  }
}

if (!hasBuildOutput && !requireSmokes) {
  console.log('\n[verify:proof] smoke checks skipped: build output not present')
}

if (requireSmokes && !hasBuildOutput) {
  console.error('[verify:proof] build output missing but --require-smokes was requested')
  failed = true
}

process.exit(failed ? 1 : 0)
