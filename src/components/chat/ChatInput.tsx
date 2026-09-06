import { ModelDropdown } from './ModelDropdown'
import { TaskContext } from '@/components/workspace/TaskContext'
import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useModelStore } from '@/stores/model-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useProvidersStore } from '@/stores/providers-store'
import { useUiStore, type PermissionsMode } from '@/stores/ui-store'
import { toast } from '@/stores/toast-store'
import { PopoverMenu } from '@/components/ui/PopoverMenu'
import { ApiKeyModal } from '@/components/settings/ApiKeyModal'
import { SlashCommandPalette } from './SlashCommandPalette'
import { AtFileMention } from './AtFileMention'
import { ToolActivityChip } from './ToolActivityChip'
import { useSlashCommandsStore } from '@/stores/slash-commands-store'
import { usePlanStore } from '@/stores/plan-store'
import { useLoopsStore } from '@/stores/loops-store'
import { parseLoopCommand } from '@/lib/parse-loop-command'
import { detectAtMention } from '@/lib/file-rank'
import { detectMemoryShortcut } from '@/lib/memory-shortcut'
import {
  emptyHistoryState,
  historyDown,
  historyReset,
  historyUp,
  type PromptHistoryState
} from '@/lib/prompt-history'
import { currentSlot, nextMode, slotLabel } from '@/lib/mode-cycle'
import { usePlanMode } from '@/hooks/usePlanMode'
import type { ProcessedFile } from '@/lib/types'

import defaultAccessIcon from '@assets/Lamprey Default Access Icon.png'
import autoReviewIcon from '@assets/Lamprey Auto-Review Icon.png'
import fullAccessIcon from '@assets/Lamprey Full Access Icon.png'
import sendIcon from '@assets/Lamprey Prompt Enter Icon.png'

interface ChatInputProps {
  onSend: (content: string) => void
  onCancel: () => void
  isStreaming: boolean
  disabled?: boolean
}

const LONG_PASTE_THRESHOLD = 500

interface PermissionOption {
  id: PermissionsMode
  label: string
  icon: string
}

const PERMISSION_OPTIONS: PermissionOption[] = [
  { id: 'default', label: 'Default permissions', icon: defaultAccessIcon },
  { id: 'auto-review', label: 'Auto Review', icon: autoReviewIcon },
  { id: 'full', label: 'Full Access', icon: fullAccessIcon }
]

function looksLikeCode(text: string): boolean {
  if (text.length < LONG_PASTE_THRESHOLD) return false
  const lines = text.split(/\r?\n/)
  if (lines.length < 5) return false
  let signals = 0
  if (/[{};]\s*$/m.test(text)) signals++
  if (/^\s*(import|from|const|let|var|function|class|def|public|private)\b/m.test(text)) signals++
  if (/^\s*[{[]\s*$/m.test(text) && /^\s*[}\]]\s*$/m.test(text)) signals++
  if (/<\/?[a-zA-Z][^>]*>/.test(text)) signals++
  return signals >= 1
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

function ChevronDown() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

interface DropdownButtonProps {
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  title?: string
}

function DropdownButton({ open, onToggle, children, title }: DropdownButtonProps) {
  return (
    <button
      onClick={onToggle}
      title={title}
      aria-expanded={open}
      className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
    >
      {children}
      <ChevronDown />
    </button>
  )
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [active, onOutside, ref])
}

