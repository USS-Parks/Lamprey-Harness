import { useChatStore } from '@/stores/chat-store'
import { useSkillsStore } from '@/stores/skills-store'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { AttachmentPreview } from './AttachmentPreview'
import { FileDropZone } from './FileDropZone'
import { WelcomeScreen } from './WelcomeScreen'
import type { ToolApprovalRequest } from '@/lib/types'
import { AgentRunBanner } from './AgentRunBanner'
import { PlanModeBanner } from './PlanModeBanner'
import { ChapterSidebar } from './ChapterSidebar'
import { ChapterQuickJumper } from './ChapterQuickJumper'
import { SpawnTaskTray } from './SpawnTaskTray'
import { LineageChip } from './LineageChip'
import { TaskHeader } from './TaskHeader'
import { FollowUpQueue } from './FollowUpQueue'

// Shared chat column: max-width cap + internal padding. Messages and the
// input pill both use this so they sit in the same centered column no
// matter how wide the surrounding chat area gets. `max-w-4xl` (896 px) is
// the comfortable-reading width; `px-6` keeps content off the column edge.
export const CHAT_COLUMN_CLASS = 'mx-auto w-full max-w-4xl px-3 sm:px-6'

export function ChatView({ modalApprovals = [] }: { modalApprovals?: ToolApprovalRequest[] }) {
  // JM-24 (RD-6) — per-field selectors. The old selector-less useChatStore()
  // subscribed to the ENTIRE store, so streamingVitals heartbeats (every ~2s)
  // and every tool-call update re-rendered the whole chat tree. Each selector
  // below re-renders ChatView only when THAT slice changes.
  const messagesLoading = useChatStore(s => s.messagesLoading)
  const messagesError = useChatStore(s => s.messagesError)
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const streamStartedAt = useChatStore((s) => s.streamStartedAt)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const activeModel = useChatStore((s) => s.activeModel)
  const activeSkillIds = useSkillsStore((s) => s.activeSkillIds)

  const handleSend = (content: string) => {
    sendMessage(content, activeSkillIds)
  }

  return (
    <div
      className="chat-column relative flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent"
    >
      <FileDropZone />
      <TaskHeader />

      {/* Track 2 / C3 — persistent yellow banner above the conversation
          when plan mode is active. Self-hides when off. */}
      <PlanModeBanner conversationId={activeConversationId} />
      <LineageChip />

      {/* Track 2 / E2 — chapter TOC + Ctrl+G quick-jumper. The sidebar
          floats over the message list (top-right) and self-hides until
          the conversation has at least one chapter. The quick-jumper
          opens on Ctrl+G regardless of mount order. */}
      <ChapterSidebar conversationId={activeConversationId} />
      <ChapterQuickJumper conversationId={activeConversationId} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {messagesLoading && <p role="status" className="px-6 py-2 text-xs text-[var(--text-muted)]">Loading task…</p>}
        {messagesError && <div role="alert" className="px-6 py-2 text-sm text-[var(--error)]">{messagesError}<button className="min-h-8 px-2 underline" onClick={() => { if (activeConversationId) void useChatStore.getState().selectConversation(activeConversationId) }}>Retry task</button></div>}
        {!activeConversationId ? (
          <WelcomeScreen />
        ) : (
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            streamStartedAt={streamStartedAt}
            activeModel={activeModel}
          />
        )}
      </div>

      {/* Input area mirrors the messages column's scrollbar gutter so both
          columns center on the same axis — without `pr-[6px]` here the
          messages list (which has scrollbar-gutter: stable) sits 3 px to
          the left of the input pill at any chat-column width, which reads
          as a permanent half-step misalignment between the pipeline pill /
          input pill and the message bubbles above. The 6 px matches the
          ::-webkit-scrollbar width set in src/styles/index.css. */}
      <div className="flex max-h-[70dvh] shrink-0 justify-center overflow-y-auto pt-3 pb-4 pr-[6px]">
        <div className={`${CHAT_COLUMN_CLASS} flex flex-col`}>
          <AgentRunBanner modalApprovals={modalApprovals} />
          <SpawnTaskTray />
          <FollowUpQueue />
          <AttachmentPreview />
          <ChatInput
            onSend={handleSend}
            onCancel={cancelStream}
            isStreaming={!!activeConversationId && isStreaming}
          />
        </div>
      </div>
    </div>
  )
}
