import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useUiStore } from '@/stores/ui-store'
import { pickAndAttachFiles } from '@/lib/attach-file'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const mod = e.ctrlKey || e.metaKey

      // Ctrl/Cmd+N — new conversation
      if (mod && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        useChatStore.getState().createConversation()
        return
      }

      // Ctrl/Cmd+K - workflow command palette
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        useUiStore.getState().toggleWorkflowPalette()
        return
      }

      // Ctrl/Cmd+B — toggle sidebar
      if (mod && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        useUiStore.getState().toggleSidebar()
        return
      }

      // Ctrl/Cmd+U — open file picker and attach
      if (mod && !e.shiftKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault()
        void pickAndAttachFiles()
        return
      }

      // Ctrl/Cmd+Shift+M — open Memory browser
      if (mod && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        useUiStore.getState().toggleMemory()
        return
      }

      // Ctrl/Cmd+P — open quick-open palette
      if (mod && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        useUiStore.getState().toggleQuickOpen()
        return
      }

      // Ctrl/Cmd+T — toggle Browser tool
      if (mod && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        useUiStore.getState().toggleTool('browser')
        return
      }

      // Ctrl/Cmd+Shift+G — toggle Review tool
      if (mod && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        useUiStore.getState().toggleTool('review')
        return
      }

      // Ctrl/Cmd+` — toggle Terminal tool
      if (mod && e.key === '`') {
        e.preventDefault()
        useUiStore.getState().toggleTool('terminal')
        return
      }

      // Ctrl/Cmd+Shift+E — toggle Environment mode in the docked panel
      if (mod && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        useUiStore.getState().toggleTool('environment')
        return
      }

      // Ctrl/Cmd+Shift+S — toggle Sources mode in the docked panel
      if (mod && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        useUiStore.getState().toggleTool('sources')
        return
      }

      // Ctrl/Cmd+, — open settings
      if (mod && e.key === ',') {
        e.preventDefault()
        useUiStore.getState().toggleSettings()
        return
      }

      // Dialogs own Escape before the conversation's cancel shortcut.
      if (e.key === 'Escape') {
        const chat = useChatStore.getState()
        const ui = useUiStore.getState()
        if (ui.settingsOpen || ui.quickOpenVisible || ui.workflowPaletteVisible || ui.memoryOpen ||
          Array.from(document.querySelectorAll('[aria-modal="true"]')).some((element) => element.getClientRects().length > 0)) return
        if (ui.worktreeModalOpen) {
          e.preventDefault()
          ui.closeWorktreeModal()
          return
        }
        if (chat.isStreaming) {
          e.preventDefault()
          chat.cancelStream()
          return
        }
        // Don't intercept Esc inside text inputs — Sidebar's search has its own handler
        if (isEditableTarget(e.target)) return
        if (ui.searchQuery) {
          e.preventDefault()
          ui.setSearchQuery('')
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
