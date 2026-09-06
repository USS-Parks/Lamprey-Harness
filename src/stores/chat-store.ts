import { hydrateToolHistory, mergeToolHistory, loadToolLedger } from '@/lib/tool-history'
import { useComposerStore, composerOwnerKey, EMPTY_COMPOSER_DRAFT } from './composer-store'
import { create } from 'zustand'
import type {
  AgentRunPhase,
  ArtifactEditProposal,
  ArtifactActivity,
  Conversation,
  DocumentAttachment,
  Message,
  ProcessedFile,
  VisualizationAttachment,
  ToolCallEvent,
  ToolCallResultEvent,
  ToolProviderKind,
  ToolRisk,
  ForkParams
} from '@/lib/types'
import { useSettingsStore } from '@/stores/settings-store'
import { useModelStore } from '@/stores/model-store'
import { usePlanStore } from '@/stores/plan-store'
import { toast } from '@/stores/toast-store'
import { useNavHistoryStore } from '@/stores/nav-history-store'
import { getRecentUserPromptsFrom } from '@/lib/recent-prompts'
import { buildCanonicalFollowUpInput } from '@/lib/follow-up-composer'
import {
  applyTurnSettledEvent,
  applyTurnStartedEvent,
  getConversationFollowUpState,
  reconcileTurnControlSnapshot,
  type FollowUpStateByConversation
} from '@/lib/follow-up-state'
import type {
  ActiveTurnSnapshot,
  FollowUpDeliveryMode,
  TurnControlSnapshot,
  TurnFollowUpRecord,
  TurnInputItem,
  TurnSettledEvent,
  TurnStartedEvent
} from '@/lib/turn-control-types'

const submittingOwners = new Set<string>()
const pendingSends = new Map<string, { text: string; attachments: ProcessedFile[]; messageId: string }>()

export interface ToolCallState {
  callId: string
  serverId: string
  toolName: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error' | 'denied' | 'unknown'
  result?: string
  rawArguments?: string
  resultIsPreview?: boolean
  duration?: number
  // Descriptor metadata mirrored from the chat:tool-call event so the
  // card renders plain-English label, risk badges, and a live elapsed
  // timer without an extra registry round-trip.
  title?: string
  risks?: ToolRisk[]
  providerKind?: ToolProviderKind
  startedAt?: number
  // True when MessageList must skip rendering a ToolUseCard for this call —
  // see LampreyToolDescriptor.transcriptHidden.
  transcriptHidden?: boolean
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Message[]
  messagesLoading: boolean
  messagesError: string | null
  /** Conversation-keyed source of truth. The legacy visible stream fields
   * below are only the projection for activeConversationId. */
  turnControlByConversation: FollowUpStateByConversation
  activeTurn: ActiveTurnSnapshot | null
  followUps: TurnFollowUpRecord[]
  isStreaming: boolean
  streamingContent: string
  /** Live chain-of-thought captured off the provider's reasoning channel
   *  (DeepSeek `delta.reasoning_content`, OpenRouter `delta.reasoning`).
   *  Reset when a new stream starts; cleared on finishStream/streamError. */
  streamingReasoning: string
  /** Documents the model emitted via `create_document` during the current
   *  in-flight turn. Appended on `chat:document-created`; cleared on
   *  finishStream/streamError. The persisted message returned by chat:done
   *  already carries the same attachments, so the live buffer is only for
   *  rendering during the streaming bubble. */
  streamingDocuments: DocumentAttachment[]
  /** Live visualization cards, keyed by tool call so loading is replaced by
   * ready/error without duplicating the deliverable. */
  streamingVisualizations: VisualizationAttachment[]
  artifactEditProposals: ArtifactEditProposal[]
  artifactActivities: ArtifactActivity[]
  streamStartedAt: number | null
  /** T4 — last streaming-vitals heartbeat (lastChunkAt, chunkCount, etc.).
   *  Null when no stream is active or the provider hasn't fired a heartbeat
   *  yet. Drives the "Ns since last chunk" indicator in the streaming pill. */
  streamingVitals: {
    lastChunkAt: number
    msSinceLastChunk: number
    chunkCount: number
    tokenEstimate: number
    attemptElapsedMs: number
  } | null
  activeModel: string
  toolCalls: ToolCallState[]
  toolHistoryLoading: boolean
  toolHistoryError: string | null
  refreshToolHistory: () => Promise<void>
  pendingAttachments: ProcessedFile[]
  attachmentsProcessing: boolean
  // Codex-style run-phase pill source. Null when no run is active; set by the
  // chat:phase IPC stream from electron/ipc/chat.ts. Cleared on terminal
  // phases (done/error) so the pill disappears when the model finishes.
  runPhase: AgentRunPhase | null

  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  hydrateTurnControl: (conversationId: string) => Promise<void>
  applyTurnStarted: (event: TurnStartedEvent) => void
  applyTurnSettled: (event: TurnSettledEvent) => void
  submitFollowUp: (
    content: string,
    mode: FollowUpDeliveryMode,
    clientUserMessageId?: string
  ) => Promise<FollowUpActionResult>
  retryFollowUp: (followUpId: string) => Promise<FollowUpActionResult>
  updateFollowUpDraft: (followUpId: string, input: TurnInputItem[]) => Promise<FollowUpActionResult>
  reorderQueuedFollowUps: (orderedIds: string[]) => Promise<FollowUpActionResult>
  sendFollowUpNow: (followUpId: string) => Promise<FollowUpActionResult>
  deleteFollowUp: (followUpId: string) => Promise<FollowUpActionResult>
  createConversation: () => Promise<string>
  forkFromMessage: (messageId: string, opts?: Partial<ForkParams>) => Promise<string | null>
  deleteConversation: (id: string) => Promise<void>
  sendMessage: (content: string, activeSkillIds: string[]) => Promise<void>
  cancelStream: () => void
  setModel: (model: string) => Promise<void>
  appendStreamChunk: (content: string) => void
  appendReasoningChunk: (content: string) => void
  appendStreamingDocument: (doc: DocumentAttachment) => void
  upsertStreamingVisualization: (visualization: VisualizationAttachment) => void
  upsertArtifactEditProposal: (proposal: ArtifactEditProposal) => void
  upsertArtifactActivity: (activity: ArtifactActivity) => void
  finishStream: (message: Message) => void
  streamError: (error: string) => void
  continueStreamAfterRound: (message: Message) => void
  appendSteerUserMessage: (message: Message) => void
  setStreamingVitals: (v: ChatState['streamingVitals']) => void
  addToolCall: (event: ToolCallEvent) => void
  updateToolCall: (event: ToolCallResultEvent) => void
  clearToolCalls: () => void
  setRunPhase: (phase: AgentRunPhase | null) => void
  addAttachments: (files: ProcessedFile[], owner?: string | null) => void
  removeAttachment: (index: number) => void
  clearAttachments: () => void
  setAttachmentsProcessing: (v: boolean, owner?: string | null) => void
  /**
   * Fluidity J1: most-recent-first list of the user's prior prompts in the
   * active conversation. Used by ChatInput's ↑/↓ history walker. Strips the
   * attachment-block suffix assembled by the canonical input builder
   * so the recalled text is what the user originally typed.
   */
  getRecentUserPrompts: (limit?: number) => string[]
  /** Dispatcher for RAG ingest progress events. Wired in App.tsx from
   *  window.api.rag.document.onProgress so the store doesn't own the IPC
   *  subscription lifecycle. */
  _updateRagAttachmentProgress: (event: {
    jobId: string
    documentId: string
    phase: string
    progress: number
    chunkCount?: number
    error?: string
  }) => void
}

