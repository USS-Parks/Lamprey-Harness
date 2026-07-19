import type { McpResourceContent } from './types'

const SAFE_RASTER_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif'
])

export type McpPreviewItem =
  | { kind: 'text'; uri: string; mimeType: string; text: string }
  | { kind: 'image'; uri: string; mimeType: string; dataUrl: string }
  | { kind: 'metadata'; uri: string; mimeType: string; byteEstimate?: number }

export function classifyMcpResourceContent(content: McpResourceContent): McpPreviewItem {
  const mimeType = content.mimeType?.trim().toLowerCase() || 'application/octet-stream'
  if ('text' in content) {
    return { kind: 'text', uri: content.uri, mimeType, text: content.text }
  }
  if (SAFE_RASTER_MIME_TYPES.has(mimeType)) {
    return {
      kind: 'image',
      uri: content.uri,
      mimeType,
      dataUrl: `data:${mimeType};base64,${content.blob}`
    }
  }
  return {
    kind: 'metadata',
    uri: content.uri,
    mimeType,
    byteEstimate: Math.floor((content.blob.length * 3) / 4)
  }
}

export function canOpenMcpResourceExternally(uri: string): boolean {
  try {
    const url = new URL(uri)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}
