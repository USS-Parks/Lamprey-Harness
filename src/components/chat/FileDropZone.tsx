import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { toast } from '@/stores/toast-store'
import type { ProcessedFile } from '@/lib/types'

export function FileDropZone() {
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)
  const addAttachments = useChatStore((s) => s.addAttachments)
  const setProcessing = useChatStore((s) => s.setAttachmentsProcessing)

  useEffect(() => {
    if (!window.api) return

    const hasFiles = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types
      if (!types) return false
      for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true
      return false
    }

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setIsDragging(true)
    }

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setIsDragging(false)
    }

    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setIsDragging(false)

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const owner = useChatStore.getState().activeConversationId
      setProcessing(true, owner)
      try {
        const paths: string[] = []
        for (let i = 0; i < files.length; i++) {
          const path = window.api.files.getPathForFile(files[i])
          if (path) paths.push(path)
        }
        if (paths.length !== files.length) {
          toast.error('Could not read the dropped file paths. Use Add file to select these files.', 8000)
          return
        }
        const result = await window.api.files.process(paths, owner)
        if (result.success) {
          addAttachments(result.data as ProcessedFile[], owner)
        } else {
          toast.error(`${result.error} Use Add file to select files outside this project.`, 8000)
        }
      } catch (error) {
        toast.error(`Could not attach dropped files: ${error instanceof Error ? error.message : String(error)}. Use Add file to select them.`, 8000)
      } finally {
        setProcessing(false, owner)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addAttachments, setProcessing])

  if (!isDragging) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
      <div className="rounded-lg border-2 border-dashed border-[var(--accent)] bg-[var(--bg-secondary)] px-10 py-8 text-center">
        <div className="font-mono text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
          Drop files to attach
        </div>
        <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
          .txt .md .py .js .ts .html .css .json .csv .pdf · images
        </p>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">10 MB per file · 25 MB total</p>
      </div>
    </div>
  )
}