let toolHistoryGeneration = 0
const turnHydrationGenerations = new Map<string, number>()

export type FollowUpActionResult = { success: true } | { success: false; error: string }

function followUpFailure(error: unknown, fallback: string): FollowUpActionResult {
  return { success: false, error: errorMessage(error, fallback) }
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  return fallback
}

let selectionGeneration = 0

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  messagesLoading: false,
  messagesError: null,
  turnControlByConversation: {},
  activeTurn: null,
  followUps: [],
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingDocuments: [],
  streamingVisualizations: [],
  artifactEditProposals: [],
  artifactActivities: [],
  streamStartedAt: null,
  streamingVitals: null,
  activeModel: 'deepseek-v4-pro',
  toolCalls: [],
  toolHistoryLoading: false,
  toolHistoryError: null,
  pendingAttachments: [],
  attachmentsProcessing: false,
  runPhase: null,

  loadConversations: async () => {
    const result = await window.api.conversation.list()
    if (result.success) {
      set({ conversations: result.data })
      useNavHistoryStore.getState().retain(result.data.map((conversation: Conversation) => conversation.id))
    }
  },

  selectConversation: async (id: string) => {
    if (get().activeConversationId === id && !get().messagesError) return
    const generation = ++selectionGeneration
    useNavHistoryStore.getState().push(id)
    // JM-21 (RD-1) — clear ALL streaming state on switch. selectConversation
    // used to reset only toolCalls/runPhase, so switching mid-stream left the
    // old conversation's partial text + isStreaming:true bleeding into the new
    // view — `canSend` then locked the input app-wide and Stop cancelled the
    // wrong conversation (useChat drops terminal events for the inactive one).
    const cachedTurnControl = getConversationFollowUpState(get().turnControlByConversation, id)
    set({
      activeConversationId: id,
      messages: [],
      messagesLoading: true,
      messagesError: null,
      activeTurn: cachedTurnControl.activeTurn,
      followUps: cachedTurnControl.followUps,
      toolCalls: [],
      toolHistoryLoading: true,
      toolHistoryError: null,
      runPhase: null,
      isStreaming: cachedTurnControl.activeTurn !== null,
      streamingContent: '',
      streamingReasoning: '',
      streamingDocuments: [],
      streamingVisualizations: [],
      artifactEditProposals: [],
      artifactActivities: [],
      streamStartedAt: cachedTurnControl.activeTurn?.startedAt ?? null,
      streamingVitals: null
    })
    const turnHydration = get().hydrateTurnControl(id)
    try {
      const [result, record] = await Promise.all([window.api.conversation.getMessages(id), window.api.conversation.get(id)])
      if (generation !== selectionGeneration || get().activeConversationId !== id) return
      if (!record.success) throw new Error(record.error || 'Task no longer exists')
      if (!result.success) throw new Error(result.error || 'Could not load task messages')
      set({ messages: result.data, messagesLoading: false, toolCalls: mergeToolHistory(hydrateToolHistory(result.data, []), get().toolCalls) })
    } catch (error) {
      if (generation !== selectionGeneration || get().activeConversationId !== id) return
      set({ messages: [], messagesLoading: false, messagesError: errorMessage(error, 'Could not load task messages'), toolHistoryLoading: false })
      return
    }
    const conv = get().conversations.find((c) => c.id === id)
    if (conv) {
      set({ activeModel: conv.model })
    }
    // Load the plan for the new active conversation. Fire-and-forget — the
    // plan checklist renders empty until the snapshot arrives, which is fine.
    void usePlanStore.getState().loadForConversation(id)
    await Promise.all([turnHydration, get().refreshToolHistory()])
  },

  refreshToolHistory: async () => {
    const owner = get().activeConversationId
    if (!owner) return
    const generation = ++toolHistoryGeneration
    set({ toolHistoryLoading: true, toolHistoryError: null })
    try {
      const records = await loadToolLedger(owner, (id, limit, offset) => window.api.tools.getCallsForConversation(id, limit, offset))
      if (get().activeConversationId !== owner || generation !== toolHistoryGeneration) return
      const historical = hydrateToolHistory(get().messages, records, get().activeTurn?.startedAt)
      set(state => ({ toolCalls: mergeToolHistory(historical, state.toolCalls.filter(call => call.serverId !== 'history')), toolHistoryLoading: false }))
    } catch (error) {
      if (get().activeConversationId === owner && generation === toolHistoryGeneration) set({ toolHistoryLoading: false, toolHistoryError: errorMessage(error, 'Tool history could not be loaded') })
    }
  },

  hydrateTurnControl: async (conversationId: string) => {
    const generation = (turnHydrationGenerations.get(conversationId) ?? 0) + 1
    turnHydrationGenerations.set(conversationId, generation)
    let result
    try {
      result = await window.api.turn.getState(conversationId)
    } catch (error) {
      if (turnHydrationGenerations.get(conversationId) === generation) set(state => ({ turnControlByConversation: { ...state.turnControlByConversation, [conversationId]: { ...getConversationFollowUpState(state.turnControlByConversation, conversationId), hydrationError: errorMessage(error, 'Status unavailable') } } }))
      return
    }
    if (turnHydrationGenerations.get(conversationId) !== generation) return
    if (!result.success) {
      set(state => ({ turnControlByConversation: { ...state.turnControlByConversation, [conversationId]: { ...getConversationFollowUpState(state.turnControlByConversation, conversationId), hydrationError: result.error ?? 'Status unavailable' } } }))
      return
    }
    const snapshot = result.data as TurnControlSnapshot
    set((state) => {
      const current = state.turnControlByConversation[conversationId]
      const reconciled = reconcileTurnControlSnapshot(current, snapshot)
      const turnControlByConversation = {
        ...state.turnControlByConversation,
        [conversationId]: reconciled
      }
      if (state.activeConversationId !== conversationId) return { turnControlByConversation }
      return {
        turnControlByConversation,
        activeTurn: reconciled.activeTurn,
        followUps: reconciled.followUps,
        isStreaming: reconciled.activeTurn !== null,
        streamStartedAt: reconciled.activeTurn?.startedAt ?? null
      }
    })
  },

  applyTurnStarted: (event) => {
    const previous = get().turnControlByConversation[event.conversationId]
    const accepted = applyTurnStartedEvent(previous, event)
    if (accepted === previous) return
    if (accepted.activeTurn?.turnId !== event.turnId) {
      set(state => ({ turnControlByConversation: { ...state.turnControlByConversation, [event.conversationId]: accepted } }))
      return
    }
    const submitted = pendingSends.get(event.conversationId)
    if (submitted) {
      const composer = useComposerStore.getState()
      const current = composer.drafts[composerOwnerKey(event.conversationId)]
      if (current?.text === submitted.text) composer.patch(event.conversationId, { text: '' })
      updateOwnerAttachments(event.conversationId, files => files.filter(file => !submitted.attachments.includes(file)))
      pendingSends.delete(event.conversationId)
    }
    set((state) => {
      const next = applyTurnStartedEvent(
        state.turnControlByConversation[event.conversationId],
        event
      )
      const turnControlByConversation = {
        ...state.turnControlByConversation,
        [event.conversationId]: next
      }
      if (state.activeConversationId !== event.conversationId) {
        return { turnControlByConversation }
      }
      return {
        turnControlByConversation,
        activeTurn: next.activeTurn,
        followUps: next.followUps,
        isStreaming: true,
        streamStartedAt: state.streamStartedAt ?? event.startedAt
      }
    })
  },

  applyTurnSettled: (event) => {
    set((state) => {
      const next = applyTurnSettledEvent(
        state.turnControlByConversation[event.conversationId],
        event
      )
      const turnControlByConversation = {
        ...state.turnControlByConversation,
        [event.conversationId]: next
      }
      if (state.activeConversationId !== event.conversationId) {
        return { turnControlByConversation }
      }
      return {
        turnControlByConversation,
        activeTurn: next.activeTurn,
        followUps: next.followUps,
        isStreaming: next.activeTurn !== null,
        ...(next.activeTurn
          ? { streamStartedAt: next.activeTurn.startedAt }
          : {
              streamingContent: '',
              streamingReasoning: '',
              streamingDocuments: [],
              streamingVisualizations: [],
              streamingVitals: null,
              streamStartedAt: null,
              runPhase: null
            })
      }
    })
  },

  submitFollowUp: async (content, mode, suppliedClientUserMessageId) => {
    const state = get()
    const conversationId = state.activeConversationId
    if (!conversationId) return { success: false, error: 'No active conversation.' }
    let input: TurnInputItem[]
    try {
      input = buildCanonicalFollowUpInput(content, state.pendingAttachments)
    } catch (error) {
      return followUpFailure(error, 'Could not prepare follow-up input.')
    }
    if (input.length === 0) return { success: false, error: 'Add text or an attachment.' }
    if (mode === 'steer' && !state.activeTurn) {
      return { success: false, error: 'Waiting for the active turn identity. Try again.' }
    }
    try {
      const clientUserMessageId = suppliedClientUserMessageId ?? crypto.randomUUID()
      const result =
        mode === 'steer'
          ? await window.api.turn.steer({
              conversationId,
              deliveryMode: 'steer',
              expectedTurnId: state.activeTurn!.turnId,
              clientUserMessageId,
              actor: 'user',
              sourceConversationId: conversationId,
              input
            })
          : await window.api.turn.queue({
              conversationId,
              deliveryMode: 'queue',
              clientUserMessageId,
              actor: 'user',
              sourceConversationId: conversationId,
              input
            })
      await get().hydrateTurnControl(conversationId)
      if (!result.success) return { success: false, error: result.error ?? `${mode} failed.` }
      updateOwnerAttachments(conversationId, files => files.filter(file => !state.pendingAttachments.includes(file)))
      return { success: true }
    } catch (error) {
      return followUpFailure(error, `${mode} failed.`)
    }
  },

  retryFollowUp: async (followUpId) => {
    const { activeConversationId: conversationId, followUps } = get()
    const record = followUps.find(item => item.id === followUpId)
    if (!conversationId || !record || record.conversationId !== conversationId || !['rejected', 'recovered'].includes(record.status)) {
      return { success: false, error: 'This recovery draft is no longer available.' }
    }
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([record.id, record.input])))
      const clientUserMessageId = 'recovery:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const result = await window.api.turn.queue({
        conversationId, deliveryMode: 'queue', clientUserMessageId,
        actor: 'user', sourceConversationId: conversationId, input: record.input
      })
      if (result.success) {
        const removed = await window.api.turn.deleteFollowup({ conversationId, followUpId: record.id })
        if (!removed.success) toast.error('Draft queued, but the old recovery card could not be dismissed. Retrying will not queue a duplicate.')
      }
      await get().hydrateTurnControl(conversationId)
      return result.success ? { success: true } : { success: false, error: result.error ?? 'Could not queue the recovery draft.' }
    } catch (error) {
      return followUpFailure(error, 'Could not queue the recovery draft.')
    }
  },

  updateFollowUpDraft: async (followUpId, input) => {
    const conversationId = get().activeConversationId
    if (!conversationId) return { success: false, error: 'No active conversation.' }
    try {
      const result = await window.api.turn.updateFollowup({ conversationId, followUpId, input })
      await get().hydrateTurnControl(conversationId)
      return result.success
        ? { success: true }
        : { success: false, error: result.error ?? 'Could not update follow-up.' }
    } catch (error) {
      return followUpFailure(error, 'Could not update follow-up.')
    }
  },

  reorderQueuedFollowUps: async (orderedIds) => {
    const conversationId = get().activeConversationId
    if (!conversationId) return { success: false, error: 'No active conversation.' }
    try {
      const result = await window.api.turn.reorderFollowups({ conversationId, orderedIds })
      await get().hydrateTurnControl(conversationId)
      return result.success
        ? { success: true }
        : { success: false, error: result.error ?? 'Could not reorder Queue.' }
    } catch (error) {
      return followUpFailure(error, 'Could not reorder Queue.')
    }
  },

  sendFollowUpNow: async (followUpId) => {
    const { activeConversationId: conversationId, activeTurn } = get()
    if (!conversationId || !activeTurn) {
      return { success: false, error: 'Send now requires a running turn.' }
    }
    try {
      const result = await window.api.turn.sendFollowupNow({
        conversationId,
        followUpId,
        expectedTurnId: activeTurn.turnId
      })
      await get().hydrateTurnControl(conversationId)
      return result.success
        ? { success: true }
        : { success: false, error: result.error ?? 'Could not send follow-up now.' }
    } catch (error) {
      return followUpFailure(error, 'Could not send follow-up now.')
    }
  },

  deleteFollowUp: async (followUpId) => {
    const conversationId = get().activeConversationId
    if (!conversationId) return { success: false, error: 'No active conversation.' }
    try {
      const result = await window.api.turn.deleteFollowup({ conversationId, followUpId })
      await get().hydrateTurnControl(conversationId)
      return result.success
        ? { success: true }
        : { success: false, error: result.error ?? 'Could not delete follow-up.' }
    } catch (error) {
      return followUpFailure(error, 'Could not delete follow-up.')
    }
  },

  createConversation: async () => {
    const startingOwner = get().activeConversationId
    const model = get().activeModel
    try {
      const result = await window.api.conversation.create(model)
      if (result.success) {
        const conv = result.data
        if (get().activeConversationId !== startingOwner) {
          set(state => ({ conversations: [conv, ...state.conversations] }))
          return conv.id
        }
        ++selectionGeneration
        useNavHistoryStore.getState().push(conv.id)
        set((state) => ({
          conversations: [conv, ...state.conversations],
          activeConversationId: conv.id,
          messages: [],
          messagesLoading: false,
          messagesError: null,
          activeTurn: null,
          followUps: [],
          isStreaming: false,
          streamingContent: '',
          streamingReasoning: '',
          streamingDocuments: [],
          streamingVisualizations: [],
          artifactEditProposals: [],
          artifactActivities: [],
          streamingVitals: null,
          streamStartedAt: null,
          toolCalls: [],
          runPhase: null
        }))
        // Fresh conversation starts with an empty plan; load to seed the store
        // (also drops any stale snapshot from the previous active conversation).
        void usePlanStore.getState().loadForConversation(conv.id)
        return conv.id
      }
      const msg = result.error ?? 'Could not create conversation'
      console.error('[chat-store] conversation:create failed:', msg)
      toast.error(msg)
    } catch (err) {
      const msg = errorMessage(err, 'Could not create conversation')
      console.error('[chat-store] conversation:create threw:', err)
      toast.error(msg)
    }
    return ''
  },

  forkFromMessage: async (messageId: string, opts: Partial<ForkParams> = {}) => {
    const state = get()
    const sourceConversationId = state.activeConversationId
    if (!sourceConversationId) return null
    const message = state.messages.find((m) => m.id === messageId)
    if (!message) {
      toast.error('Could not find the message to fork from')
      return null
    }
    const result = await window.api.conversation.fork({
      sourceConversationId,
      sourceMessageId: messageId,
      seedKind: opts.seedKind ?? 'message',
      seedContent: opts.seedContent ?? message.content,
      includeRagAttachments: opts.includeRagAttachments ?? true,
      workspaceMode: opts.workspaceMode ?? 'current',
      titleOverride: opts.titleOverride
    })
    if (!result.success) {
      toast.error(result.error ?? 'Could not create fork')
      return null
    }
    const nextId = (result.data as { conversationId: string }).conversationId
    await get().loadConversations()
    await get().selectConversation(nextId)
    toast.success('Fork created')
    return nextId
  },

  deleteConversation: async (id: string) => {
    // JM-22 (RD-13) — check the envelope. The optimistic filter below used to
    // run even when the IPC delete failed, so a failed delete vanished from
    // the sidebar until reload, silently misreporting DB state.
    const res = await window.api.conversation.delete(id)
    if (res && !res.success) {
      toast.error(res.error ?? 'Could not delete conversation')
      return
    }
    useNavHistoryStore.getState().retain(get().conversations.filter(conversation => conversation.id !== id).map(conversation => conversation.id))
    useComposerStore.getState().forget(id)
    const wasActive = get().activeConversationId === id
    if (wasActive) ++selectionGeneration
    turnHydrationGenerations.delete(id)
    set((state) => ({
      turnControlByConversation: Object.fromEntries(
        Object.entries(state.turnControlByConversation).filter(
          ([conversationId]) => conversationId !== id
        )
      ),
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId: wasActive ? null : state.activeConversationId,
      messages: wasActive ? [] : state.messages,
      messagesLoading: wasActive ? false : state.messagesLoading,
      messagesError: wasActive ? null : state.messagesError,
      activeTurn: wasActive ? null : state.activeTurn,
      followUps: wasActive ? [] : state.followUps,
      isStreaming: wasActive ? false : state.isStreaming,
      streamingContent: wasActive ? '' : state.streamingContent,
      streamingReasoning: wasActive ? '' : state.streamingReasoning,
      streamingDocuments: wasActive ? [] : state.streamingDocuments,
      streamingVisualizations: wasActive ? [] : state.streamingVisualizations,
      artifactEditProposals: wasActive ? [] : state.artifactEditProposals,
      artifactActivities: wasActive ? [] : state.artifactActivities,
      streamingVitals: wasActive ? null : state.streamingVitals,
      streamStartedAt: wasActive ? null : state.streamStartedAt,
      // Drop in-flight chat-side state for the deleted conversation so the
      // welcome screen (and any subsequent fresh conversation) starts clean
      // — without this the previous tool cards / run-phase pill / plan
      // checklist linger because ChatView mounts them unconditionally.
      toolCalls: wasActive ? [] : state.toolCalls,
      runPhase: wasActive ? null : state.runPhase
    }))
    if (wasActive) {
      // Plan store is its own zustand store; the state set above can't
      // reach it. Same lifecycle — clear when the owning conversation
      // disappears.
      usePlanStore.getState().clear()
    }
  },

  sendMessage: async (content: string, activeSkillIds: string[]) => {
    const state = get()
    const submitOwner = composerOwnerKey(state.activeConversationId)
    if (submittingOwners.has(submitOwner) || state.isStreaming) return
    submittingOwners.add(submitOwner)
    try {
      let conversationId = state.activeConversationId

      if (!conversationId) {
        conversationId = await get().createConversation()
        if (!conversationId) return
        await useComposerStore.getState().move(state.activeConversationId, conversationId)
      }

      const pending = state.pendingAttachments
      let input: TurnInputItem[]
      try { input = buildCanonicalFollowUpInput(content, pending) }
      catch (error) { toast.error(String(error)); return }
      const modelInfo = useModelStore.getState().models.find(m => m.id === state.activeModel)
      if (pending.some(file => file.kind === 'image') && !modelInfo?.supportsVision) {
        toast.error(`${modelInfo?.name ?? state.activeModel} does not support images. Choose a vision model or remove the images; your draft is retained.`)
        return
      }
      const augmentedContent = input.map(item => item.type === 'text' ? item.text : `[Image: ${item.name ?? 'attachment'}]`).join('\n\n')
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: augmentedContent,
        timestamp: Date.now(),
        conversationId,
        model: state.activeModel
      }

      pendingSends.set(conversationId, { text: useComposerStore.getState().drafts[composerOwnerKey(conversationId)]?.text ?? content, attachments: pending, messageId: userMessage.id })
      set((s) => s.activeConversationId === conversationId ? ({
        messages: [...s.messages, userMessage],
        isStreaming: true,
        streamingContent: '',
        streamingReasoning: '',
        streamingDocuments: [],
        streamingVisualizations: [],
        streamingVitals: null,
        streamStartedAt: Date.now(),
        runPhase: 'understanding'
      }) : {})

      // UB-6 (Unburdening Phase, 2026-06-10) — the per-turn agentMode override
      // died with the pipeline; every turn is single-agent.
      let result
      try {
        result = await window.api.chat.send({
          conversationId,
          model: state.activeModel,
          content,
          input,
          activeSkillIds
        })
      } catch (err) {
        const msg = errorMessage(err, 'Message failed')
        toast.error(msg)
        if (pendingSends.has(conversationId)) {
          pendingSends.delete(conversationId)
          if (get().activeConversationId === conversationId) set(s => ({ messages: s.messages.filter(message => message.id !== userMessage.id) }))
        }
        if (get().activeConversationId === conversationId) get().streamError(msg)
        return
      }
      if (!result.success) {
        const msg = result.error ?? 'Message failed'
        toast.error(msg)
        if (pendingSends.has(conversationId)) {
          pendingSends.delete(conversationId)
          if (get().activeConversationId === conversationId) set(s => ({ messages: s.messages.filter(message => message.id !== userMessage.id) }))
        }
        if (get().activeConversationId === conversationId) get().streamError(msg)
        return
      }

      // Auto-title: first message sets conversation title
      // JM-21 (RD-10) — write the title to the conversation that OWNED this
      // send, captured at the top of the function. Using
      // get().activeConversationId! here meant a mid-stream conversation switch
      // (or delete, which nulls it and makes the `!` lie) landed the title on
      // the wrong conversation or an undefined id.
      const titleConversationId = result.data.conversationId ?? conversationId
      const msgs = [...state.messages, userMessage]
      const userMsgs = msgs.filter((m) => m.role === 'user')
      if (titleConversationId && userMsgs.length === 1) {
        const fallback = content.slice(0, 40)
        await window.api.conversation.updateTitle(titleConversationId, fallback)
        await get().loadConversations()

        // Optional AI-generated title (fire-and-forget; falls back silently on error)
        if (useSettingsStore.getState().settings.aiGeneratedTitles) {
          void window.api.chat.generateTitle(content).then(async (titleResult) => {
            if (
              titleResult.success &&
              typeof titleResult.data === 'string' &&
              titleResult.data.trim()
            ) {
              await window.api.conversation.updateTitle(titleConversationId, titleResult.data.trim())
              await get().loadConversations()
            }
          })
        }
      }
    } finally { submittingOwners.delete(submitOwner) }
  },

  cancelStream: () => {
    const { activeConversationId, activeTurn } = get()
    if (!activeConversationId) return
    if (activeTurn) {
      void window.api.turn.interrupt({
        conversationId: activeConversationId,
        expectedTurnId: activeTurn.turnId
      })
      return
    }
    // Compatibility for the short optimistic-send window before main emits
    // chat:turn-started with the stable identity.
    void window.api.chat.cancel(activeConversationId)
  },

  setModel: async (model: string) => {
    const state = get()
    try {
      await useModelStore.getState().setActiveModel(model)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not switch model.')
      return
    }
    if (get().activeConversationId !== state.activeConversationId) return
    set({ activeModel: model })

    const activeId = state.activeConversationId
    const realMessageCount = state.messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    ).length

    if (activeId && realMessageCount > 0) {
      try {
        const saved = await window.api.conversation.setModel(activeId, model)
        if (!saved.success) throw new Error(saved.error || 'Could not save the conversation model.')
        const info = useModelStore.getState().models.find((m) => m.id === model)
        const modelName = info?.name ?? model
        const marker = `— Switched to ${modelName} —`
        const result = await window.api.conversation.appendSystem(activeId, marker)
        if (!result.success) throw new Error(result.error || 'Could not save the model-switch marker.')
        if (result.data && get().activeConversationId === activeId) {
          const msg = result.data as Message
          set((s) => ({ messages: [...s.messages, msg] }))
        }
        await get().loadConversations()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not update conversation model history.')
      }
    }
  },

  appendStreamChunk: (content: string) => {
    set((state) => ({
      streamingContent: state.streamingContent + content
    }))
  },

  appendReasoningChunk: (content: string) => {
    set((state) => ({
      streamingReasoning: state.streamingReasoning + content
    }))
  },

  appendStreamingDocument: (doc: DocumentAttachment) => {
    set((state) => ({
      streamingDocuments: [...state.streamingDocuments, doc]
    }))
  },

  upsertStreamingVisualization: (visualization: VisualizationAttachment) => {
    set((state) => {
      const index = state.streamingVisualizations.findIndex(
        (entry) => entry.callId === visualization.callId
      )
      if (index === -1) {
        return { streamingVisualizations: [...state.streamingVisualizations, visualization] }
      }
      const next = [...state.streamingVisualizations]
      next[index] = visualization
      return { streamingVisualizations: next }
    })
  },

  upsertArtifactEditProposal: (proposal: ArtifactEditProposal) => {
    set((state) => {
      const index = state.artifactEditProposals.findIndex((entry) => entry.id === proposal.id)
      if (index === -1) return { artifactEditProposals: [...state.artifactEditProposals, proposal] }
      const next = [...state.artifactEditProposals]
      next[index] = proposal
      return { artifactEditProposals: next }
    })
  },

  upsertArtifactActivity: (activity: ArtifactActivity) => {
    set((state) => {
      const index = state.artifactActivities.findIndex((entry) => entry.id === activity.id)
      if (index === -1) return { artifactActivities: [...state.artifactActivities, activity] }
      const next = [...state.artifactActivities]
      next[index] = activity
      return { artifactActivities: next }
    })
  },

  setStreamingVitals: (v) => {
    set({ streamingVitals: v })
  },

  finishStream: (message: Message) => {
    set((state) => ({
      messages: state.messages.some((existing) => existing.id === message.id)
        ? state.messages
        : [...state.messages, message],
      // chat:done precedes chat:turn-settled. Keep the lock tied to the
      // active identity until the exact terminal event arrives.
      isStreaming: state.activeTurn !== null,
      streamingContent: '',
      streamingReasoning: '',
      streamingDocuments: [],
      streamingVisualizations: [],
      streamingVitals: null,
      streamStartedAt: null,
      runPhase: null
    }))
    get().loadConversations()
  },

  continueStreamAfterRound: (message: Message) => {
    set((state) => ({
      messages: state.messages.some((existing) => existing.id === message.id)
        ? state.messages
        : [...state.messages, message],
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
      streamingDocuments: [],
      streamingVisualizations: [],
      streamingVitals: null,
      streamStartedAt: Date.now(),
      runPhase: 'understanding'
    }))
  },

  appendSteerUserMessage: (message: Message) => {
    set((state) => ({
      messages: state.messages.some((existing) => existing.id === message.id)
        ? state.messages
        : [...state.messages, message]
    }))
  },

  streamError: (_error: string) => {
    set((state) => ({
      isStreaming: state.activeTurn !== null,
      streamingContent: '',
      streamingReasoning: '',
      streamingDocuments: [],
      streamingVisualizations: [],
      streamingVitals: null,
      streamStartedAt: null,
      runPhase: null
    }))
  },

  addToolCall: (event: ToolCallEvent) => {
    set((state) => state.toolCalls.some(call => call.callId === event.callId && call.serverId !== 'history') ? state : ({
      toolCalls: [
        ...state.toolCalls.filter(call => call.callId !== event.callId),
        {
          callId: event.callId,
          serverId: event.serverId,
          toolName: event.toolName,
          args: event.args,
          status: 'running',
          title: event.title,
          risks: event.risks,
          providerKind: event.providerKind,
          startedAt: event.startedAt,
          transcriptHidden: event.transcriptHidden
        }
      ]
    }))
  },

  updateToolCall: (event: ToolCallResultEvent) => {
    // Respect the backend's terminal status — earlier versions hard-coded
    // 'success' even for denied/error results, which made every red X look
    // like a green check until the user expanded the card.
    const finalStatus: ToolCallState['status'] = event.status ?? 'success'
    set((state) => ({
      toolCalls: state.toolCalls.map((tc) =>
        tc.callId === event.callId
          ? { ...tc, status: finalStatus, result: event.result, duration: event.duration }
          : tc
      )
    }))
  },

  clearToolCalls: () => {
    set({ toolCalls: [] })
  },

  setRunPhase: (phase: AgentRunPhase | null) => {
    set({ runPhase: phase })
  },

  addAttachments: (files: ProcessedFile[], owner = get().activeConversationId) => {
    if (!files.length) return
    // Seed rag-pending files with a queued phase so the chip can render an
    // "Indexing…" state immediately, before the auto-attach IPC returns.
    // JM-22 (RD-19) — stamp a stable clientId so ingest progress matches on
    // identity, not name+size.
    const seeded = files.map((f) => {
      const withId = f.clientId ? f : { ...f, clientId: crypto.randomUUID() }
      return withId.kind === 'rag-pending' && !withId.ragPhase
        ? { ...withId, ragPhase: 'queued' as const, ragProgress: 0 }
        : withId
    })
    updateOwnerAttachments(owner, files => [...files, ...seeded])
    for (const f of files) {
      if (f.error) toast.warning(`${f.name}: ${f.error}`)
    }

    // Route oversized files through the RAG ingest pipeline. Fired async —
    // each call ensures a per-conversation auto-collection, submits the
    // ingest job, and stamps the returned jobId onto the matching chip so
    // progress events can update it. The auto-attach IPC requires a
    // conversationId; if none exists yet we create one first.
    let taskCreation: Promise<string> | null = null
    for (const f of seeded) {
      if (f.kind !== 'rag-pending') continue
      if (!f.sourcePath) {
        console.warn('[chat-store] rag-pending file missing sourcePath:', f.name)
        continue
      }
      void (async () => {
        let convId = owner
        if (!convId) {
          taskCreation ??= get().createConversation().then(async id => { if (id) await useComposerStore.getState().move(owner, id); return id })
          convId = await taskCreation
          if (!convId) return
        }
        try {
          const res = await window.api.rag.autoAttach({
            conversationId: convId,
            filePath: f.sourcePath!,
            displayName: f.name
          })
          if (!res?.success) {
            const errMsg = res?.error ?? 'auto-attach failed'
            toast.error(`${f.name}: ${errMsg}`)
            updateOwnerAttachments(convId, files => files.map(a => a.clientId === f.clientId && a.kind === 'rag-pending' ? { ...a, ragPhase: 'error' as const, error: errMsg } : a))
            return
          }
          const { jobId, collectionId } = res.data as {
            jobId: string
            collectionId: string
          }
          updateOwnerAttachments(convId, files => files.map(a => a.clientId === f.clientId && a.kind === 'rag-pending' ? { ...a, ingestJobId: jobId, collectionId } : a))
        } catch (err) {
          const msg = (err as Error)?.message ?? 'auto-attach threw'
          toast.error(`${f.name}: ${msg}`)
          updateOwnerAttachments(convId, files => files.map(a => a.clientId === f.clientId ? { ...a, ragPhase: 'error' as const, error: msg } : a))
        }
      })()
    }
  },

  removeAttachment: (index: number) => {
    const removed = get().pendingAttachments[index]
    updateOwnerAttachments(get().activeConversationId, files => files.filter((_, i) => i !== index))
    // If a rag-pending chip is removed mid-ingest, drop the conversation→
    // collection link so augmentForChat stops querying it. We deliberately
    // do NOT delete the ingested document — it stays in the auto-collection
    // (cheap to keep, expensive to redo); the user can re-add the file later
    // by drag-drop and the dedupe-by-hash path in ingest will reuse it.
    if (removed?.kind === 'rag-pending' && removed.collectionId && window.api?.rag?.attachments) {
      const convId = get().activeConversationId
      if (convId) {
        void window.api.rag.attachments.remove({
          conversationId: convId,
          collectionId: removed.collectionId
        })
      }
    }
  },

  /** Internal: progress dispatcher for RAG ingest events. Wired from App.tsx
   *  to `window.api.rag.document.onProgress`. Matches by jobId; no-ops if
   *  the chip was already removed from pendingAttachments. */
  _updateRagAttachmentProgress: (event: {
    jobId: string
    documentId: string
    phase: string
    progress: number
    chunkCount?: number
    error?: string
  }) => {
    const owners = new Set<string | null>([get().activeConversationId, ...Object.keys(useComposerStore.getState().drafts).map(key => key === '__new__' ? null : key)])
    for (const owner of owners) updateOwnerAttachments(owner, files => files.map(a => {
      if (a.kind !== 'rag-pending' || a.ingestJobId !== event.jobId) return a
      return { ...a, documentId: event.documentId || a.documentId, ragPhase: event.phase as ProcessedFile['ragPhase'], ragProgress: event.progress, ragChunkCount: event.chunkCount ?? a.ragChunkCount, error: event.error ?? a.error }
    }))
  },

  clearAttachments: () => updateOwnerAttachments(get().activeConversationId, () => []),
  setAttachmentsProcessing: (v: boolean, owner = get().activeConversationId) => useComposerStore.getState().processing(owner, v),

  getRecentUserPrompts: (limit = 50) => {
    return getRecentUserPromptsFrom(get().messages, limit)
  }
}))

