#!/usr/bin/env node
// Read-only dump of Lamprey loop state: loops, ceilings, backlog, recent runs, wake-ups.
// Usage: node loop-state.cjs [path-to-lamprey.db]
// Companion to the lamprey-loop-reliability-campaign skill. Never writes.

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
  console.error(`loop-state: no database at ${dbPath}`)
  process.exit(1)
}

let DatabaseSync
try {
  ;({ DatabaseSync } = require('node:sqlite'))
} catch {
  console.error('loop-state: node:sqlite unavailable — requires Node >= 22')
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: true })
const all = (sql, ...args) => { try { return db.prepare(sql).all(...args) } catch { return null } }

function section(title, rows) {
  console.log(`\n== ${title} ==`)
  if (rows === null) { console.log('  (table missing — loops migration v17 not applied, or pre-v0.15 DB)'); return }
  if (!rows.length) { console.log('  (none)'); return }
  for (const r of rows) console.log('  ' + JSON.stringify(r))
}

console.log(`loop-state — ${dbPath}`)

section('loops (v17; active_ms since v18)', all(
  'SELECT * FROM loops ORDER BY rowid DESC LIMIT 20'
))

section('recent loop_runs', all(
  'SELECT * FROM loop_runs ORDER BY rowid DESC LIMIT 20'
))

section('loop_backlog', all(
  'SELECT * FROM loop_backlog ORDER BY rowid LIMIT 50'
))

section('loop_wakeups (latest 20)', all(
  'SELECT * FROM loop_wakeups ORDER BY rowid DESC LIMIT 20'
))

const pendingByConv = all(
  "SELECT conversation_id, COUNT(*) AS pending FROM loop_wakeups WHERE status='pending' GROUP BY conversation_id ORDER BY pending DESC LIMIT 10"
)
section('pending wake-ups per conversation (cap: 10)', pendingByConv)

db.close()
console.log('\ndone (read-only; nothing was modified)')
