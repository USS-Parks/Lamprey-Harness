#!/usr/bin/env node
// AC-35 / K8 — classify a git path list as docs-only vs product.
//
// Docs-only trees (skip verify:proof when EVERY changed path matches):
//   PLANNING/  RELEASE_NOTES/  openwiki/  ARCHITECTURE/  graft/
//   DEVLOG.md  README.md  and any *.md at the repository root
//
// Mixed ranges that include electron/, src/, scripts/, package.json, etc.
// are product and must run the full gate.
//
// Dry-run:
//   node scripts/pre-push-scope.cjs PLANNING/foo.md DEVLOG.md
//   → docs-only
//   node scripts/pre-push-scope.cjs electron/ipc/chat.ts PLANNING/foo.md
//   → product

'use strict'

const DOC_PREFIXES = ['PLANNING/', 'RELEASE_NOTES/', 'openwiki/', 'ARCHITECTURE/', 'graft/']
const DOC_ROOT_EXACT = new Set(['DEVLOG.md', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md'])

function normalize(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '')
}

function isDocsPath(p) {
  const path = normalize(p)
  if (!path) return true
  if (DOC_ROOT_EXACT.has(path)) return true
  if (/^[^/]+\.md$/i.test(path)) return true
  return DOC_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))
}

function classify(paths) {
  const list = paths.map(normalize).filter(Boolean)
  if (list.length === 0) return 'empty'
  return list.every(isDocsPath) ? 'docs-only' : 'product'
}

module.exports = { isDocsPath, classify, DOC_PREFIXES, DOC_ROOT_EXACT }

if (require.main === module) {
  const paths = process.argv.slice(2)
  process.stdout.write(classify(paths) + '\n')
}
