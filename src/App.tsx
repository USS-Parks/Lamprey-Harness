import { TerminalDock } from '@/components/tools/TerminalDock'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Titlebar } from '@/components/layout/Titlebar'
import { ChatView } from '@/components/chat/ChatView'
import { ToolsPanel } from '@/components/tools/ToolsPanel'
import { QuickOpenPalette } from '@/components/tools/QuickOpenPalette'
import { WorkflowPalette } from '@/components/workflows/WorkflowPalette'
import { WorktreeManagerModal } from '@/components/worktree/WorktreeManagerModal'
import { ApiKeyModal } from '@/components/settings/ApiKeyModal'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { CustomizeView } from '@/components/customize/CustomizeView'
import { ProjectHome } from '@/components/projects/ProjectHome'
import { ToolApprovalModal } from '@/components/tools/ToolApprovalModal'
import { approvalKey, routeApproval } from '@/lib/approval-routing'
import { useInlineApprovalsStore } from '@/stores/inline-approvals-store'
import { MemoryModal } from '@/components/memory/MemoryModal'
import { ToastContainer } from '@/components/ui/Toast'
import { useChatStore } from '@/stores/chat-store'
import { useModelStore } from '@/stores/model-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePlanStore } from '@/stores/plan-store'
import { useProvidersStore, type ProviderEntry } from '@/stores/providers-store'
import { useUiStore, RIGHT_PANEL_BOUNDS } from '@/stores/ui-store'
import { toast } from '@/stores/toast-store'
import { useChat } from '@/hooks/useChat'
import { useMcp } from '@/hooks/useMcp'
import { useSkills } from '@/hooks/useSkills'
import { useMemory } from '@/hooks/useMemory'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useShellSignals } from '@/hooks/useShellSignals'
import { useMediaQuery, NARROW_VIEWPORT_QUERY } from '@/hooks/useMediaQuery'
import { UpdateBanner } from '@/components/ui/UpdateBanner'
import { SecurityBanner } from '@/components/ui/SecurityBanner'
import { IntegrityBanner } from '@/components/persistence/IntegrityBanner'
import { AsyncEventToast } from '@/components/chat/AsyncEventToast'
import { AskUserModal } from '@/components/chat/AskUserModal'
import { useResearchProgressSubscription } from '@/hooks/useResearchProgress'
import artifactsPlaceholderUrl from '@assets/Lamprey Code Window Icon.png'
import type { ToolApprovalRequest } from '@/lib/types'

