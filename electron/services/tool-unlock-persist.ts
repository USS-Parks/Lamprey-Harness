import { getDb } from './database'
import type { ToolUnlockPersist } from './tool-unlock-state'

/** SQLite persist for AC-19. Table is created by migration v33. */
function isMissingUnlockTable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return /no such table/i.test(msg)
}

export function createSqliteToolUnlockPersist(): ToolUnlockPersist {
  return {
    load(conversationId: string): string[] {
      try {
        const rows = getDb()
          .prepare(
            'SELECT tool_name FROM conversation_tool_unlocks WHERE conversation_id = ?'
          )
          .all(conversationId) as Array<{ tool_name: string }>
        return rows.map((r) => r.tool_name)
      } catch (error) {
        if (isMissingUnlockTable(error)) return []
        throw error
      }
    },
    save(conversationId: string, names: string[]): void {
      try {
        const db = getDb()
        const ins = db.prepare(
          'INSERT OR IGNORE INTO conversation_tool_unlocks (conversation_id, tool_name) VALUES (?, ?)'
        )
        const tx = db.transaction(() => {
          for (const n of names) ins.run(conversationId, n)
        })
        tx()
      } catch (error) {
        if (isMissingUnlockTable(error)) return
        throw error
      }
    },
    clear(conversationId: string): void {
      try {
        getDb()
          .prepare('DELETE FROM conversation_tool_unlocks WHERE conversation_id = ?')
          .run(conversationId)
      } catch (error) {
        if (isMissingUnlockTable(error)) return
        throw error
      }
    }
  }
}
