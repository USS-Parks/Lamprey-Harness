const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { execFileSync, spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const { createWriteStream } = require('node:fs')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { captureManifest, hashFile } = require('../bucket.cjs')

async function recoverWindows(runId, partial, folder) {
  assert.equal(path.dirname(path.resolve(partial)), path.resolve(os.tmpdir()))
  assert.match(path.basename(partial), /^gh-artifact\.\d+\.zip$/)
  const before = await fs.stat(partial)
  const archive = path.join(folder, 'windows-producer.zip')
  await fs.copyFile(partial, archive)
  const metadata = JSON.parse(execFileSync('gh', ['api', `repos/USS-Parks/Lamprey-Harness/actions/runs/${runId}/artifacts`], { encoding: 'utf8' }))
  const artifact = metadata.artifacts.find(item => item.name === 'lamprey-windows' && !item.expired)
  assert(artifact?.digest?.startsWith('sha256:'))
  const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
  const response = await fetch(artifact.archive_download_url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Lamprey-release-verification' }, redirect: 'manual', signal: AbortSignal.timeout(30000) })
  assert.equal(response.status, 302)
  const url = response.headers.get('location')
  assert(url && new URL(url).protocol === 'https:')
  const download = await fetch(url, { headers: { Range: `bytes=${before.size}-` }, signal: AbortSignal.timeout(900000) })
  assert.equal(download.status, 206)
  assert(download.headers.get('content-range')?.startsWith(`bytes ${before.size}-`))
  await pipeline(Readable.fromWeb(download.body), createWriteStream(archive, { flags: 'a' }))
  assert.equal('sha256:' + await hashFile(archive), artifact.digest, 'Recovered artifact does not match GitHub digest')
  execFileSync('tar.exe', ['-xf', archive, '-C', folder], { windowsHide: true, stdio: 'pipe', timeout: 180000 })
  await fs.unlink(archive)
  const after = await fs.stat(partial)
  // Remove only this invocation's unchanged, interrupted gh transfer after its
  // full artifact has been recovered and verified against the producer digest.
  assert.equal(after.size, before.size)
  assert.equal(after.mtimeMs, before.mtimeMs)
  await fs.unlink(partial)
  console.log('Recovered Windows artifact and removed its interrupted temporary transfer')
}

async function main() {
  const runId = process.argv[2]
  assert(/^\d+$/.test(runId))
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const run = JSON.parse(execFileSync('gh', ['run', 'view', runId, '--repo', 'USS-Parks/Lamprey-Harness', '--json', 'status,conclusion,headSha,headBranch,databaseId'], { encoding: 'utf8' }))
  assert.equal(run.headSha, source)
  assert.equal(run.headBranch, 'main')
  assert.equal(run.status, 'completed')
  assert.equal(run.conclusion, 'success')
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'lamprey-candidate-artifacts-'))
  try {
    for (const name of ['lamprey-windows', 'lamprey-macos', 'lamprey-linux']) {
      console.log(`Downloading candidate ${name}`)
      if (name === 'lamprey-windows' && process.argv[3]) await recoverWindows(runId, process.argv[3], folder)
      else execFileSync('gh', ['run', 'download', runId, '--repo', 'USS-Parks/Lamprey-Harness', '--name', name, '--dir', folder], { stdio: 'inherit', timeout: 900000 })
    }
    const manifest = { ...await captureManifest(folder, require('../../package.json').version, source, run), status: 'candidate' }
    await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await fs.writeFile(path.resolve('PLANNING/evidence/sr37-candidate-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve(__dirname, 'package.cjs'), folder], { stdio: 'inherit', windowsHide: true })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`Candidate package smoke failed (${code})`)))
    })
  } finally { await fs.rm(folder, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
// Authored and reviewed by Basho Parks, copyright 2026