function App(): React.ReactElement {
  const [needsApiKey, setNeedsApiKey] = useState<boolean | null>(null)
  const [initializationError, setInitializationError] = useState('')
  const [initializationAttempt, setInitializationAttempt] = useState(0)
  // JM-23 (RD-4) — a QUEUE, not a single slot. setApprovalRequest used to
  // overwrite any modal-routed request already showing; the replaced one had
  // no surface and died to the main-process 30s auto-deny unseen (e.g. main
  // chat + side chat each raising a gated call). The head of the queue is the
  // visible modal; resolving it advances to the next.
  const approvalQueue = useInlineApprovalsStore(s => s.modalQueue)
  const approvalRequest = approvalQueue[0] ?? null
  const enqueueApproval = useInlineApprovalsStore(s => s.pushModal)
  const dequeueApproval = useCallback(() => {
    if (approvalRequest) useInlineApprovalsStore.getState().dismiss(approvalRequest.callId)
  }, [approvalRequest])
  // Fluidity J5: inline approval chips for previously-approved,
  // non-destructive tool calls. The set tracks (server, tool) pairs we've
  // seen approved at least once this session — first sighting still gets
  // the heavyweight modal so the user reads the descriptor + args once.
  const approvedSeenRef = useRef<Set<string>>(new Set())
  const pushInlineApproval = useInlineApprovalsStore((s) => s.push)
  const loadConversations = useChatStore((s) => s.loadConversations)
  const loadModels = useModelStore((s) => s.loadModels)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const openSettings = useUiStore((s) => s.openSettings)
  const customizeOpen = useUiStore((s) => s.customizeOpen)
  const projectViewId = useUiStore((s) => s.projectViewId)
  const closeProjectView = useUiStore((s) => s.closeProjectView)
  const rightPanelCollapsed = useUiStore((s) => s.rightPanelCollapsed)
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth)
  const setRightPanelCollapsed = useUiStore((s) => s.setRightPanelCollapsed)
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth)
  const activeTool = useUiStore((s) => s.activeTool)
  const isNarrow = useMediaQuery(NARROW_VIEWPORT_QUERY)

  // Track the chat workspace column's measured width so the card can
  // decide whether the empty right margin beside the centered chat
  // content is wide enough to fit a 180px floating card without
  // overlapping message bubbles. ResizeObserver re-fires on sidebar
  // resize / window resize / DPI change.

  // D12 — subscribe the renderer to research:progress / completed / failed
  // event streams. Mounted once at App root; banner subscribers read
  // snapshots from the resulting Zustand store.
  useResearchProgressSubscription()

  const handleRightResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = rightPanelWidth
      const onMove = (me: MouseEvent) => {
        const delta = startX - me.clientX
        const next = Math.max(
          RIGHT_PANEL_BOUNDS.min,
          Math.min(RIGHT_PANEL_BOUNDS.max, startWidth + delta)
        )
        setRightPanelWidth(next)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        // JM-25 (RD-20) — also detach on blur/pointercancel. A drag
        // interrupted by window blur or devtools opening never fired mouseup,
        // leaving the col-resize cursor stuck and the move listener live.
        window.removeEventListener('blur', onUp)
        document.removeEventListener('pointercancel', onUp)
        document.body.style.cursor = ''
      }
      document.body.style.cursor = 'col-resize'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      window.addEventListener('blur', onUp)
      document.addEventListener('pointercancel', onUp)
    },
    [rightPanelWidth, setRightPanelWidth]
  )

  // Wire IPC event listeners + shortcuts
  useChat()
  useMcp()
  useSkills()
  useMemory()
  useKeyboardShortcuts()
  useShellSignals()

  const autoOpenRightPanel = useUiStore((s) => s.autoOpenRightPanel)
  const hydrateRightPanelForConv = useUiStore((s) => s.hydrateRightPanelForConv)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const workspaceProjectId = useChatStore((s) => s.conversations.find(conversation => conversation.id === s.activeConversationId)?.projectId ?? null)

  const handleArtifactOpen = useCallback(async (type: string, source: string) => {
    const owner = useChatStore.getState().activeConversationId
    try {
      const result = await window.api.artifact.render(type, source, { preview: false })
      if (!result.success || !result.data?.artifactId) throw new Error(result.error ?? 'The artifact could not be saved. Try opening it again.')
      if (useChatStore.getState().activeConversationId !== owner) return
      useUiStore.getState().openWorkspaceResource('artifact', result.data.artifactId, `${type} artifact`)
    } catch (error) { toast.error(String(error)) }
  }, [])

  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__openArtifact = handleArtifactOpen
    return () => {
      delete (window as unknown as Record<string, unknown>).__openArtifact
    }
  }, [handleArtifactOpen])

  // Fluidity J11: a tool launch is a trigger that should auto-open the
  // right panel — same one-pop-per-trigger rule the artifact emit uses.
  useEffect(() => {
    if (!activeTool) return
    const convId = useChatStore.getState().activeConversationId
    if (!convId) return
    autoOpenRightPanel(convId, `tool:${activeTool}`)
  }, [activeTool, autoOpenRightPanel])

  // Plan-mode gate engages → surface the Plan card immediately so the
  // user can't miss the approval requirement. Tracks the previous value
  // in a ref so the effect only fires on the *transition* into the
  // gated state; subsequent renders while gated don't re-pop the panel
  // if the user has manually moved off the Plan card. The plan-store
  // already enforces plan-mode at the dispatcher level — this is purely
  // a UI nudge.
  const planModeActive = usePlanStore((s) => s.planModeActive)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const prevPlanGateRef = useRef<boolean | null>(null)
  useEffect(() => {
    const wasGated = prevPlanGateRef.current === true
    prevPlanGateRef.current = planModeActive
    if (planModeActive !== true || wasGated) return
    const convId = useChatStore.getState().activeConversationId
    if (!convId) return
    autoOpenRightPanel(convId, 'plan:gated')
    setActiveTool('plan')
  }, [planModeActive, autoOpenRightPanel, setActiveTool])

  // Fluidity J11: hydrate the global collapsed flag from the per-conv map
  // every time the active conversation changes. New conversations seed
  // to collapsed; existing ones restore their last manual / auto state.
  useEffect(() => {
    hydrateRightPanelForConv(activeConversationId, workspaceProjectId)
  }, [activeConversationId, workspaceProjectId, hydrateRightPanelForConv])

  // Narrow-viewport drawer: Esc closes (collapses the right panel) so the
  // chat takes the full width back. Only active while the drawer is open.
  useEffect(() => {
    if (!isNarrow || rightPanelCollapsed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const target = e.target
        if (target instanceof HTMLElement) {
          const tag = target.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
        }
        e.preventDefault()
        setRightPanelCollapsed(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isNarrow, rightPanelCollapsed, setRightPanelCollapsed])

  useEffect(() => {
    if (!window.api) return
    const unsubscribe = window.api.tools.onApprovalRequired((e: unknown) => {
      const req = e as ToolApprovalRequest
      const surface = routeApproval(
        { serverId: req.serverId, name: req.name, risks: req.risks ?? [] },
        { approvedSeen: approvedSeenRef.current }
      )
      if (surface === 'chip') {
        pushInlineApproval(req)
      } else {
        enqueueApproval(req)
      }
    })
    return unsubscribe
  }, [pushInlineApproval, enqueueApproval])

  useEffect(() => {
    if (!window.api) return
    // JM-25 (RD-8) — collect disposers so StrictMode's double-mount (and any
    // future App remount) doesn't accumulate duplicate toast listeners. The
    // preload on* methods now return a disposer.
    const disposers: Array<() => void> = []
    const track = (d: unknown): void => {
      if (typeof d === 'function') disposers.push(d as () => void)
    }
    track(
      window.api.chat.onError((e: { conversationId: string; error: string }) => {
        toast.error(e.error || 'Chat error')
      })
    )
    track(
      window.api.app.onError((e: { message: string }) => {
        toast.error(e.message)
      })
    )
    track(
      window.api.app.onWarning((e: { message: string }) => {
        toast.warning(e.message)
      })
    )
    return () => {
      for (const d of disposers) d()
    }
  }, [])

  // RAG ingest progress → forwarded to chat-store so rag-pending attachment
  // chips update live (queued → loading → chunking → embedding → ready).
  // The Library UI subscribes to the same channel separately; both
  // subscribers are independent, no fan-in conflict.
  useEffect(() => {
    if (!window.api?.rag?.document?.onProgress) return
    const unsubscribe = window.api.rag.document.onProgress((e: unknown) => {
      const evt = e as {
        jobId?: unknown
        documentId?: unknown
        phase?: unknown
        progress?: unknown
        chunkCount?: unknown
        error?: unknown
      }
      if (typeof evt?.jobId !== 'string' || typeof evt?.phase !== 'string') return
      useChatStore.getState()._updateRagAttachmentProgress({
        jobId: evt.jobId,
        documentId: typeof evt.documentId === 'string' ? evt.documentId : '',
        phase: evt.phase,
        progress: typeof evt.progress === 'number' ? evt.progress : 0,
        chunkCount: typeof evt.chunkCount === 'number' ? evt.chunkCount : undefined,
        error: typeof evt.error === 'string' ? evt.error : undefined
      })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!window.api?.loops?.onFired) return
    const unsubscribe = window.api.loops.onFired((e: unknown) => {
      const event = e as { wakeup?: { conversationId?: string } }
      const conversationId = event?.wakeup?.conversationId
      const chat = useChatStore.getState()
      if (conversationId && chat.activeConversationId === conversationId) {
        void window.api.conversation.getMessages(conversationId).then((result) => {
          if (result.success) useChatStore.setState({ messages: result.data })
        })
      }
      void chat.loadConversations()
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!window.api?.notifications?.onClicked) return
    const unsubscribe = window.api.notifications.onClicked((e: unknown) => {
      const event = e as { deepLink?: unknown }
      const deepLink = typeof event.deepLink === 'string' ? event.deepLink : ''
      const match = deepLink.match(/^(?:conversation:|lamprey:\/\/conversation\/)(.+)$/)
      const conversationId = match?.[1]
      if (conversationId) void useChatStore.getState().selectConversation(conversationId)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!window.api?.sessionsMessaging?.onIncoming) return
    const unsubscribe = window.api.sessionsMessaging.onIncoming((e: unknown) => {
      const event = e as { targetSessionId?: string }
      const chat = useChatStore.getState()
      if (event.targetSessionId && chat.activeConversationId === event.targetSessionId) {
        toast.info('Incoming session message queued for the next turn')
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    let disposed = false
    setNeedsApiKey(null)
    setInitializationError('')
    const init = async () => {
      if (!window.api) throw new Error('Open Lamprey desktop. The desktop bridge is unavailable.')
      const providerList = await window.api.settings.listProviderKeys()
      let needsKey: boolean
      if (providerList.success) {
        const providers = providerList.data as ProviderEntry[]
        useProvidersStore.getState().setProviders(providers)
        needsKey = !providers.some((p) => p.hasKey)
      } else {
        const fallback = await window.api.settings.hasApiKey()
        if (!fallback.success) throw new Error(fallback.error || 'Could not load provider configuration.')
        needsKey = !fallback.data
      }
      await Promise.all([loadConversations(), loadModels(), loadSettings()])
      if (disposed) return
      if (!useSettingsStore.getState().loaded) throw new Error('Could not load settings. Try again.')
      const { activeModel, models } = useModelStore.getState()
      if (!useChatStore.getState().activeConversationId) useChatStore.setState({ activeModel })
      const provider = models.find(model => model.id === activeModel)?.provider
      if (useProvidersStore.getState().byId(provider ?? '')?.keyOptional) needsKey = false
      setNeedsApiKey(needsKey)
    }
    void init().catch(error => { if (!disposed) setInitializationError(error instanceof Error ? error.message : 'Could not initialize Lamprey.') })
    return () => { disposed = true }
  }, [initializationAttempt])

  if (needsApiKey === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-primary)]">
        {initializationError ? <div role="alert" className="max-w-md p-4 text-sm text-[var(--text-primary)]">
          <p>{initializationError}</p>
          <button className="mt-3 rounded bg-[var(--accent)] px-3 py-2 text-white" onClick={() => setInitializationAttempt(attempt => attempt + 1)}>Retry</button>
        </div> : <div className="font-mono text-sm text-[var(--text-muted)]">Loading...</div>}
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      {needsApiKey && (
        <ApiKeyModal
          onUseLocal={() => { setNeedsApiKey(false); openSettings('models') }}
          onComplete={() => {
            setNeedsApiKey(false)
          }}
        />
      )}

      {settingsOpen && <SettingsDialog onClose={closeSettings} />}

      {customizeOpen && <CustomizeView />}

      {projectViewId && <ProjectHome projectId={projectViewId} onClose={closeProjectView} />}

      <MemoryModal />

      {approvalRequest && (
        <ToolApprovalModal
          key={approvalRequest.callId}
          request={approvalRequest}
          onResolved={dequeueApproval}
          onAllowed={(req) => {
            approvedSeenRef.current.add(approvalKey(req.serverId, req.name))
          }}
        />
      )}

      <Titlebar onSettingsClick={openSettings} />

      {/* Task content and contextual workspace share the area below the titlebar. */}
      <div className="flex flex-1 gap-[var(--panel-gap)] overflow-hidden p-[var(--panel-gap)]">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 gap-[var(--panel-gap)]">
        <div className="flex min-w-0 flex-1 flex-col">
          <IntegrityBanner />
          <SecurityBanner />
          <UpdateBanner />
          <div className="flex flex-1 overflow-hidden bg-transparent p-2">
            <ChatView modalApprovals={approvalQueue} />
          </div>
        </div>

        {/* On desktop the right panel is part of the flex row (rail when
            collapsed, full panel when expanded). On narrow viewports it's
            lifted out into a fixed slide-over drawer (see block below). */}
        {!isNarrow && rightPanelCollapsed && (
          <div className="panel-shadow flex h-full w-8 flex-col items-center rounded-[var(--panel-radius)] bg-[var(--panel-bg)] py-2">
            <button
              onClick={() => setRightPanelCollapsed(false)}
              title="Expand artifacts panel"
              aria-label="Expand artifacts panel"
              className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <img src={artifactsPlaceholderUrl} alt="" aria-hidden className="icon-asset themed-variant-light mt-2 h-[25px] w-[25px] object-contain opacity-60" />
          </div>
        )}
        {!isNarrow && !rightPanelCollapsed && (
          <div
            className="panel-shadow relative flex flex-col overflow-hidden rounded-[var(--panel-radius)] bg-[var(--panel-bg)]"
            style={{ width: rightPanelWidth, minWidth: rightPanelWidth }}
          >
            <div
              onMouseDown={handleRightResizeStart}
              onDoubleClick={() => setRightPanelWidth(RIGHT_PANEL_BOUNDS.default)}
              title="Drag to resize · double-click to reset"
              role="separator"
              aria-orientation="vertical"
              aria-label="Workspace width"
              aria-valuenow={rightPanelWidth}
              aria-valuemin={RIGHT_PANEL_BOUNDS.min}
              aria-valuemax={RIGHT_PANEL_BOUNDS.max}
              tabIndex={0}
              onKeyDown={event => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  setRightPanelWidth(rightPanelWidth + (event.key === 'ArrowLeft' ? 20 : -20))
                } else if (event.key === 'Home') setRightPanelWidth(RIGHT_PANEL_BOUNDS.default)
              }}
              className="resize-handle-v resize-handle-v-left"
            />
            <ToolsPanel onCollapse={() => setRightPanelCollapsed(true)} />
          </div>
        )}

        </div>
        <TerminalDock />
        </div>
      </div>

      {/* Narrow-viewport drawer. Slides in from the right with a backdrop
          when the right panel is "open" on narrow viewports. Doesn't render
          when collapsed (the chat takes full width); the user re-opens via
          the right-panel toggle in Titlebar row 1. */}
      {isNarrow && !rightPanelCollapsed && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setRightPanelCollapsed(true)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Workspace panel"
            className="fixed bottom-0 right-0 top-0 z-30 flex flex-col overflow-hidden rounded-l-[var(--panel-radius)] bg-[var(--panel-bg)] shadow-2xl"
            style={{
              width: `min(${rightPanelWidth}px, calc(100vw - 24px))`,
              transition: 'transform 200ms ease-out',
              transform: 'translateX(0)'
            }}
          >
            <ToolsPanel onCollapse={() => setRightPanelCollapsed(true)} />
          </aside>
        </>
      )}


      <QuickOpenPalette />
      <WorkflowPalette />
      <WorktreeManagerModal />
      <AsyncEventToast />
      <AskUserModal />

      {/* Viewport-fixed floating overlay. Anchored to viewport coords so
          when the right panel expands the card stays put and retreats
          rightward as it fades — instead of being dragged leftward by a
          shrinking parent. The right panel mounts underneath it and is
          revealed as the card fades out. */}

      <ToastContainer />
    </div>
  )
}

export default App
