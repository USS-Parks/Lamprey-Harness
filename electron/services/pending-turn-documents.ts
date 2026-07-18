import type { StoredDocument } from './conversation-store'

// Documents emitted during one in-flight turn. Correlation identity keeps
// recursive model rounds isolated while interrupt can clear the same buffer.
const pendingDocuments = new Map<string, StoredDocument[]>()

export function pushPendingDocument(
  correlationId: string | undefined,
  document: StoredDocument
): void {
  if (!correlationId) return
  const list = pendingDocuments.get(correlationId)
  if (list) list.push(document)
  else pendingDocuments.set(correlationId, [document])
}

export function drainPendingDocuments(
  correlationId: string | undefined
): StoredDocument[] | undefined {
  if (!correlationId) return undefined
  const list = pendingDocuments.get(correlationId)
  if (!list || list.length === 0) {
    pendingDocuments.delete(correlationId)
    return undefined
  }
  pendingDocuments.delete(correlationId)
  return list
}
