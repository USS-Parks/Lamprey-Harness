#!/usr/bin/env node
// Read-only health report for a Lamprey lamprey.db.
// Usage: node db-health.cjs [path-to-lamprey.db]
// Defaults to %APPDATA%\Lamprey\lamprey.db (Windows) or the platform equivalent.
// Opens read-only; never writes; degrades gracefully when tables are missing.

'use strict'
const path = require('path')
const fs = require('fs')

function defaultDbPath() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Lamprey', 'lamprey.db')
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Lamprey', 'lamprey.db')
  }
  return path.join(home, '.config', 'Lamprey', 'lamprey.db')
}

const dbPath = process.argv[2] || defaultDbPath()
if (!fs.existsSync(dbPath)) {
  console.error(`db-health: no database at ${dbPath}`)
  console.error('db-health: pass the path explicitly: node db-health.cjs <path-to-lamprey.db>')
  process.exit(1)
}

let DatabaseSync
try {
  ;({ DatabaseSync } = require('node:sqlite'))
} catch {
  console.error('db-health: node:sqlite unavailable — requires Node >= 22')
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: true })
const one = (sql) => { try { return db.prepare(sql).get() } catch { return null } }
const all = (sql) => { try { return db.prepare(sql).all() } catch { return null } }
const count = (table) => {
  const r = one(`SELECT COUNT(*) AS n FROM "${table}"`)
  return r ? r.n : null
}

console.log(`db-health report — ${dbPath}`)
console.log(`file size: ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB`)

const uv = one('PRAGMA user_version')
console.log(`user_version: ${uv ? Object.values(uv)[0] : 'unreadable'}  (compare to LATEST_VERSION in electron/services/db-migrations.ts — 18 as of v0.16.0)`)

const integrity = one('PRAGMA integrity_check')
console.log(`integrity_check: ${integrity ? Object.values(integrity)[0] : 'unreadable'}`)

const tables = all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
console.log(`tables: ${tables ? tables.length : 'unreadable'}`)

console.log('\nrow counts (null = table missing, which is fine on older DBs):')
for (const t of [
  'conversations', 'messages', 'tool_calls', 'events',
  'loops', 'loop_wakeups', 'loop_backlog', 'loop_runs',
  'rag_collections', 'rag_documents', 'rag_chunks',
  'proof_receipts', 'change_contracts', 'failure_ledger'
]) {
  console.log(`  ${t}: ${count(t)}`)
}

// Orphan checks — messages without a conversation, tool_calls without a message.
const orphanMsgs = one(
  'SELECT COUNT(*) AS n FROM messages m LEFT JOIN conversations c ON m.conversation_id = c.id WHERE c.id IS NULL'
)
if (orphanMsgs) console.log(`\norphan messages (no conversation): ${orphanMsgs.n}  (expected 0 — deleteConversation is transactional since v0.16.0)`)

// Pending wake-ups — a large backlog can indicate a gating problem.
const pending = one("SELECT COUNT(*) AS n FROM loop_wakeups WHERE status = 'pending'")
if (pending) console.log(`pending loop wake-ups: ${pending.n}  (cap is 10 per conversation; a big global number deserves a look)`)

// Stuck loops — running rows with no recent run activity are crash-recovery candidates.
const running = all("SELECT id, status, iteration FROM loops WHERE status IN ('running','active') LIMIT 10")
if (running && running.length) {
  console.log('loops currently marked running:')
  for (const r of running) console.log(`  ${JSON.stringify(r)}`)
}

db.close()
console.log('\ndone (read-only; nothing was modified)')
