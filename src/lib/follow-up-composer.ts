import type { ProcessedFile } from './types'
import type { TurnInputItem } from './turn-control-types'

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function attachmentBlock(file: ProcessedFile): string {
  if (file.kind === 'text') {
    const lang = extension(file.name)
    return `\n\n[Attachment ${file.name}]\n\`\`\`${lang}\n${file.content}\n\`\`\``
  }
  if (file.kind === 'pdf') {
    return `\n\n[PDF ${file.name}]\n${file.content || '(no extractable text)'}`
  }
  if (file.kind === 'binary') {
    return `\n\n[Attachment ${file.name}: ${file.previewText || 'binary file, content not included.'}]`
  }
  if (file.kind === 'rag-pending') {
    const phase = file.ragPhase ?? 'queued'
    if (phase === 'ready') {
      return `\n\n[Indexed corpus: ${file.name} — ${file.ragChunkCount ?? '?'} chunks available via retrieval]`
    }
    return `\n\n[Indexing ${file.name} — chunks not yet available for this turn]`
  }
  return ''
}

export function buildCanonicalFollowUpInput(
  content: string,
  attachments: readonly ProcessedFile[]
): TurnInputItem[] {
  const input: TurnInputItem[] = []
  const trimmed = content.trim()
  if (trimmed) input.push({ type: 'text', text: trimmed })
  for (const file of attachments) {
    if (file.error) throw new Error(`${file.name}: ${file.error}`)
    if (file.kind === 'image') {
      if (!file.content) throw new Error(`${file.name}: image content is unavailable`)
      input.push(
        file.sourcePath
          ? {
              type: 'localImage',
              path: file.sourcePath,
              mimeType: file.mimeType,
              name: file.name,
              sizeBytes: file.size
            }
          : {
              type: 'image',
              imageUrl: file.content,
              mimeType: file.mimeType,
              name: file.name,
              sizeBytes: file.size
            }
      )
      continue
    }
    const text = attachmentBlock(file).trim()
    if (text) input.push({ type: 'text', text })
  }
  return input
}
