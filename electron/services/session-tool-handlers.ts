import { randomUUID } from 'crypto'
import * as memStore from './memory-store'
import { createChapter } from './chapters-store'
import { recordEvent } from './event-log'
import { setPlanModeActive, type StoredDocument } from './conversation-store'
import { pushPendingDocument } from './pending-turn-documents'
import { emitChatEvent } from './chat-events'
import { getAskUserRuntime } from './ask-user-runtime'
import type { NativeToolHandler, NativeToolHandlerResult } from './tool-registry'

export const CREATE_DOCUMENT_MAX_BYTES = 256 * 1024

export const handleMemoryAdd: NativeToolHandler = async (args, ctx) => {
  if (typeof args.content !== 'string') {
    return { result: 'Error: memory_add requires a string `content`.', status: 'error' }
  }
  const entry = memStore.addMemory(args.content, ctx.conversationId ?? '')
  emitChatEvent('memory:added', entry)
  return 'Saved to memory.'
}

export const handleEnterPlanMode: NativeToolHandler = async (_args, ctx) => {
  const conversationId = ctx.conversationId ?? ''
  setPlanModeActive(conversationId, true)
  emitChatEvent('plan:mode-changed', { conversationId, active: true })
  return 'Plan mode is on. Mutating tools (apply_patch, shell_command, destructive MCP) are blocked until exit_plan_mode is called.'
}

export const handleExitPlanMode: NativeToolHandler = async (_args, ctx) => {
  const conversationId = ctx.conversationId ?? ''
  setPlanModeActive(conversationId, false)
  emitChatEvent('plan:mode-changed', { conversationId, active: false })
  return 'Plan mode is off. Mutating tools are allowed again.'
}

export const handleCreateDocument: NativeToolHandler = async (args, ctx) => {
  const nameRaw = typeof args.name === 'string' ? args.name.trim() : ''
  const mimeRaw = typeof args.mimeType === 'string' ? args.mimeType.trim() : ''
  const contentRaw = typeof args.content === 'string' ? args.content : ''
  if (!nameRaw || !mimeRaw || !contentRaw) {
    return {
      result: 'Error: create_document requires non-empty `name`, `mimeType`, and `content`.',
      status: 'error'
    }
  }
  const sizeBytes = Buffer.byteLength(contentRaw, 'utf8')
  if (sizeBytes > CREATE_DOCUMENT_MAX_BYTES) {
    return {
      result: `Error: create_document body exceeds ${CREATE_DOCUMENT_MAX_BYTES} bytes (got ${sizeBytes}). Split into multiple documents or shorten.`,
      status: 'error'
    }
  }
  const doc: StoredDocument = {
    id: randomUUID(),
    name: nameRaw.slice(0, 200),
    mimeType: mimeRaw.slice(0, 120),
    content: contentRaw,
    sizeBytes,
    createdAt: Date.now()
  }
  pushPendingDocument(ctx.correlationId, doc)
  emitChatEvent('chat:document-created', { conversationId: ctx.conversationId ?? '', document: doc })
  return `Document "${doc.name}" (${doc.sizeBytes} bytes, ${doc.mimeType}) attached to this turn. Do NOT paste the body into your visible reply — the user already sees the card.`
}

export const handleAskUserQuestion: NativeToolHandler = async (args) => {
  const question = typeof args.question === 'string' ? args.question.trim() : ''
  const header = typeof args.header === 'string' ? args.header.trim() : ''
  const optionsRaw = Array.isArray(args.options) ? args.options : []
  const options: Array<{ label: string; description?: string; preview?: string }> = []
  for (const o of optionsRaw) {
    if (!o || typeof o !== 'object') continue
    const opt = o as Record<string, unknown>
    const label = typeof opt.label === 'string' ? opt.label.trim() : ''
    if (!label) continue
    const entry: { label: string; description?: string; preview?: string } = { label }
    if (typeof opt.description === 'string') entry.description = opt.description
    if (typeof opt.preview === 'string') entry.preview = opt.preview
    options.push(entry)
  }
  if (!question || !header || options.length < 2 || options.length > 4) {
    return {
      result:
        'Error: ask_user_question requires `question`, `header`, and 2-4 `options` with non-empty `label`s.',
      status: 'error'
    }
  }
  try {
    const runtime = getAskUserRuntime()
    if (!runtime) {
      throw new Error('ask-user runtime not initialised')
    }
    const answer = await runtime.ask({
      question,
      header,
      options,
      multiSelect: !!args.multiSelect,
      timeoutMs:
        typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs)
          ? args.timeoutMs
          : undefined
    })
    if (answer.kind === 'timeout') return '(timed out — user did not respond)'
    if (answer.kind === 'cancelled') return '(cancelled by user)'
    if (answer.kind === 'single') {
      return answer.notes ? `${answer.label} — ${answer.notes}` : answer.label
    }
    const joined = answer.labels.join(', ')
    return answer.notes ? `${joined} — ${answer.notes}` : joined
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { result: `Error: ${msg}`, status: 'error' }
  }
}

export const handleMarkChapter: NativeToolHandler = async (args, ctx): Promise<NativeToolHandlerResult> => {
  const titleRaw = typeof args.title === 'string' ? args.title.trim() : ''
  const summaryRaw = typeof args.summary === 'string' ? args.summary.trim() : ''
  if (!titleRaw) {
    return { result: 'Error: mark_chapter requires a non-empty `title`.', status: 'error' }
  }
  const conversationId = ctx.conversationId ?? ''
  const chapter = createChapter({
    conversationId,
    title: titleRaw.slice(0, 80),
    summary: summaryRaw ? summaryRaw.slice(0, 280) : null,
    anchorMessageId: ctx.callId ?? ''
  })
  emitChatEvent('chat:chapter-marked', { conversationId, chapter })
  try {
    recordEvent({
      type: 'chat.chapter.marked',
      actorKind: 'model',
      conversationId,
      correlationId: ctx.correlationId,
      entityKind: 'chapter',
      entityId: chapter.id,
      payload: {
        title: chapter.title,
        summary: chapter.summary,
        anchorMessageId: chapter.anchorMessageId
      }
    })
  } catch (err) {
    console.error('[chat] chat.chapter.marked spine event failed:', err)
  }
  return `Chapter marked: "${chapter.title}"`
}
