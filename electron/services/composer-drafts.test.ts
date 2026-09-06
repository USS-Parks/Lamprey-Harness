import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
const mocks = vi.hoisted(() => ({ db: null as any }))
vi.mock('./database', () => ({ getDb: () => mocks.db }))
vi.mock('./conversation-store', () => ({ getConversation: (id: string) => ['one', 'two'].includes(id) ? { id } : null }))
import { readComposerDraft, writeComposerDraft } from './composer-drafts'
import { MIGRATIONS } from './db-migrations'
beforeEach(() => {
  mocks.db?.close()
  const db = new DatabaseSync(':memory:')
  mocks.db = { prepare: db.prepare.bind(db), exec: db.exec.bind(db), close: db.close.bind(db), transaction: (run: () => void) => () => { db.exec('BEGIN'); try { run(); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error } } }
  db.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY); INSERT INTO conversations VALUES ('one'), ('two'); CREATE TABLE messages (id TEXT PRIMARY KEY);")
  MIGRATIONS.find(m => m.version === 34)!.up(mocks.db)
})
describe('durable composer ownership with real SQLite', () => {
  it('keeps text and ordered attachment payloads isolated across task updates', () => {
    const files = [{ name: 'first.txt', kind: 'text', content: 'First' }, { name: 'image.png', kind: 'image', content: 'data:image/png;base64,AAAA' }, { name: 'last.txt', kind: 'text', content: 'Last' }]
    writeComposerDraft('one', { text: 'One', attachments: files })
    writeComposerDraft('two', { text: 'Two' })
    writeComposerDraft('one', { text: 'Edited' })
    expect(readComposerDraft('one')).toEqual({ text: 'Edited', attachments: files })
    expect(readComposerDraft('two')).toEqual({ text: 'Two', attachments: [] })
  })
  it('deletes empty fields and only the explicitly deleted task', () => {
    writeComposerDraft('one', { text: 'One' }); writeComposerDraft('two', { text: 'Two' })
    writeComposerDraft('one', { text: '', attachments: [] })
    expect(readComposerDraft('one')).toEqual({ text: '', attachments: [] })
    mocks.db.prepare('DELETE FROM conversations WHERE id = ?').run('one')
    expect(readComposerDraft('two').text).toBe('Two')
    expect(mocks.db.prepare('SELECT COUNT(*) AS count FROM composer_drafts').get().count).toBe(1)
  })
  it('rejects invalid and missing owners without touching saved content', () => {
    writeComposerDraft('one', { text: 'Preserve' })
    expect(() => writeComposerDraft('missing', { text: 'Wrong' })).toThrow('no longer exists')
    expect(() => writeComposerDraft('one', { text: 5 })).toThrow('text')
    expect(() => writeComposerDraft('one', { attachments: [{ name: 'x' }] })).toThrow('attachments')
    expect(readComposerDraft('one').text).toBe('Preserve')
  })
  it('keeps the unsent new-task draft separate from real task IDs', () => {
    writeComposerDraft(null, { text: 'Not sent yet' }); writeComposerDraft('one', { text: 'One' })
    expect(readComposerDraft(null).text).toBe('Not sent yet')
    expect(() => readComposerDraft('__new__')).toThrow('no longer exists')
  })
})
