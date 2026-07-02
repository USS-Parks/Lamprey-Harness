// JM-14 (July 2026 Maintenance, DB-3/DB-7/DB-12) — SQLite error classing.
//
// Several stores used to flip into a session-long in-memory fallback on ANY
// SQLite error. One transient SQLITE_BUSY past the timeout, or one constraint
// violation, silently moved every subsequent write into RAM — data that
// evaporates on quit while the real DB-backed rows vanish from view. The
// fallback is only the right answer when the DATABASE ITSELF is unusable;
// per-operation errors must surface to the caller.

/** True when the error means the database itself is unavailable. */
export function isDbUnavailableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined
  if (!e) return false
  const code = typeof e.code === 'string' ? e.code : ''
  if (
    code === 'SQLITE_CANTOPEN' ||
    code === 'SQLITE_CORRUPT' ||
    code === 'SQLITE_NOTADB' ||
    code.startsWith('SQLITE_IOERR')
  ) {
    return true
  }
  const msg = (typeof e.message === 'string' ? e.message : '').toLowerCase()
  return (
    msg.includes('database is closed') ||
    msg.includes('database connection is not open') ||
    msg.includes('not a database') ||
    msg.includes('database disk image is malformed') ||
    msg.includes('database not initialized') ||
    // Schema init failed → the store's tables don't exist; treat as unavailable.
    msg.includes('no such table') ||
    // getDb() outside a real Electron app (headless vitest) dies on
    // app.getPath — the canonical "no DB here" signal the fallbacks exist for.
    msg.includes('getpath') ||
    msg.includes('app is not defined') ||
    msg.includes('electron app not available') ||
    // better-sqlite3 absent/ABI-mismatched (vitest under a different Node).
    msg.includes('was compiled against a different node.js version') ||
    msg.includes('cannot find module')
  )
}

/** True for FTS5 query-syntax errors caused by user-typed operators/quotes —
 *  a per-QUERY problem, never a persistence problem. */
export function isFtsSyntaxError(err: unknown): boolean {
  const msg = ((err as Error)?.message ?? '').toLowerCase()
  return (
    msg.includes('fts5: syntax error') ||
    msg.includes('unterminated string') ||
    msg.includes('malformed match expression') ||
    msg.includes('unknown special query')
  )
}
