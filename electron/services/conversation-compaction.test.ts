import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('Use isolated DB') } }, BrowserWindow: { getAllWindows: () => [] } }))
import { __setUserDataForTests, getDb } from './database'
import { createConversation, getMessages, replaceMessagesWithSummary, saveMessage } from './conversation-store'

const HAS_NATIVE_SQLITE = (() => {
  try { const db = new Database(':memory:'); db.close(); return true } catch { return false }
})()
describe.skipIf(!HAS_NATIVE_SQLITE)('snapshot-safe compaction with native SQLite', () => {
  let id: string
  beforeEach(() => {
    __setUserDataForTests(mkdtempSync(join(tmpdir(),'lamprey-compact-test-')))
    id = createConversation('deepseek-chat').id
    for (let i = 0; i < 4; i++) saveMessage({ id: randomUUID(), conversationId: id, role: i % 2 ? 'assistant' : 'user', content: `original ${i}` })
  })
  afterEach(() => { __setUserDataForTests(null) })
  it('refuses a stale summary without erasing an intervening message', () => {
    const snapshot = getMessages(id)
    saveMessage({ id: randomUUID(), conversationId: id, role: 'user', content: 'arrived during model await' })
    const updated = getMessages(id)
    expect(() => replaceMessagesWithSummary(id,snapshot,'summary')).toThrow('Conversation changed')
    expect(getMessages(id)).toEqual(updated)
  })
  it('rolls back message and search deletion when summary insertion fails', () => {
    const snapshot = getMessages(id)
    const before = getDb().prepare('SELECT * FROM sessions_fts').all()
    getDb().exec("CREATE TRIGGER reject_summary BEFORE INSERT ON messages WHEN NEW.role = 'system' BEGIN SELECT RAISE(ABORT, 'fixture summary failure'); END")
    expect(() => replaceMessagesWithSummary(id,snapshot,'summary')).toThrow('fixture summary failure')
    expect(getMessages(id)).toEqual(snapshot)
    expect(getDb().prepare('SELECT * FROM sessions_fts').all()).toEqual(before)
  })
  it('atomically replaces an unchanged snapshot with its summary', () => {
    replaceMessagesWithSummary(id,getMessages(id),'decisions retained')
    expect(getMessages(id)).toHaveLength(1)
    expect(getMessages(id)[0]).toMatchObject({ role: 'system', content: expect.stringContaining('decisions retained') })
    expect(() => replaceMessagesWithSummary(id,getMessages(id),' ')).toThrow('empty summary')
  })
})
