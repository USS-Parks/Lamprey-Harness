import type { ChatCompletionUserMessageParam } from 'openai/resources/chat/completions'
import { getDb } from './database'
import { saveMessage } from './conversation-store'

/** Keep image data with its durable user row so a later turn can still use it. */
export function saveStructuredUserMessage(message: Parameters<typeof saveMessage>[0], content?: ChatCompletionUserMessageParam['content']): void {
  const db = getDb()
  db.transaction(() => {
    saveMessage(message)
    if (Array.isArray(content) && content.some(item => item.type === 'image_url')) db.prepare('INSERT INTO user_message_content (message_id, content_json) VALUES (?, ?)').run(message.id, JSON.stringify(content))
  })()
}
export function readStructuredUserContent(messageId: string): ChatCompletionUserMessageParam['content'] | undefined {
  const row = getDb().prepare('SELECT content_json FROM user_message_content WHERE message_id = ?').get(messageId) as { content_json: string } | undefined
  return row ? JSON.parse(row.content_json) : undefined
}
