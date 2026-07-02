import { ipcMain } from 'electron'
import { createHash, randomUUID } from 'crypto'
import * as store from '../services/conversation-store'
import { chatOnce } from '../services/providers/registry'
import { getActiveWorkspace } from '../services/workspace-state'
import { ensureConversationCollection } from '../services/conversation-rag'
import {
  addAttachment,
  copyAttachments,
  insertChunks,
  insertDocument,
  updateDocument
} from '../services/rag/store'
import { chunk as chunkText } from '../services/rag/chunker'
import { readSettings } from '../services/settings-helper'
import { recordEvent } from '../services/event-log'
import { clearToolUnlockState } from '../services/tool-unlock-state'
import { clearCapabilityTrackingForConversation } from '../services/providers/capability-tracker'

type SeedKind = 'none' | 'message' | 'block' | 'transcript-range' | 'custom'
type WorkspaceMode = 'inherit' | 'current' | 'none'

export interface ForkParams {
  sourceConversationId: string
  sourceMessageId?: string
  seedKind: SeedKind
  seedContent?: string
  seedBlobJson?: string
  includeRagAttachments?: boolean
  workspaceMode?: WorkspaceMode
  titleOverride?: string
}

const SEED_KINDS = new Set<SeedKind>([
  'none',
  'message',
  'block',
  'transcript-range',
  'custom'
])
const WORKSPACE_MODES = new Set<WorkspaceMode>(['inherit', 'current', 'none'])

