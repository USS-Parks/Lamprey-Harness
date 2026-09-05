const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const yaml = require('js-yaml')
const assert = require('node:assert/strict')
const workflow = yaml.load(readFileSync('.github/workflows/openwiki-update.yml', 'utf8'))
assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
const steps = workflow.jobs.update.steps
assert.equal(steps[0].name, 'Check provider configuration')
for (const configured of [false, true]) {
  const env = { ...process.env, ANTHROPIC_API_KEY: configured ? 'fixture-not-a-real-key' : '' }
  const result = spawnSync('C:/Program Files/Git/bin/bash.exe', ['-c', steps[0].run], { env, encoding: 'utf8' })
  assert.equal(result.status, configured ? 0 : 1)
  assert(!result.stdout.includes('fixture-not-a-real-key'))
  if (!configured) assert.match(result.stdout, /Configure the ANTHROPIC_API_KEY/)
}
assert(steps.some((step) => step.name === 'Run OpenWiki' && step.env.ANTHROPIC_API_KEY === '${{ secrets.ANTHROPIC_API_KEY }}'))
console.log('Manual trigger only; missing/configured credential guard exercised in Bash; no provider request or secret creation.')