function updateOwnerAttachments(owner: string | null, update: (files: ProcessedFile[]) => ProcessedFile[]): void {
  const state = useChatStore.getState()
  const files = state.activeConversationId === owner ? state.pendingAttachments : useComposerStore.getState().drafts[composerOwnerKey(owner)]?.attachments ?? []
  const next = update(files)
  if (next.length === files.length && next.every((file, i) => file === files[i])) return
  useComposerStore.getState().patch(owner, { attachments: next })
}
function projectComposerAttachments(): void {
  const chat = useChatStore.getState()
  const draft = useComposerStore.getState().drafts[composerOwnerKey(chat.activeConversationId)] ?? EMPTY_COMPOSER_DRAFT
  if (chat.pendingAttachments !== draft.attachments || chat.attachmentsProcessing !== (draft.processing > 0)) useChatStore.setState({ pendingAttachments: draft.attachments, attachmentsProcessing: draft.processing > 0 })
}
useComposerStore.subscribe(projectComposerAttachments)
useChatStore.subscribe((state, previous) => {
  if (state.activeConversationId === previous.activeConversationId) return
  projectComposerAttachments()
})

let historyNavigationPending = false
export async function navigateTaskHistory(direction: 'back' | 'forward'): Promise<void> {
  if (historyNavigationPending) return
  historyNavigationPending = true
  const history = useNavHistoryStore.getState()
  try {
    await useChatStore.getState().loadConversations()
    history.startReplay()
    const id = direction === 'back' ? history.goBack() : history.goForward()
    if (id) await useChatStore.getState().selectConversation(id)
  } catch (error) { toast.error(errorMessage(error, 'Could not navigate task history')) }
  finally { history.endReplay(); historyNavigationPending = false }
}