function sanitizeForkParams(raw: unknown): ForkParams {
  if (typeof raw === 'string') {
    return {
      sourceConversationId: raw,
      seedKind: 'none',
      includeRagAttachments: true,
      workspaceMode: 'inherit'
    }
  }
  const input = (raw ?? {}) as Partial<ForkParams>
  if (typeof input.sourceConversationId !== 'string' || !input.sourceConversationId) {
    throw new Error('sourceConversationId is required')
  }
  const seedKind = input.seedKind ?? 'none'
  if (!SEED_KINDS.has(seedKind)) throw new Error(`invalid seedKind: ${seedKind}`)
  const workspaceMode = input.workspaceMode ?? 'current'
  if (!WORKSPACE_MODES.has(workspaceMode)) {
    throw new Error(`invalid workspaceMode: ${workspaceMode}`)
  }
  const sourceMessageId =
    typeof input.sourceMessageId === 'string' && input.sourceMessageId
      ? input.sourceMessageId
      : undefined
  const seedContent =
    typeof input.seedContent === 'string' ? input.seedContent : undefined
  const seedBlobJson =
    typeof input.seedBlobJson === 'string' ? input.seedBlobJson : undefined

  if ((seedKind === 'block' || seedKind === 'custom') && !seedContent?.trim()) {
    throw new Error(`seedContent is required for seedKind=${seedKind}`)
  }
  if (seedKind === 'transcript-range' && !seedBlobJson?.trim() && !seedContent?.trim()) {
    throw new Error('seedBlobJson or seedContent is required for seedKind=transcript-range')
  }

  return {
    sourceConversationId: input.sourceConversationId,
    sourceMessageId,
    seedKind,
    seedContent,
    seedBlobJson,
    includeRagAttachments: input.includeRagAttachments !== false,
    workspaceMode,
    titleOverride:
      typeof input.titleOverride === 'string' && input.titleOverride.trim()
        ? input.titleOverride.trim()
        : undefined
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildSeedTurn(params: ForkParams, content: string): string {
  const attrs = [
    `source="${escapeAttr(params.sourceConversationId)}"`,
    `kind="${escapeAttr(params.seedKind)}"`
  ]
  if (params.sourceMessageId) {
    attrs.push(`from_message_id="${escapeAttr(params.sourceMessageId)}"`)
  }
  return `<seed_context ${attrs.join(' ')}>\n${content.trim()}\n</seed_context>`
}

function seedBudget(): number {
  const raw = readSettings().safeSeedLength
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 8192
}

interface SeedTurnResult {
  body: string
  truncated: boolean
  seedBytes: number
  attachedDocumentId?: string
  threshold: number
}

function attachSeedAsRagDocument(
  conversationId: string,
  params: ForkParams,
  content: string
): { documentId: string; collectionId: string; chunkCount: number } {
  const collection = ensureConversationCollection(conversationId)
  addAttachment({ conversationId, collectionId: collection.id })
  const bytes = Buffer.byteLength(content, 'utf8')
  const displayName = params.sourceMessageId
    ? `Seed from message ${params.sourceMessageId}`
    : `Seed from conversation ${params.sourceConversationId}`
  const doc = insertDocument({
    collectionId: collection.id,
    sourceKind: 'paste',
    displayName,
    mime: 'text/plain',
    bytes,
    hashSha256: createHash('sha256').update(content).digest('hex'),
    status: 'chunking'
  })
  const chunks = chunkText(
    { text: content, sourceKind: 'paste', mime: 'text/plain', extension: '.txt' },
    { chunkSize: collection.chunkSize, chunkOverlap: collection.chunkOverlap }
  )
  insertChunks(
    chunks.map((c) => ({
      documentId: doc.id,
      collectionId: collection.id,
      chunkIndex: c.index,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      text: c.text,
      headingPath: c.headingPath,
      page: c.page,
      lineStart: c.lineStart,
      lineEnd: c.lineEnd
    }))
  )
  updateDocument(doc.id, {
    status: 'ready',
    chunkCount: chunks.length,
    ingestedAt: Date.now(),
    statusDetail: chunks.length === 0 ? 'no extractable content' : null
  })
  return { documentId: doc.id, collectionId: collection.id, chunkCount: chunks.length }
}

function seedTurnBody(
  conversationId: string,
  params: ForkParams,
  content: string
): SeedTurnResult {
  const threshold = seedBudget()
  const seedBytes = Buffer.byteLength(content, 'utf8')
  if (content.length <= threshold) {
    return {
      body: buildSeedTurn(params, content),
      truncated: false,
      seedBytes,
      threshold
    }
  }
  const estimatedTokens = Math.ceil(content.length / 4)
  try {
    const attached = attachSeedAsRagDocument(conversationId, params, content)
    return {
      truncated: true,
      seedBytes,
      threshold,
      attachedDocumentId: attached.documentId,
      body: buildSeedTurn(
        params,
        `Seed attached as document (${estimatedTokens} estimated tokens, ${content.length} chars). ` +
          `Inline seed budget is ${threshold} chars.`
      )
    }
  } catch (err) {
    const preview = content.slice(0, threshold)
    const message = err instanceof Error ? err.message : String(err)
    return {
      truncated: true,
      seedBytes,
      threshold,
      body: buildSeedTurn(
        params,
        `${preview}\n\n[Seed truncated at ${threshold} chars because RAG attachment failed: ${message}]`
      )
    }
  }
}

function emitConversationForked(params: ForkParams, args: {
  conversationId: string
  seedBytes: number
  workspaceMode: WorkspaceMode
  copiedAttachmentCount: number
}): void {
  try {
    recordEvent({
      type: 'conversation.forked',
      actorKind: 'user',
      conversationId: args.conversationId,
      entityKind: 'conversation',
      entityId: args.conversationId,
      payload: {
        sourceConversationId: params.sourceConversationId,
        sourceMessageId: params.sourceMessageId,
        seedKind: params.seedKind,
        seedBytes: args.seedBytes,
        workspaceMode: args.workspaceMode,
        includeRagAttachments: params.includeRagAttachments !== false,
        copiedAttachmentCount: args.copiedAttachmentCount
      }
    })
  } catch (err) {
    console.error('[conversation] conversation.forked event failed:', err)
  }
}

function emitSeedEvent(
  conversationId: string,
  params: ForkParams,
  seed: SeedTurnResult
): void {
  try {
    recordEvent({
      type: seed.truncated ? 'conversation.seed.truncated' : 'conversation.seed.attached',
      actorKind: 'user',
      conversationId,
      entityKind: seed.attachedDocumentId ? 'rag-document' : 'conversation',
      entityId: seed.attachedDocumentId ?? conversationId,
      severity: seed.truncated ? 'warning' : 'info',
      payload: {
        conversationId,
        seedKind: params.seedKind,
        seedBytes: seed.seedBytes,
        threshold: seed.truncated ? seed.threshold : undefined,
        attachedDocumentId: seed.attachedDocumentId
      },
      redaction: 'metadata'
    })
  } catch (err) {
    console.error('[conversation] seed event failed:', err)
  }
}

function resolveSeedContent(params: ForkParams): string | null {
  if (params.seedKind === 'none') return null
  if (params.seedContent?.trim()) return params.seedContent
  if (params.seedKind === 'message' && params.sourceMessageId) {
    const message = store.findMessage(params.sourceConversationId, params.sourceMessageId)
    if (!message) throw new Error('source message not found')
    return message.content
  }
  if (params.seedKind === 'transcript-range' && params.seedBlobJson?.trim()) {
    return params.seedBlobJson
  }
  return null
}
export function registerConversationHandlers(): void {
  ipcMain.handle('conversation:list', async () => {
    try {
      return { success: true, data: store.listConversations() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // E3 — sessions sidebar.
  ipcMain.handle(
    'sessions:list',
    async (
      _event,
      opts?: { tab?: 'recent' | 'pinned' | 'archived'; query?: string; limit?: number; offset?: number }
    ) => {
      try {
        return { success: true, data: store.listSessions(opts) }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('sessions:archive', async (_event, id: string, archived: boolean) => {
    try {
      store.setConversationArchived(id, archived)
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sessions:setPinned', async (_event, id: string, pinned: boolean) => {
    try {
      store.setConversationPinned(id, pinned)
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sessions:search', async (_event, query: string, limit?: number) => {
    try {
      const lim = typeof limit === 'number' && limit > 0 ? Math.min(limit, 200) : 50
      return { success: true, data: store.searchSessions(query, lim) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:get', async (_event, id) => {
    try {
      const conv = store.getConversation(id)
      if (!conv) return { success: false, error: 'Conversation not found' }
      return { success: true, data: conv }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'conversation:create',
    async (
      _event,
      model: string,
      opts?: {
        kind?: 'local' | 'cloud' | 'worktree'
        worktreePath?: string | null
        projectId?: string | null
      }
    ) => {
      try {
        return { success: true, data: store.createConversation(model, opts) }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  ipcMain.handle('conversation:delete', async (_event, id) => {
    try {
      store.deleteConversation(id)
      // JM-11 (CC-12) — release the per-conversation session state. These
      // cleaners existed with zero production callers: the unlock/capability
      // maps grew for the app's lifetime, and an FC-10 downgrade stayed
      // pinned to a conversationId forever (even one being deleted).
      clearToolUnlockState(id)
      clearCapabilityTrackingForConversation(id)
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:updateTitle', async (_event, id, title) => {
    try {
      store.updateConversationTitle(id, title)
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:getMessages', async (_event, id) => {
    try {
      return { success: true, data: store.getMessages(id) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:appendSystem', async (_event, id, content) => {
    try {
      const msg = store.saveMessage({
        id: randomUUID(),
        conversationId: id,
        role: 'system',
        content
      })
      return { success: true, data: msg }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:setModel', async (_event, id, model) => {
    try {
      store.updateConversationModel(id, model)
      return { success: true, data: null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:fork', async (_event, raw: unknown) => {
    try {
      const params = sanitizeForkParams(raw)
      const src = store.getConversation(params.sourceConversationId)
      if (!src) return { success: false, error: 'source not found' }
      const seedContent = resolveSeedContent(params)
      let worktreePath: string | null = null
      if (params.workspaceMode === 'inherit') {
        worktreePath = src.worktreePath ?? null
      } else if (params.workspaceMode === 'current') {
        worktreePath = getActiveWorkspace()
      }
      const next = store.createConversation(src.model, {
        kind: src.kind ?? 'local',
        worktreePath,
        projectId: src.projectId ?? null,
        forkedFromId: params.sourceConversationId,
        forkedFromMessageId: params.sourceMessageId ?? null,
        seedSourceKind: params.seedKind,
        seedBlob:
          params.seedKind === 'none'
            ? null
            : {
                sourceConversationId: params.sourceConversationId,
                sourceMessageId: params.sourceMessageId,
                kind: params.seedKind,
                seedBytes: seedContent ? Buffer.byteLength(seedContent, 'utf8') : 0,
                contentPreview: seedContent?.slice(0, 240)
              }
      })

      const copiedAttachmentCount = params.includeRagAttachments
        ? copyAttachments(params.sourceConversationId, next.id)
        : 0

      let seedBytes = seedContent ? Buffer.byteLength(seedContent, 'utf8') : 0
      if (seedContent && params.seedKind !== 'none') {
        const seedTurn = seedTurnBody(next.id, params, seedContent)
        seedBytes = seedTurn.seedBytes
        store.saveMessage({
          id: randomUUID(),
          conversationId: next.id,
          role: 'user',
          content: seedTurn.body
        })
        emitSeedEvent(next.id, params, seedTurn)
      }
      const title = params.titleOverride ?? (src.title ? `${src.title} (fork)` : null)
      if (title) store.updateConversationTitle(next.id, title)
      emitConversationForked(params, {
        conversationId: next.id,
        seedBytes,
        workspaceMode: params.workspaceMode ?? 'current',
        copiedAttachmentCount
      })
      return { success: true, data: { conversationId: next.id } }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:lineage', async (_event, conversationId: string) => {
    try {
      if (typeof conversationId !== 'string' || !conversationId) {
        return { success: false, error: 'conversationId is required' }
      }
      return { success: true, data: store.listConversationLineage(conversationId) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('conversation:compact', async (_event, id: string) => {
    try {
      const conv = store.getConversation(id)
      if (!conv) return { success: false, error: 'conversation not found' }
      const msgs = store.getMessages(id)
      if (msgs.length < 4) {
        return { success: false, error: 'Conversation is too short to compact.' }
      }
      // Build a summarization request using the conversation's own model.
      const summaryReq = [
        {
          role: 'system' as const,
          content:
            'You are a summarizer. Produce a concise context-preservation summary (≤300 words) of the following conversation. Preserve specific decisions, file paths, code snippets, and unresolved questions. Output Markdown.'
        },
        ...msgs
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          }))
      ]
      const summaryResult = await chatOnce(summaryReq as any, conv.model)
      const summary = summaryResult.content
      if (!summary?.trim()) {
        return { success: false, error: 'Summarizer returned empty output.' }
      }
      // Replace messages with a single system marker holding the summary.
      store.clearConversationMessages(id)
      store.saveMessage({
        id: randomUUID(),
        conversationId: id,
        role: 'system',
        content: `## Conversation compacted at ${new Date().toISOString()}\n\n${summary}`
      })
      return { success: true, data: { summary } }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'compact failed' }
    }
  })
}
