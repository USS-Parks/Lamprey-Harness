// Bucket uses the completed tag workflow as its only artifact producer.
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { spawn } = require('node:child_process')
const yaml = require('js-yaml')

const ARTIFACTS = ['Lamprey-x64.exe', 'Lamprey-x64.exe.blockmap', 'Lamprey-x64.zip', 'latest.yml', 'Lamprey-arm64.dmg', 'Lamprey-x86_64.AppImage']
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

function command(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', chunk => { out += chunk; if (out.length > 16 * 1024 * 1024) child.kill() })
    child.stderr.on('data', chunk => { err = (err + chunk).slice(-16000) })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`${path.basename(file)} failed (${code}): ${err || out}`)))
  })
}

async function hashFile(file, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm)
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest(encoding)
}

function hashUrl(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '600', url], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const hash = createHash('sha256')
    let size = 0, error = ''
    child.stdout.on('data', chunk => { hash.update(chunk); size += chunk.length })
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000) })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve({ size, sha256: hash.digest('hex') }) : reject(new Error(`Download failed for ${url}: ${error}`)))
  })
}

function assertMatch(expected, actual, label) {
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error(`${label}: final bytes differ from manifest for ${expected.name}`)
}

function selectProducer(runs, tag, source) {
  return runs.find(run => run.headBranch === tag && run.headSha === source)
}

async function captureManifest(folder, version, source, producer) {
  const assets = []
  for (const name of ARTIFACTS) {
    const file = path.join(folder, name)
    const stat = await fsp.stat(file)
    if (!stat.isFile() || stat.size === 0) throw new Error(`Missing or empty artifact: ${name}`)
    assets.push({ name, size: stat.size, sha256: await hashFile(file) })
  }
  const latest = yaml.load(await fsp.readFile(path.join(folder, 'latest.yml'), 'utf8'))
  const exe = assets.find(asset => asset.name === 'Lamprey-x64.exe')
  const exeSha512 = await hashFile(path.join(folder, exe.name), 'sha512', 'base64')
  const entry = latest?.files?.find(file => file.url === exe.name)
  if (latest?.version !== version || latest.path !== exe.name || latest.sha512 !== exeSha512 || entry?.sha512 !== exeSha512 || entry?.size !== exe.size) {
    throw new Error('latest.yml version, installer name, size or sha512 does not match the produced installer')
  }
  return { version, tag: `v${version}`, source, producer, assets }
}

// The ordering is shared by real publication and the late-overwrite regression.
async function publishFinal({ waitForProducer, capture, mirror, verify }) {
  const producer = await waitForProducer()
  const manifest = await capture(producer)
  await mirror(manifest)
  await verify(manifest)
  return manifest
}

