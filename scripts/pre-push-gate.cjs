const { execFileSync, spawnSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { classify } = require('./pre-push-scope.cjs')

function pushedPaths(input, remote, cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  const paths = new Set()
  for (const line of input.trim().split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4 || !fields[1].match(/^[a-f0-9]{40,64}$/) || !fields[3].match(/^[a-f0-9]{40,64}$/)) {
      throw new Error('Malformed pre-push update; verification cannot be scoped')
    }
    const [, localSha, , remoteSha] = fields
    if (/^0+$/.test(localSha)) continue
    let base = remoteSha
    if (/^0+$/.test(base)) {
      const remoteHead = `refs/remotes/${remote}/HEAD`
      const exists = spawnSync('git', ['show-ref', '--verify', '--quiet', remoteHead], { cwd })
      if (exists.status === 0) {
        base = git('merge-base', localSha, remoteHead).trim()
      } else if (exists.status === 1) {
        // No known remote baseline: check the complete pushed tree conservatively.
        base = execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { cwd, input: '', encoding: 'utf8' }).trim()
      } else {
        throw new Error('Cannot inspect remote baseline')
      }
    }
    for (const path of git('diff', '--name-only', '-z', base, localSha, '--').split('\0').filter(Boolean)) paths.add(path)
  }
  return [...paths]
}

module.exports = { pushedPaths }
if (require.main === module) {
  try {
    const scope = classify(pushedPaths(readFileSync(0, 'utf8'), process.argv[2] || 'origin'))
    console.log(`pre-push: ${scope}`)
    if (scope === 'product') {
      const result = process.platform === 'win32'
        ? spawnSync('cmd.exe', ['/d', '/c', 'npm run verify:proof'], { stdio: 'inherit' })
        : spawnSync('npm', ['run', 'verify:proof'], { stdio: 'inherit' })
      process.exitCode = result.status ?? 1
    }
  } catch (error) {
    console.error(`pre-push: ${error.message}`)
    process.exitCode = 1
  }
}
