import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('Use isolated DB') } }, BrowserWindow: { getAllWindows: () => [] } }))
import { __setUserDataForTests, getDb } from './database'
import { createConversation } from './conversation-store'
import { selectMessagesToCompress, compressOldestMessages, getEffectiveMessages } from './context-compressor'
const HAS_NATIVE_SQLITE = (() => {
  try { const db = new Database(':memory:'); db.close(); return true } catch { return false }
})()
describe.skipIf(!HAS_NATIVE_SQLITE)('native tool-group compression', () => {
  let conversation: string, stamp: number
  const calls = JSON.stringify(['one','two'].map(id => ({ id, type: 'function', function: { name: id, arguments: '{}' } })))
  function add(id: string, role: string, toolCalls: string | null = null, callId: string | null = null) {
    getDb().prepare('INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, conversation, role, 'content '.repeat(200), toolCalls, callId, stamp++)
  }
  beforeEach(() => {
    __setUserDataForTests(mkdtempSync(join(tmpdir(),'lamprey-compressor-test-')))
    conversation = createConversation('deepseek-chat').id
    stamp = 100
  })
  afterEach(() => { __setUserDataForTests(null) })
  it('selects every result when the budget ends inside a multi-tool block', () => {
    add('assistant','assistant',calls); add('first','tool',null,'one'); add('second','tool',null,'two'); add('tail','user')
    for (const budget of [1,450,1000]) {
      expect(selectMessagesToCompress(conversation,budget,1).map(row => row.id)).toEqual(['assistant','first','second'])
    }
  })
  it('leaves a pending group intact while allowing earlier complete messages', () => {
    add('earlier','user'); add('assistant','assistant',calls); add('first','tool',null,'one')
    expect(selectMessagesToCompress(conversation,10000,1).map(row => row.id)).toEqual(['earlier'])
  })
  it.each(['unrelated','one'])('refuses an unmatched or duplicate result %s', (id) => {
    add('assistant','assistant',calls); add('first','tool',null,'one'); add('second','tool',null,id)
    expect(selectMessagesToCompress(conversation,1,1)).toEqual([])
  })
  it('persists compression without orphaning a surviving result', () => {
    add('assistant','assistant',calls); add('first','tool',null,'one'); add('second','tool',null,'two'); add('tail','user')
    expect(compressOldestMessages(conversation,1,{ thresholdPct: 0, targetPct: 1 })?.compressedCount).toBe(3)
    expect(getEffectiveMessages(conversation).map(row => row.role)).toEqual(['system','user'])
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM messages WHERE compressed_into IS NOT NULL').get()).toEqual({ n: 3 })
  })
})
