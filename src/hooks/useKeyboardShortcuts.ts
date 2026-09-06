import { canHandleAppShortcut } from '@/lib/shortcut-context'
import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useUiStore } from '@/stores/ui-store'
import { executeCommand, shortcutCommand } from '@/lib/app-commands'

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
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.repeat) return
      const command = shortcutCommand(e)
      if (command) {
        const target = e.target instanceof HTMLElement ? e.target : null
        if (!canHandleAppShortcut({
          composing: e.isComposing, repeat: e.repeat,
          dialog: Array.from(document.querySelectorAll('[aria-modal="true"]')).some(element => element.getClientRects().length > 0) || !!target?.closest('[role="dialog"], [role="menu"]'),
          localSurface: !!target?.closest('[data-terminal-id], .monaco-editor, .cm-editor, [data-keyboard-scope="local"]'),
          editable: isEditableTarget(e.target), composer: target?.getAttribute('aria-label') === 'Message Lamprey'
        })) return
        e.preventDefault()
        void executeCommand(command, 'shortcut')
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
        if ((e.target as HTMLElement | null)?.closest?.('[data-terminal-id], .monaco-editor, .cm-editor, [data-keyboard-scope="local"]')) return
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
