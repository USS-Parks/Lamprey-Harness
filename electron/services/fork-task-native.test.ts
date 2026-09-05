import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('Use isolated DB') } }, BrowserWindow: { getAllWindows: () => [] } }))
import { __setUserDataForTests, getDb } from './database'
import { createConversation, getMessages, saveMessage } from './conversation-store'
import { forkTaskAtTurn } from './fork-task'

const HAS_NATIVE_SQLITE = (() => {
  try { const db = new Database(':memory:'); db.close(); return true } catch { return false }
})()
describe.skipIf(!HAS_NATIVE_SQLITE)('atomic historical fork with native SQLite', () => {
  let profile: string
  let id: string
  beforeEach(() => {
    profile = mkdtempSync(join(tmpdir(), 'lamprey-fork-test-'))
    __setUserDataForTests(profile)
    id = createConversation('deepseek-chat').id
    for (const content of ['first', 'second']) saveMessage({ id: randomUUID(), conversationId: id, role: 'user', content })
  })
  afterEach(() => { __setUserDataForTests(null); rmSync(profile, { recursive: true, force: true }) })
  const turns = () => [{ id: 'turn-1', status: 'completed', completedAt: Date.now() + 1000 }] as any
  it('rolls back child, messages and search rows when the second copy fails', async () => {
    const before = getDb().prepare('SELECT * FROM sessions_fts').all()
    getDb().exec(`CREATE TRIGGER reject_fork BEFORE INSERT ON messages WHEN NEW.conversation_id != '${id}' AND NEW.content = 'second' BEGIN SELECT RAISE(ABORT, 'fixture copy failure'); END`)
    await expect(forkTaskAtTurn({ sourceConversationId: id, turnId: 'turn-1' }, { listTurns: turns, copyAttachments: () => 0 })).rejects.toThrow('fixture copy failure')
    expect(getDb().prepare('SELECT id FROM conversations').all()).toEqual([{ id }])
    expect(getMessages(id)).toHaveLength(2)
    expect(getDb().prepare('SELECT * FROM sessions_fts').all()).toEqual(before)
  })
  it('commits a complete child and rolls back attachment-stage failures', async () => {
    await expect(forkTaskAtTurn({ sourceConversationId: id, turnId: 'turn-1' }, { listTurns: turns, copyAttachments: () => { throw new Error('attachment failure') } })).rejects.toThrow('attachment failure')
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM conversations').get()).toEqual({ n: 1 })
    const result = await forkTaskAtTurn({ sourceConversationId: id, turnId: 'turn-1' }, { listTurns: turns, copyAttachments: () => 0 })
    expect(getMessages(result.conversationId).map(m => m.content)).toEqual(['first', 'second'])
  })
})
