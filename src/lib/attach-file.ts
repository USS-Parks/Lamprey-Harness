import { useChatStore } from '@/stores/chat-store'
import { toast } from '@/stores/toast-store'
import type { ProcessedFile } from '@/lib/types'

/**
 * Open the native file picker, process the selected files, and add them to
 * the pending attachments for the next prompt. Shared by:
 *   - the "+" / Add menu inside the input pill
 *   - the Add file pill on the right panel home
 *   - the Add file context chip above the input
 *   - the Ctrl+U keyboard shortcut
 *
 * Centralised here so all four entry points stay in sync.
 */
export async function pickAndAttachFiles(): Promise<void> {
  const api = window.api
  if (!api?.files?.openPicker) {
    toast.error('File picker unavailable')
    return
  }
  const setProcessing = useChatStore.getState().setAttachmentsProcessing
  const addAttachments = useChatStore.getState().addAttachments
  setProcessing(true)
  try {
    const result = await api.files.openPicker()
    if (result.success) {
      const files = result.data as ProcessedFile[]
      if (files.length > 0) {
        addAttachments(files)
      }
    } else if (result.error) {
      toast.error(`File picker failed: ${result.error}`)
    }
  } catch (err) {
    toast.error(`File picker failed: ${(err as Error).message}`)
  } finally {
    setProcessing(false)
  }
}