function CodingModeToggle() {
  // Pill mirrors AppSettings.agenticCodingMode. Persists via the standard
  // settings store, so the chat input and the SettingsDialog stay in sync
  // both ways without a separate IPC channel.
  const on = useSettingsStore((s) => s.settings.agenticCodingMode)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const openSettings = useUiStore((s) => s.openSettings)

  const handleToggle = () => {
    void updateSettings({ agenticCodingMode: !on })
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      onContextMenu={(e) => {
        e.preventDefault()
        openSettings('agenticCoding')
      }}
      title={
        on
          ? 'Agentic coding mode is ON · click to turn off · right-click to configure'
          : 'Turn on agentic coding mode (coding contract + codex skills + composer) · right-click to configure'
      }
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
        on
          ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
          : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          on ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'
        }`}
        aria-hidden
      />
      <span className="font-mono uppercase tracking-wider">Coding</span>
    </button>
  )
}

function WorkingModeMenu() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const coding = useSettingsStore(s => s.settings.agenticCodingMode)
  const localPlan = useUiStore(s => s.planMode)
  const plan = usePlanMode()
  const active = localPlan || plan.active
  const togglePlan = async () => {
    if (busy) return
    setBusy(true)
    const owner = useChatStore.getState().activeConversationId
    try {
      const enabled = !active
      const ok = !owner || await (enabled ? plan.enter() : plan.exit())
      if (!ok) { toast.error('Could not change plan mode.'); return }
      if (useChatStore.getState().activeConversationId === owner) useUiStore.getState().setPlanMode(owner ? false : enabled)
    } catch (failure) { toast.error(String(failure)) }
    finally { setBusy(false) }
  }
  return <>
    <button ref={anchor} type="button" aria-label="Working mode" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} className="flex min-h-8 items-center gap-1 rounded px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">
      {active ? 'Plan' : coding ? 'Coding' : 'Chat'} <ChevronDown />
    </button>
    <PopoverMenu open={open} onClose={() => setOpen(false)} anchorRef={anchor} align="top-start" ariaLabel="Working mode">
      <div className="space-y-1 p-2">
        <CodingModeToggle />
        <button type="button" aria-pressed={active} disabled={busy} onClick={() => void togglePlan()} className="flex min-h-8 w-full items-center justify-between gap-3 rounded px-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50">
          Plan before editing <span>{active ? 'On' : 'Off'}</span>
        </button>
        <button type="button" onClick={() => { setOpen(false); useUiStore.getState().openSettings('agenticCoding') }} className="min-h-8 rounded px-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]">Coding settings</button>
      </div>
    </PopoverMenu>
  </>
}

function PermissionsDropdown() {
  const mode = useUiStore((s) => s.permissionsMode)
  const setMode = useUiStore((s) => s.setPermissionsMode)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useClickOutside(wrapRef, () => setOpen(false), open)

  const active = PERMISSION_OPTIONS.find((o) => o.id === mode) ?? PERMISSION_OPTIONS[0]

  return (
    <div ref={wrapRef} className="relative">
      <DropdownButton open={open} onToggle={() => setOpen((v) => !v)} title="Permissions mode">
        <img
          src={active.icon}
          alt=""
          aria-hidden
          className="icon-asset h-[25px] w-[25px] object-contain"
        />
        <span>{active.label}</span>
      </DropdownButton>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-52 overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--bg-secondary)] shadow-xl">
          {PERMISSION_OPTIONS.map((opt) => {
            const icon = opt.icon
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setMode(opt.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  opt.id === mode
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <img
                  src={icon}
                  alt=""
                  aria-hidden
                  className="icon-asset h-[25px] w-[25px] object-contain"
                />
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AddMenu({ onPickFile, onInsertSlash }: { onPickFile: () => void; onInsertSlash: () => void }) {
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const items = [
    { label: 'Add files or photos', shortcut: 'Ctrl/Cmd+U', onSelect: onPickFile },
    { label: 'Slash commands', onSelect: onInsertSlash },
    { label: 'Connectors', onSelect: () => useUiStore.getState().openCustomize('connectors') },
    { label: 'Plugins', onSelect: () => useUiStore.getState().openCustomize('plugins') },
    { label: 'Keyboard help', onSelect: () => setHelp(true) }
  ]
  return <>
    <button ref={anchor} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title="Add" aria-label="Add" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
    </button>
    <PopoverMenu open={open} onClose={() => setOpen(false)} anchorRef={anchor} align="top-start" width={260} ariaLabel="Add to prompt">
      {items.map(item => <button key={item.label} type="button" onClick={() => { setOpen(false); item.onSelect() }} className="flex min-h-9 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"><span>{item.label}</span>{item.shortcut && <span className="text-[var(--text-muted)]">{item.shortcut}</span>}</button>)}
    </PopoverMenu>
    <PopoverMenu open={help} onClose={() => setHelp(false)} anchorRef={anchor} align="top-start" width="min(380px, calc(100vw - 16px))" role="dialog" ariaLabel="Composer keyboard help">
      <div className="max-h-[65vh] space-y-3 overflow-y-auto p-3 text-xs text-[var(--text-primary)]">
        <p className="font-medium">Writing a prompt</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt>Enter</dt><dd>Send when idle</dd><dt>Shift+Enter</dt><dd>New line</dd>
          <dt>↑ / ↓</dt><dd>Recall prompts from the first line; Escape restores your draft</dd>
          <dt>Shift+Tab</dt><dd>Cycle permissions and plan mode in an empty prompt</dd>
          <dt>Ctrl/Cmd+U</dt><dd>Attach files</dd><dt>@file</dt><dd>Attach a workspace file</dd>
          <dt>/command</dt><dd>Find a slash command</dd><dt>#note</dt><dd>Open the memory editor</dd>
          <dt>Ctrl/Cmd+K</dt><dd>Workflow commands</dd><dt>Ctrl/Cmd+P</dt><dd>Find workspace files</dd>
          <dt>Escape</dt><dd>Close the current menu or stop the active turn</dd>
        </dl>
        <p className="text-[var(--text-muted)]">During a turn, use Steer or Queue to submit a follow-up. Stop stays beside them.</p>
        <button type="button" onClick={() => { setHelp(false); anchor.current?.focus() }} className="min-h-8 rounded px-2 hover:bg-[var(--bg-tertiary)]">Close keyboard help</button>
      </div>
    </PopoverMenu>
  </>
}

export function ChatInput({ onSend, onCancel, isStreaming, disabled }: ChatInputProps) {
  const [content, setContent] = useState('')
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false)
  const [pasteOffer, setPasteOffer] = useState<string | null>(null)
  const [keyPromptProvider, setKeyPromptProvider] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const followUpClientIdRef = useRef<{ key: string; id: string } | null>(null)
  const followUpBusyRef = useRef(false)
  const [followUpMenuOpen, setFollowUpMenuOpen] = useState(false)
  const followUpAnchor = useRef<HTMLButtonElement>(null)
  // Fluidity J1: ↑/↓ walks past user prompts. Index tracking lives in a ref
  // so re-renders triggered by setContent() don't reset our position.
  const historyRef = useRef<PromptHistoryState>(emptyHistoryState)
  const addAttachments = useChatStore((s) => s.addAttachments)
  const setProcessing = useChatStore((s) => s.setAttachmentsProcessing)
  const composeSeedToken = useUiStore((s) => s.composeSeedToken)
  const consumeComposeDraft = useUiStore((s) => s.consumeComposeDraft)
  const seedMemoryDescription = useUiStore((s) => s.seedMemoryDescription)
  const refreshProviders = useProvidersStore((s) => s.refresh)
  const providersLoaded = useProvidersStore((s) => s.loaded)
  const activeModel = useChatStore((s) => s.activeModel)
  const contextRevision = useUiStore(s => s.workspaceContextRevision)
  const owner = useChatStore(s => s.activeConversationId)
  const activeTurn = useChatStore((s) => s.activeTurn)
  const pendingAttachments = useChatStore((s) => s.pendingAttachments)
  const submitFollowUp = useChatStore((s) => s.submitFollowUp)
  const followUpBehavior = useSettingsStore((s) => s.settings.followUpBehavior)
  const updateSettings = useSettingsStore(s => s.updateSettings)
  const allModels = useModelStore((s) => s.models)
  const activeModelInfo = allModels.find((m) => m.id === activeModel)
  const activeProvider = activeModelInfo?.provider
  const activeProviderConfigured = useProvidersStore((s) => s.canUse(activeProvider))
  const activeProviderHasKey = activeProvider ? !providersLoaded || activeProviderConfigured : true

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [content])

  useEffect(() => {
    if (composeSeedToken === 0) return
    const seed = consumeComposeDraft()
    if (!seed) return
    setContent(seed)
    const ta = textareaRef.current
    if (ta) {
      ta.focus()
      requestAnimationFrame(() => {
        const len = ta.value.length
        ta.setSelectionRange(len, len)
      })
    }
  }, [composeSeedToken, consumeComposeDraft])

  const handleSlashCommand = async (raw: string): Promise<boolean> => {
    const tokens = raw.trim().split(/\s+/)
    const cmd = tokens[0]?.toLowerCase()
    const activeConvId = useChatStore.getState().activeConversationId
    switch (cmd) {
      case '/compact': {
        if (!activeConvId) {
          toast.error('No active conversation.')
          return true
        }
        toast.info('Compacting conversation…')
        const res = await window.api?.conversation?.compact(activeConvId)
        if (!res?.success) {
          toast.error(res?.error ?? 'Compact failed')
        } else {
          await useChatStore.getState().selectConversation(activeConvId)
          toast.success('Conversation compacted.')
        }
        return true
      }
      case '/fork': {
        if (!activeConvId) {
          toast.error('No active conversation.')
          return true
        }
        const res = await window.api?.conversation?.fork(activeConvId)
        if (!res?.success) {
          toast.error(res?.error ?? 'Fork failed')
        } else {
          await useChatStore.getState().loadConversations()
          // JM-22 (RD-2) — conversation:fork returns { conversationId }, not
          // { id }. Reading .id navigated to selectConversation(undefined).
          const forked = res.data as { conversationId: string }
          await useChatStore.getState().selectConversation(forked.conversationId)
          toast.success('Forked conversation.')
        }
        return true
      }
      case '/models': {
        // Open settings on the Models pane — closest hook we have.
        useUiStore.getState().openSettings()
        toast.info('Pick a model in Settings → Models')
        return true
      }
      case '/fast': {
        toast.info('Fast mode is not yet wired to a provider in Lamprey.')
        return true
      }
      case '/plan': {
        // Track 2 / C4 + C3 — `/plan` now flips the real per-conversation
        // dispatcher gate (PlanModeBanner appears). The legacy UI flag
        // and Shift+Tab toggle keep working alongside it for now.
        if (activeConvId) {
          const ok = await usePlanStore.getState().enterPlanMode(activeConvId)
          if (ok) toast.success('Plan mode is on. Mutating tools are blocked.')
          else toast.error('Failed to enter plan mode.')
        } else {
          toast.error('No active conversation.')
        }
        return true
      }
      case '/clear': {
        // Track 2 / C4 — renderer-side clear: drop visible messages but
        // keep the conversation row. The `clear.md` template is hidden in
        // the palette and only resolves through IPC for harness use.
        useChatStore.setState({ messages: [], streamingContent: '', streamingReasoning: '' })
        toast.info('Cleared visible messages.')
        return true
      }
      case '/loop': {
        // Loop Phase LP-8 — start a recurring loop in the current conversation.
        //   /loop <task>           self-paced (model paces itself)
        //   /loop 5m <task>        interval (fixed cadence)
        //   /loop --auto <mission> autonomous (drains + grows its own backlog)
        if (!useSettingsStore.getState().settings.loopsEnabled) {
          toast.error('Loops are off. Enable them in Settings → Loops.')
          return true
        }
        const rest = raw
          .trim()
          .slice(cmd?.length ?? 0)
          .trim()
        const parsed = parseLoopCommand(rest)
        if (parsed.error) {
          toast.error(parsed.error)
          return true
        }
        const loop = await useLoopsStore.getState().create({
          mode: parsed.mode,
          conversationId: activeConvId ?? undefined,
          instruction: parsed.instruction,
          intervalSeconds: parsed.intervalSeconds,
          tasks: parsed.tasks
        })
        if (loop) {
          toast.success(`Loop started (${parsed.mode.replace('_', '-')}).`)
          if (loop.conversationId && loop.conversationId !== activeConvId) {
            await useChatStore.getState().loadConversations()
            await useChatStore.getState().selectConversation(loop.conversationId)
          }
        }
        return true
      }
      default: {
        // Track 2 / C4 — try the filesystem-discovered slash-command
        // resolver. Anything that resolves to a prompt is dispatched as a
        // normal user turn. Unknown commands fall through to a toast so
        // the user sees the typo.
        const rest = raw
          .trim()
          .slice(cmd?.length ?? 0)
          .trim()
        const slashResult = await useSlashCommandsStore
          .getState()
          .resolve(cmd?.slice(1) ?? '', rest)
        if (slashResult) {
          onSend(slashResult.prompt)
          return true
        }
        toast.error(`Unknown slash command: ${cmd}`)
        return true
      }
    }
  }

  // Fluidity J3: @file mention popover state. The popover is independent
  // of the slash palette and triggers when detectAtMention finds an
  // `@<token>` immediately preceding the caret (not inside a code fence).
  // workspaceFiles caches walkProject() output for the popover to rank
  // against — same shape QuickOpenPalette uses, kept local here so the
  // input bar doesn't depend on the docked file panel's lifecycle.
  const [workspaceFiles, setWorkspaceFiles] = useState<string[] | null>(null)
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [atMentionDismissed, setAtMentionDismissed] = useState(false)
  const [caretPos, setCaretPos] = useState<number>(0)

  // Track 2 / C4 — slash palette state. The palette appears whenever the
  // input begins with '/' AND has no newline (so a code block beginning
  // with '/' does not trip it). The user can dismiss with Esc; we close
  // the palette via `slashPaletteOpen=false` and re-open on the next '/'
  // typed at the start.
  const [slashPaletteOpen, setSlashPaletteOpen] = useState(true)
  const isSlashInput = content.startsWith('/') && !content.includes('\n')
  const showSlashPalette = isSlashInput && slashPaletteOpen && !isStreaming && !disabled
  // Strip the leading '/' and take everything up to the first whitespace.
  const slashQuery = isSlashInput ? content.slice(1).split(/\s/)[0] : ''

  useEffect(() => {
    // Re-open the palette whenever the user starts a fresh '/' token.
    if (isSlashInput && !slashPaletteOpen) setSlashPaletteOpen(true)
  }, [isSlashInput, slashPaletteOpen])

  const applySlashName = (name: string) => {
    setContent(`/${name} `)
    setSlashPaletteOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  // Fluidity J3 — derive the active @-mention token from (content, caret).
  // Recomputed on every render; cheap, and avoids missing a token when the
  // user clicks elsewhere in the textarea.
  const mention = detectAtMention(content, caretPos)
  const showAtMention = mention !== null && !atMentionDismissed && !isStreaming && !disabled

  useEffect(() => { setWorkspaceFiles(null); setWorkspaceRoot(null); setWorkspaceLoading(false) }, [owner, contextRevision])

  // Lazy-load the workspace file index the first time the popover opens.
  useEffect(() => {
    if (!showAtMention) return
    if (workspaceFiles !== null || workspaceLoading) return
    if (!window.api?.files) return
    let cancelled = false
    setWorkspaceLoading(true)
    void (async () => {
      try {
        const wd = await window.api.files.getWorkdir(owner)
        if (cancelled || !wd.success || !wd.data) {
          if (!cancelled) setWorkspaceLoading(false)
          return
        }
        const root = wd.data.path
        const w = await window.api.files.walkProject(root, owner)
        if (cancelled) return
        if (w.success) {
          const data = w.data as { files: string[] }
          setWorkspaceFiles(data.files)
          setWorkspaceRoot(root)
        }
      } finally {
        if (!cancelled) setWorkspaceLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showAtMention, workspaceFiles, workspaceLoading, owner])

  const applyAtMention = (relPath: string) => {
    if (!mention) return
    const sep = workspaceRoot && workspaceRoot.includes('\\') ? '\\' : '/'
    const fullPath = workspaceRoot ? `${workspaceRoot}${sep}${relPath}` : relPath
    const basename = relPath.split(/[\\/]/).pop() ?? relPath
    // Replace the @<token> run with a collapsed @<basename> in the textarea.
    const next = `${content.slice(0, mention.start)}@${basename} ${content.slice(mention.end)}`
    setContent(next)
    setAtMentionDismissed(false)
    // Process + attach the picked file via the existing pipeline so the
    // next send carries its content as a ProcessedFile attachment.
    if (window.api?.files?.process) {
      setProcessing(true)
      void window.api.files
        .process([fullPath], owner)
        .then((res) => {
          if (res.success) addAttachments(res.data as ProcessedFile[])
          else if (res.error) toast.error(`Attach failed: ${res.error}`)
        })
        .finally(() => setProcessing(false))
    }
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      const newCaret = mention.start + basename.length + 2 // "@" + name + " "
      ta.focus()
      ta.setSelectionRange(newCaret, newCaret)
      setCaretPos(newCaret)
    })
  }

  // Fluidity J4 — derive memory-write mode from the current content.
  // Pure detector lives in @/lib/memory-shortcut; this is just the wiring.
  const memoryShortcut = detectMemoryShortcut(content)

  const handleSubmit = (followUpMode = followUpBehavior) => {
    const trimmed = content.trim()
    const hasSubmittableInput = trimmed.length > 0 || (isStreaming && pendingAttachments.length > 0)
    if (!hasSubmittableInput || disabled) return
    if (isStreaming) {
      if (followUpBusyRef.current) return
      followUpBusyRef.current = true
      const owner = useChatStore.getState().activeConversationId
      const submittedContent = content
      const key = JSON.stringify([owner, activeTurn?.turnId, followUpMode, trimmed, pendingAttachments])
      setFollowUpError(null)
      setFollowUpSubmitting(true)
      if (followUpClientIdRef.current?.key !== key) followUpClientIdRef.current = { key, id: crypto.randomUUID() }
      void submitFollowUp(trimmed, followUpMode, followUpClientIdRef.current.id)
        .then((result) => {
          if (!result.success) {
            if (useChatStore.getState().activeConversationId === owner) setFollowUpError(result.error)
            toast.error(result.error)
            return
          }
          followUpClientIdRef.current = null
          if (useChatStore.getState().activeConversationId === owner) {
            setContent(current => current === submittedContent ? '' : current)
            historyRef.current = emptyHistoryState
          }
        })
        .catch(error => {
          const message = error instanceof Error ? error.message : String(error)
          if (useChatStore.getState().activeConversationId === owner) setFollowUpError(message)
          toast.error(message)
        })
        .finally(() => { followUpBusyRef.current = false; setFollowUpSubmitting(false) })
      return
    }
    if (activeProvider && !activeProviderHasKey) {
      setKeyPromptProvider(activeProvider)
      return
    }
    // Fluidity J4 — `#…` opens MemoryEditor with the description prefilled
    // instead of dispatching as a normal chat turn. The editor is the
    // confirm-before-save step required by the feedback_no_fake_polish
    // invariant: we never write memory silently.
    if (memoryShortcut) {
      seedMemoryDescription(memoryShortcut.description)
      setContent('')
      historyRef.current = emptyHistoryState
      return
    }
    if (trimmed.startsWith('/')) {
      void handleSlashCommand(trimmed).then((handled) => {
        if (handled) {
          setContent('')
          setSlashPaletteOpen(true)
          historyRef.current = emptyHistoryState
        }
      })
      return
    }
    const planMode = useUiStore.getState().planMode
    const final = planMode
      ? `[PLAN MODE — produce a plan first, list assumptions and steps, then await my confirmation before executing.]\n\n${trimmed}`
      : trimmed
    onSend(final)
    setContent('')
    historyRef.current = emptyHistoryState
  }

  // Fluidity J2: Shift+Tab walks default → auto-review → full → plan → default.
  // permissionsMode + the legacy planMode flag both update unconditionally so
  // the existing PermissionsDropdown + plan banner stay in sync; if an active
  // conversation exists, plan transitions also drive the real IPC gate via
  // usePlanMode so persistence (conversations.plan_mode_active) is honored.
  const permissionsMode = useUiStore((s) => s.permissionsMode)
  const planModeLocal = useUiStore((s) => s.planMode)
  const planModeActive = usePlanStore((s) => s.planModeActive ?? false)
  const setPermissionsMode = useUiStore((s) => s.setPermissionsMode)
  const setPlanModeFlag = useUiStore((s) => s.setPlanMode)
  const planControl = usePlanMode()

  const cycleMode = () => {
    const next = nextMode({
      permissions: permissionsMode,
      plan: planModeLocal || planModeActive
    })
    setPermissionsMode(next.permissions)
    setPlanModeFlag(next.plan)
    if (next.plan && !(planModeLocal || planModeActive)) {
      void planControl.enter()
    } else if (!next.plan && (planModeLocal || planModeActive)) {
      void planControl.exit()
    }
    toast.info(`Mode: ${slotLabel(currentSlot(next))}`)
  }

  const moveCaretToEnd = () => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      const len = ta.value.length
      ta.setSelectionRange(len, len)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (pasteOffer) return
    // IME composition (e.g. typing kana / pinyin) sends interim keystrokes;
    // never intercept while a candidate is being assembled.
    if (e.nativeEvent.isComposing) return

    // Fluidity J1 — ↑ / ↓ walks prompt history when the caret is on line 1
    // and nothing is selected. Otherwise it falls through to native arrow
    // navigation so the user can still move inside a multi-line draft.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const ta = e.currentTarget
      const selStart = ta.selectionStart ?? 0
      const selEnd = ta.selectionEnd ?? 0
      const onFirstLine = ta.value.slice(0, selStart).indexOf('\n') === -1
      const hasSelection = selStart !== selEnd
      const browsing = historyRef.current.index !== null
      // While browsing, both arrows are owned by the walker regardless of
      // caret position — the textarea holds a recalled prompt and the user
      // is paging through history, not editing.
      if (browsing || (onFirstLine && !hasSelection)) {
        const history = useChatStore.getState().getRecentUserPrompts()
        if (e.key === 'ArrowUp') {
          if (history.length === 0) return
          e.preventDefault()
          const step = historyUp(history, historyRef.current, content)
          historyRef.current = step.state
          setContent(step.text)
          moveCaretToEnd()
          return
        }
        if (e.key === 'ArrowDown' && browsing) {
          e.preventDefault()
          const step = historyDown(history, historyRef.current)
          historyRef.current = step.state
          setContent(step.text)
          moveCaretToEnd()
          return
        }
      }
    }

    // Esc while browsing restores the saved draft. Streaming-cancel and
    // search-clear are handled globally in useKeyboardShortcuts — we only
    // claim Esc here when we have local history state to unwind.
    if (e.key === 'Escape' && historyRef.current.index !== null) {
      e.preventDefault()
      e.stopPropagation()
      const step = historyReset(historyRef.current)
      historyRef.current = step.state
      setContent(step.text)
      moveCaretToEnd()
      return
    }

    if (e.key === 'Tab' && e.shiftKey) {
      // Only claim Shift+Tab when the textarea has no content — mid-draft
      // we leave it for native focus navigation per the J2 spec.
      if (content.length > 0) return
      e.preventDefault()
      cycleMode()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handlePickerClick = async () => {
    if (!window.api) return
    setProcessing(true)
    try {
      const result = await window.api.files.openPicker()
      if (result.success) addAttachments(result.data as ProcessedFile[])
      else if (result.error) toast.error(`File picker failed: ${result.error}`)
    } catch (error) {
      toast.error(`File picker failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setProcessing(false)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (!blob) continue
          e.preventDefault()
          try {
            const dataUrl = await blobToDataURL(blob)
            const ext = (blob.type.split('/')[1] ?? 'png').replace('+xml', '')
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            const attachment: ProcessedFile = {
              name: `pasted-${stamp}.${ext}`,
              kind: 'image',
              mimeType: blob.type,
              size: blob.size,
              content: dataUrl,
              previewText: `Pasted image (${Math.round(blob.size / 1024)} KB)`
            }
            addAttachments([attachment])
          } catch (err) {
            toast.error(`Could not paste image: ${(err as Error).message}`)
          }
          return
        }
      }
    }

    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (looksLikeCode(text)) {
      e.preventDefault()
      setPasteOffer(text)
    }
  }

  const handlePasteOfferAccept = () => {
    if (!pasteOffer) return
    const ext = /<\/?[a-zA-Z][^>]*>/.test(pasteOffer) ? 'html' : 'txt'
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const attachment: ProcessedFile = {
      name: `pasted-${stamp}.${ext}`,
      kind: 'text',
      mimeType: 'text/plain',
      size: new Blob([pasteOffer]).size,
      content: pasteOffer,
      previewText: `${pasteOffer.split(/\r?\n/).length} lines · pasted`
    }
    addAttachments([attachment])
    setPasteOffer(null)
  }

  const handlePasteOfferInline = () => {
    if (!pasteOffer) return
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart ?? content.length
      const end = textarea.selectionEnd ?? content.length
      setContent(content.slice(0, start) + pasteOffer + content.slice(end))
    } else {
      setContent(content + pasteOffer)
    }
    setPasteOffer(null)
  }

  const canSend =
    (content.trim().length > 0 || (isStreaming && pendingAttachments.length > 0)) && !disabled
  const planMode = useUiStore((s) => s.planMode)
  const followUpLabel = followUpBehavior === 'steer' ? 'Steer' : 'Queue'

  return (
    <div className="w-full">
      {planMode && (
        <div className="mb-2 flex items-center justify-between rounded-md border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-1.5 text-[12px] text-[var(--accent)]">
          <span className="font-mono">PLAN MODE · Shift+Tab to toggle</span>
          <button
            onClick={() => useUiStore.getState().setPlanMode(false)}
            className="rounded px-1 text-[10px] uppercase tracking-wider hover:bg-[var(--bg-tertiary)]"
            title="Turn plan mode off"
          >
            off
          </button>
        </div>
      )}
      {pasteOffer && (
        <div className="mb-2 flex w-full flex-wrap items-center gap-2 rounded-2xl border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-xs text-[var(--text-primary)]">
          <span className="flex-1">
            That looks like code ({pasteOffer.length.toLocaleString()} chars). Attach it as a file
            or paste inline?
          </span>
          <button
            onClick={handlePasteOfferAccept}
            className="rounded bg-[var(--accent)] px-2 py-1 text-[13px] font-medium text-white hover:opacity-90"
          >
            Paste as attachment
          </button>
          <button
            onClick={handlePasteOfferInline}
            className="rounded border border-[var(--panel-border)] px-2 py-1 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          >
            Paste inline
          </button>
          <button
            onClick={() => setPasteOffer(null)}
            className="rounded px-1.5 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {followUpError && (
        <div
          role="alert"
          className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-[var(--error)] bg-[color-mix(in_srgb,var(--error)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--error)]"
        >
          <span>{followUpError} Your draft is still editable.</span>
          <button
            type="button"
            onClick={() => setFollowUpError(null)}
            aria-label="Dismiss follow-up error"
            className="rounded px-1 hover:bg-[var(--bg-tertiary)]"
          >
            ×
          </button>
        </div>
      )}

      <div className="relative flex w-full flex-col gap-2 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-bg)] px-3 py-2">
        {/* Track 2 / C4 — slash-command palette. Anchored to this
            container's top edge via `bottom-full`, so it floats above
            the input box without affecting layout. */}
        {showSlashPalette && (
          <SlashCommandPalette
            query={slashQuery}
            onApply={applySlashName}
            onClose={() => setSlashPaletteOpen(false)}
          />
        )}
        {/* Fluidity J3 — @file mention popover. Mounted only when the
            caret sits inside an @<token> run that's NOT inside a code
            fence. Slash palette and this one are mutually exclusive in
            practice because a single character can't be both `/` AND
            `@`-prefixed. */}
        {showAtMention && mention && (
          <AtFileMention
            query={mention.token}
            files={workspaceFiles ?? []}
            loading={workspaceLoading}
            onApply={applyAtMention}
            onClose={() => setAtMentionDismissed(true)}
          />
        )}
        <div className="flex items-start gap-2">
          <textarea
            ref={textareaRef}
            data-chat-input
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              if (followUpError) setFollowUpError(null)
              setCaretPos(e.target.selectionStart ?? e.target.value.length)
              // Any keystroke that mutates text is "I'm done browsing":
              // drop the history index so the next ↑ starts fresh.
              if (historyRef.current.index !== null) {
                historyRef.current = emptyHistoryState
              }
              // Typing extends/changes the @-token — re-arm the popover
              // even if the user just dismissed it with Esc.
              if (atMentionDismissed) setAtMentionDismissed(false)
            }}
            onClick={(e) => setCaretPos(e.currentTarget.selectionStart ?? 0)}
            onSelect={(e) => setCaretPos(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isStreaming
                ? 'Write a follow-up, then choose Steer or Queue'
                : 'What would you like to work on?'
            }
            rows={1}
            disabled={disabled}
            aria-label="Message Lamprey"
            className="max-h-[200px] min-h-[48px] w-full flex-1 resize-none px-1 py-2 bg-transparent text-sm leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />


        </div>

        <div className="flex flex-wrap items-center gap-1">
          <AddMenu
            onPickFile={handlePickerClick}
            onInsertSlash={() => {
              setContent((c) => (c.startsWith('/') ? c : `/${c}`))
              textareaRef.current?.focus()
            }}
          />

          <ModelDropdown onRequestKey={(providerId) => setKeyPromptProvider(providerId)} />
          <WorkingModeMenu />
          <PermissionsDropdown />
          <div className="flex-1" />

          {isStreaming ? (
            <div className="flex shrink-0 items-center gap-2 self-end">
              <button
                type="button"
                data-follow-up-action={followUpBehavior}
                onClick={() => handleSubmit(followUpBehavior)}
                disabled={!canSend || followUpSubmitting}
                title={`${followUpLabel} this turn`}
                aria-label={`${followUpLabel} this turn`}
                className="flex h-9 min-w-[72px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-3 text-sm font-medium text-[var(--bg-primary)] transition-[background-color,opacity,transform] hover:scale-[1.03] hover:opacity-90 disabled:opacity-40 disabled:hover:scale-100"
              >
                {followUpLabel}
              </button>
              <button
                ref={followUpAnchor}
                type="button"
                aria-label="Choose Steer or Queue"
                aria-haspopup="menu"
                aria-expanded={followUpMenuOpen}
                onClick={() => setFollowUpMenuOpen(!followUpMenuOpen)}
                className="flex h-9 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
              ><ChevronDown /></button>
              <PopoverMenu open={followUpMenuOpen} onClose={() => setFollowUpMenuOpen(false)} anchorRef={followUpAnchor} align="top-end" ariaLabel="Follow-up action">
                {(['steer', 'queue'] as const).map(mode => <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={followUpBehavior === mode}
                  data-follow-up-choice={mode}
                  onClick={() => { void updateSettings({ followUpBehavior: mode }); setFollowUpMenuOpen(false); followUpAnchor.current?.focus() }}
                  className="flex min-h-9 w-full flex-col items-start rounded px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                >
                  <span>{mode === 'steer' ? 'Steer' : 'Queue'}</span>
                  <span className="text-[var(--text-muted)]">{mode === 'steer' ? 'Guide the current turn' : 'Run after the current turn'}</span>
                </button>)}
              </PopoverMenu>
              <button
                type="button"
                onClick={onCancel}
                title={activeTurn ? `Stop turn ${activeTurn.turnId}` : 'Stop current turn'}
                aria-label="Stop current turn"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-[background-color,color,transform] hover:scale-[1.03] hover:bg-[var(--error)] hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </div>
          ) : memoryShortcut ? (
            // Fluidity J4 — in memory-write mode the Send pill becomes a
            // "Remember" pill that opens the editor instead of dispatching.
            <button
              onClick={() => handleSubmit()}
              disabled={!canSend}
              title="Open memory editor (Enter)"
              aria-label="Remember"
              data-mode="memory"
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-[var(--bg-primary)] transition-all hover:scale-105 hover:opacity-90 disabled:opacity-50 disabled:hover:scale-100"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Remember
            </button>
          ) : (
            <button
              onClick={() => handleSubmit()}
              disabled={!canSend}
              title="Send (Enter)"
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)] transition-all hover:scale-105 hover:bg-[var(--accent)] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-[var(--bg-tertiary)]"
            >
              <img
                src={sendIcon}
                alt=""
                aria-hidden
                className="icon-asset-crisp h-6 w-6 object-contain"
              />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2"><TaskContext /><ToolActivityChip /></div>
      </div>

      {keyPromptProvider && (
        <ApiKeyModal
          defaultProvider={keyPromptProvider}
          required={false}
          onDismiss={() => setKeyPromptProvider(null)}
          onComplete={async () => {
            await refreshProviders()
            setKeyPromptProvider(null)
            toast.success('Key saved — model unlocked')
          }}
        />
      )}
    </div>
  )
}