async function main(argv = process.argv.slice(2)) {
  const allowed = new Set(['--dry-run', '--no-tag', '--no-build', '--no-cross-platform'])
  for (const arg of argv) if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}`)
  if (argv.includes('--no-cross-platform')) throw new Error('Partial-platform publication cannot satisfy Bucket. Run the full producer and verification pipeline.')
  if (argv.includes('--no-build')) console.log('No local build is used. The completed tag workflow remains mandatory.')
  const root = path.resolve(__dirname, '..')
  const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''))
  const config = readJson('.bucket.json')
  const pkg = readJson('package.json')
  const version = pkg.version
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Bucket requires a stable semantic version')
  const tag = `v${version}`
  const repo = config.github?.repo
  if (repo !== 'USS-Parks/Lamprey-Harness') throw new Error('Bucket config must name the canonical USS-Parks/Lamprey-Harness repository')
  if (!/^[a-f0-9]{32}$/.test(config.r2?.accountId) || !/^[a-z0-9][a-z0-9-]+$/.test(config.r2?.bucket)) throw new Error('Invalid R2 account or bucket config')
  const cdn = new URL(`https://${config.cloudflare?.cdnHost}`)
  if (cdn.pathname !== '/' || cdn.username || cdn.password || cdn.search || cdn.hash) throw new Error('CDN config must contain only a hostname')
  const git = (...args) => command('git', args, { cwd: root })
  const gh = (...args) => command('gh', args, { cwd: root })
  const source = await git('rev-parse', 'HEAD')
  const notes = path.join(root, 'RELEASE_NOTES', `${tag}.md`)
  if (!fs.existsSync(notes) && !argv.includes('--dry-run')) throw new Error(`Missing release notes: ${notes}`)
  const remote = await git('ls-remote', 'origin', 'refs/heads/main')
  if (remote.split(/\s/)[0] !== source) throw new Error('HEAD must equal published origin/main before Bucket')
  const tags = await git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
  const tagRows = tags.split('\n').filter(Boolean).map(row => row.split(/\s+/))
  const tagSource = (tagRows.find(row => row[1].endsWith('^{}')) || tagRows[0])?.[0]
  if (argv.includes('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, source, tag, existingTagSource: tagSource || null, tagConflict: !!tagSource && tagSource !== source, producer: 'completed build.yml tag push, matching both tag and source', artifacts: ARTIFACTS, destination: cdn.origin, steps: ['require clean tracked tree and matching main/tag', 'wait for all producer jobs', 'download final release assets', 'validate installer metadata and capture hashes', 'mirror all six files to R2', 'purge configured cache', 'hash final GitHub and CDN downloads and recheck producer'] }, null, 2))
    return
  }
  if (await git('status', '--porcelain', '--untracked-files=no')) throw new Error('Tracked changes must be committed before Bucket')
  const aws = 'C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe'
  if (!fs.existsSync(aws)) throw new Error('Install AWS CLI v2 before Bucket')
  const sourceRuns = JSON.parse(await gh('run', 'list', '--repo', repo, '--commit', source, '--limit', '50', '--json', 'name,status,conclusion'))
  for (const name of ['CI', 'Build Lamprey']) {
    const run = sourceRuns.find(item => item.name === name)
    if (run?.status !== 'completed' || run.conclusion !== 'success') throw new Error(`Source gate ${name} must finish successfully before tagging`)
  }
  if (tagSource && tagSource !== source) throw new Error(`${tag} points at another commit; refusing to overwrite a release`)
  if (!tagSource) {
    if (argv.includes('--no-tag')) throw new Error(`Remote tag ${tag} does not exist`)
    const localTag = await git('tag', '--list', tag)
    if (localTag) {
      if (await git('rev-list', '-n', '1', tag) !== source) throw new Error('Local tag points at another commit')
    } else await git('tag', '-a', tag, '-m', tag)
    await git('push', 'origin', `refs/tags/${tag}`)
  }
  const folder = path.join(root, 'dist', `bucket-${tag}-${source.slice(0, 12)}`)
  await fsp.mkdir(folder, { recursive: true })
  const receiptPath = path.join(folder, 'manifest.json')
  const env = { ...process.env }
  const credentials = path.join(root, '.aws', 'credentials')
  if (fs.existsSync(credentials)) {
    env.AWS_SHARED_CREDENTIALS_FILE = credentials
    if (fs.existsSync(path.join(root, '.aws', 'config'))) env.AWS_CONFIG_FILE = path.join(root, '.aws', 'config')
  }
  const producerRuns = async () => JSON.parse(await gh('run', 'list', '--repo', repo, '--workflow', 'build.yml', '--event', 'push', '--limit', '100', '--json', 'databaseId,headBranch,headSha,status,conclusion,url'))
  let captured
  try {
    const manifest = await publishFinal({
      waitForProducer: async () => {
        const deadline = Date.now() + 40 * 60 * 1000
        while (Date.now() < deadline) {
          const run = selectProducer(await producerRuns(), tag, source)
          if (run?.status === 'completed') {
            if (run.conclusion !== 'success') throw new Error(`Tag producer ${run.databaseId} failed: ${run.conclusion}`)
            const details = JSON.parse(await gh('api', `repos/${repo}/actions/runs/${run.databaseId}`))
            return { ...run, attempt: details.run_attempt }
          }
          console.log(`Waiting for completed tag producer ${run?.databaseId || tag}`)
          await pause(20000)
        }
        throw new Error('Tag producer did not complete within 40 minutes')
      },
      capture: async producer => {
        // Use the exact run's artifacts as authority. A fresh temporary directory
        // keeps a resumed download from accepting stale files left by an earlier run.
        const download = await fsp.mkdtemp(path.join(folder, 'producer-'))
        try {
          for (const name of ['lamprey-windows', 'lamprey-macos', 'lamprey-linux']) {
            await gh('run', 'download', String(producer.databaseId), '--repo', repo, '--name', name, '--dir', download)
          }
          for (const name of ARTIFACTS) await fsp.copyFile(path.join(download, name), path.join(folder, name))
        } finally { await fsp.rm(download, { recursive: true, force: true }) }
        captured = await captureManifest(folder, version, source, producer)
        await fsp.writeFile(receiptPath, JSON.stringify({ ...captured, status: 'captured' }, null, 2) + '\n')
        return captured
      },
      mirror: async manifest => {
        await gh('release', 'edit', tag, '--repo', repo, '--title', tag, '--notes-file', notes)
        for (const asset of manifest.assets) {
          console.log(`Mirroring ${asset.name}`)
          await command(aws, ['s3', 'cp', path.join(folder, asset.name), `s3://${config.r2.bucket}/${asset.name}`, '--endpoint-url', `https://${config.r2.accountId}.r2.cloudflarestorage.com`, '--profile', config.aws?.profile || 'default', '--checksum-algorithm', 'CRC32', '--only-show-errors'], { cwd: root, env })
        }
        const tokenPath = path.join(root, '.cf', 'token')
        if (fs.existsSync(tokenPath)) {
          const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${config.cloudflare.zoneId}/purge_cache`, { method: 'POST', headers: { Authorization: `Bearer ${fs.readFileSync(tokenPath, 'utf8').trim()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: ARTIFACTS.map(name => `${cdn.origin}/${name}`) }), signal: AbortSignal.timeout(30000) })
          const result = await response.json()
          if (!response.ok || result.success !== true) throw new Error(`Configured cache purge failed (HTTP ${response.status})`)
        } else console.log('No purge token configured; final CDN byte verification is still mandatory.')
      },
      verify: async manifest => {
        const release = JSON.parse(await gh('api', `repos/${repo}/releases/tags/${tag}`))
        for (const asset of manifest.assets) {
          const matches = release.assets.filter(item => item.name === asset.name && item.state === 'uploaded')
          if (matches.length !== 1) throw new Error(`Release asset missing or ambiguous: ${asset.name}`)
          assertMatch(asset, { size: (await fsp.stat(path.join(folder, asset.name))).size, sha256: await hashFile(path.join(folder, asset.name)) }, 'local')
          console.log(`Hashing final GitHub and CDN bytes: ${asset.name}`)
          assertMatch(asset, await hashUrl(matches[0].browser_download_url), 'GitHub')
          assertMatch(asset, await hashUrl(`${cdn.origin}/${asset.name}`), 'CDN')
        }
        const finalRun = selectProducer(await producerRuns(), tag, source)
        if (finalRun?.databaseId !== manifest.producer.databaseId || finalRun.status !== 'completed' || finalRun.conclusion !== 'success') throw new Error('Producer changed during publication; final verification must be repeated after it finishes')
        const details = JSON.parse(await gh('api', `repos/${repo}/actions/runs/${finalRun.databaseId}`))
        if (details.run_attempt !== manifest.producer.attempt) throw new Error('Producer was rerun during publication')
        const finalRelease = JSON.parse(await gh('api', `repos/${repo}/releases/tags/${tag}`))
        for (const asset of manifest.assets) {
          const before = release.assets.find(item => item.name === asset.name)
          const after = finalRelease.assets.find(item => item.name === asset.name)
          if (!after || before.id !== after.id || before.updated_at !== after.updated_at || before.digest !== after.digest) throw new Error(`Release asset changed during verification: ${asset.name}`)
        }
      }
    })
    await fsp.writeFile(receiptPath, JSON.stringify({ ...manifest, status: 'verified', verifiedAt: new Date().toISOString() }, null, 2) + '\n')
    console.log(`Bucket verified: ${tag} at ${source}\nManifest: ${receiptPath}`)
  } catch (error) {
    await fsp.writeFile(receiptPath, JSON.stringify({ ...(captured || { source, tag, version }), status: 'partial', error: error.message, recordedAt: new Date().toISOString() }, null, 2) + '\n')
    throw error
  }
}

module.exports = { ARTIFACTS, hashFile, hashUrl, assertMatch, selectProducer, captureManifest, publishFinal, main }
if (require.main === module) main().catch(error => { console.error(`Bucket incomplete: ${error.message}`); process.exitCode = 1 })
// Authored and reviewed by Basho Parks, copyright 2026
