#!/usr/bin/env node
// scripts/smoke-renderer.cjs
//
// Build-artifact integrity smoke for the packaged renderer bundle.
//
// The main-process smoke (smoke-bundle.cjs) can require() out/main/index.js
// under Node because it's a CommonJS bundle. The renderer is a browser bundle
// (React 19 + Shiki + Mermaid + web workers + dynamic imports); executing it
// headlessly under jsdom would be fragile and would not faithfully reproduce a
// real browser. So this smoke instead verifies what actually breaks a shipped
// renderer in practice — a "white screen" caused by a build that emitted
// nothing, a truncated/empty entry chunk, or index.html pointing at an asset
// that was never written:
//
//   1. out/renderer/index.html exists.
//   2. It references an entry script and a stylesheet under ./assets/.
//   3. Every referenced asset resolves to a real, non-empty file.
//   4. The entry chunk is non-trivially sized (guards against a truncated /
//      empty bundle) and mounts the React root (`createRoot`).
//
// It does NOT execute renderer code or catch runtime logic errors — that's the
// job of the jsdom component tests under src/**/*.test.tsx.

const fs = require('fs')
const path = require('path')

const RENDERER_DIR = path.resolve(__dirname, '..', 'out', 'renderer')
const INDEX_HTML = path.join(RENDERER_DIR, 'index.html')

function fail(msg) {
  console.error(`smoke-renderer: FAIL — ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(INDEX_HTML)) {
  console.error(`smoke-renderer: ${INDEX_HTML} not found.`)
  console.error('smoke-renderer: run `npm run build` (or `npx electron-vite build`) first.')
  process.exit(1)
}

const html = fs.readFileSync(INDEX_HTML, 'utf8')

// Collect every src="..." / href="..." reference. Vite emits hashed asset
// paths like ./assets/index-<hash>.js, so we resolve them relative to the
// renderer dir.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
const assetRefs = refs.filter((r) => !/^(https?:)?\/\//.test(r) && !r.startsWith('data:'))

const scripts = assetRefs.filter((r) => r.endsWith('.js'))
const styles = assetRefs.filter((r) => r.endsWith('.css'))

if (scripts.length === 0) fail('index.html references no entry <script>.')
if (styles.length === 0) fail('index.html references no stylesheet <link>.')

let entryJsPath = null
for (const ref of assetRefs) {
  const resolved = path.resolve(RENDERER_DIR, ref.replace(/^\.?\//, ''))
  if (!resolved.startsWith(RENDERER_DIR)) fail(`asset escapes out/renderer: ${ref}`)
  if (!fs.existsSync(resolved)) fail(`referenced asset is missing: ${ref}`)
  const { size } = fs.statSync(resolved)
  if (size === 0) fail(`referenced asset is empty: ${ref}`)
  if (ref.endsWith('.js') && !entryJsPath) entryJsPath = resolved
}

// Entry chunk sanity: a real React build is large and mounts a root. A few KB
// floor catches a truncated/placeholder chunk without being brittle about the
// exact size, which drifts with every dependency bump.
const entry = fs.readFileSync(entryJsPath, 'utf8')
if (entry.length < 10_000) {
  fail(`entry chunk ${path.basename(entryJsPath)} is suspiciously small (${entry.length} bytes).`)
}
if (!entry.includes('createRoot')) {
  fail(`entry chunk ${path.basename(entryJsPath)} does not mount a React root (no createRoot).`)
}

console.log(
  `smoke-renderer: PASS — ${path.relative(process.cwd(), INDEX_HTML)} + ` +
    `${assetRefs.length} referenced asset(s) present; entry ` +
    `${path.basename(entryJsPath)} (${(entry.length / 1024).toFixed(0)} KB) mounts a root.`
)
process.exit(0)
