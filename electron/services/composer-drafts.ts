import { getDb } from './database'
import { getConversation } from './conversation-store'

function draftOwner(owner: unknown): string {
  if (owner === null) return '__new__'
  if (typeof owner !== 'string' || !owner || !getConversation(owner)) throw new Error('The draft task no longer exists.')
  return owner
}
export function readComposerDraft(owner: unknown): { text: string; attachments: unknown[] } {
  const rows = getDb().prepare('SELECT field, value FROM composer_drafts WHERE owner_id = ?').all(draftOwner(owner)) as Array<{ field: string; value: string }>
  const fields = Object.fromEntries(rows.map(row => [row.field, row.value]))
  return { text: fields.text ?? '', attachments: fields.attachments ? JSON.parse(fields.attachments) : [] }
}
export function writeComposerDraft(owner: unknown, patch: unknown): void {
  const id = draftOwner(owner)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('A draft update is required.')
  const fields = patch as Record<string, unknown>
  if (Object.keys(fields).some(key => !['text', 'attachments'].includes(key))) throw new Error('Unknown draft field.')
  if (fields.text !== undefined && (typeof fields.text !== 'string' || fields.text.length > 2_000_000)) throw new Error('Draft text exceeds the 2 million character limit.')
  if (fields.attachments !== undefined && (!Array.isArray(fields.attachments) || fields.attachments.length > 100 || fields.attachments.some(file => !file || typeof file !== 'object' || typeof file.name !== 'string' || !['text', 'image', 'pdf', 'binary', 'rag-pending'].includes(file.kind) || typeof file.content !== 'string'))) throw new Error('Invalid draft attachments.')
  const attachments = fields.attachments === undefined ? undefined : JSON.stringify(fields.attachments)
  if (attachments && attachments.length > 64_000_000) throw new Error('Draft attachments exceed the 64 million character limit.')
  const db = getDb()
  db.transaction(() => {
    for (const [field, value] of [['text', fields.text], ['attachments', attachments]] as const) {
      if (value === undefined) continue
      if (value === '' || value === '[]') db.prepare('DELETE FROM composer_drafts WHERE owner_id = ? AND field = ?').run(id, field)
      else db.prepare('INSERT INTO composer_drafts (owner_id, field, value) VALUES (?, ?, ?) ON CONFLICT(owner_id, field) DO UPDATE SET value = excluded.value').run(id, field, value)
    }
  })()
}
