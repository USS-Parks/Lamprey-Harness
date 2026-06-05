import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useDocumentsStore } from '@/stores/documents-store'
import artifactsIconUrl from '@assets/Lamprey Code Window Icon.png'
import thinkingIconUrl from '@assets/Lamprey Thinking Icon.png'
import { ActivityFeed } from '@/components/artifacts/ActivityFeed'
import { PanelEmptyState } from '@/components/ui/PanelEmptyState'
import { DocumentCardRow } from '@/components/chat/DocumentCardRow'

// Docked Artifacts mode. Top section lists every `create_document`
// deliverable produced in this conversation — these are the user's
// downloadable files. Below that, ActivityFeed surfaces in-flight tool
// work while a turn is streaming; otherwise an empty state directs the
// user to ask for a renderable artifact. The transient <ArtifactPanel />
// in App.tsx still hijacks the right column for HTML / SVG / Mermaid /
// JSX renders.
export function ArtifactsPanel(): React.ReactElement {
  const isStreaming = useChatStore((s) => s.isStreaming)
  const toolCalls = useChatStore((s) => s.toolCalls)
  const activeConvId = useChatStore((s) => s.activeConversationId)
  const docs = useDocumentsStore((s) =>
    activeConvId ? s.byConv[activeConvId] : undefined
  )
  const loadDocs = useDocumentsStore((s) => s.load)

  // Fetch on mount and whenever the active conversation changes. Cheap —
  // one SQL scan per conversation — and the store caches so re-mounts
  // don't refetch. Live-event subscription in useChat keeps the cache
  // fresh during streaming.
  useEffect(() => {
    if (activeConvId && docs === undefined) {
      void loadDocs(activeConvId)
    }
  }, [activeConvId, docs, loadDocs])

  const showActivity = isStreaming || toolCalls.length > 0
  const hasDocs = !!docs && docs.length > 0

  // Documents header always renders if there are any docs; activity panel
  // sits beneath it. Empty state only fires when neither has anything.
  if (hasDocs) {
    // When activity is also present we cap the docs area so the live feed
    // stays visible; otherwise docs take the whole panel and scroll
    // internally. Both branches keep the outer column a flex container so
    // ActivityFeed's own `flex-1` continues to expand correctly.
    const docsClass = showActivity
      ? 'overflow-y-auto px-3 py-3 max-h-[50%]'
      : 'flex-1 overflow-y-auto px-3 py-3'
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <img
            src={artifactsIconUrl}
            alt=""
            aria-hidden
            className="icon-asset h-7 w-7 object-contain"
          />
          Documents
          <span className="ml-auto text-[11px] font-normal text-[var(--text-muted)]">
            {docs!.length} {docs!.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        <div className={docsClass}>
          <DocumentCardRow documents={docs!} />
        </div>
        {showActivity && (
          <>
            <div className="flex items-center gap-2 border-y border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)]">
              <img
                src={thinkingIconUrl}
                alt=""
                aria-hidden
                className="icon-asset h-9 w-9 animate-pulse object-contain"
              />
              Activity
            </div>
            <ActivityFeed />
          </>
        )}
      </div>
    )
  }

  if (showActivity) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <img
            src={thinkingIconUrl}
            alt=""
            aria-hidden
            className="icon-asset h-12 w-12 animate-pulse object-contain"
          />
          Activity
        </div>
        <ActivityFeed />
      </div>
    )
  }

  return (
    <PanelEmptyState
      icon={
        <img
          src={artifactsIconUrl}
          alt=""
          aria-hidden
          className="icon-asset h-10 w-10 object-contain"
        />
      }
      title="No artifacts yet"
      body="Documents the assistant produces appear here as downloadable files. HTML, SVG, Mermaid, or JSX artifacts open here when generated."
    />
  )
}
