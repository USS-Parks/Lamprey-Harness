const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { execFileSync, spawn } = require('node:child_process')
async function main() {
  const root = path.resolve(__dirname, '../..')
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'lamprey-unpacked-build-'))
  try {
    execFileSync(process.execPath, ['node_modules/electron-vite/bin/electron-vite.js', 'build'], { cwd: root, stdio: 'inherit', timeout: 180000 })
    execFileSync(process.execPath, ['node_modules/electron-builder/cli.js', '--win', '--dir', '--publish', 'never', '--config.directories.output=' + output], { cwd: root, stdio: 'inherit', timeout: 300000 })
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/acceptance/package.cjs', path.join(output, 'win-unpacked'), '--unpacked'], { cwd: root, stdio: 'inherit', windowsHide: true })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`Unpacked package test failed (${code})`)))
    })
  } finally { await fs.rm(output, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
