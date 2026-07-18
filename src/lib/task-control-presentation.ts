export interface TaskGraphNodeView {
  id: string
  kind: 'conversation' | 'agent-run' | 'identity' | 'turn'
  title: string
  status: string
  ownerConversationId: string | null
  parentId: string | null
  updatedAt: number
  metadata: Record<string, string | number | boolean | null>
}

export interface TaskRow {
  node: TaskGraphNodeView
  depth: number
}

export function buildConversationTaskRows(nodes: TaskGraphNodeView[]): TaskRow[] {
  const conversations = nodes.filter((node) => node.kind === 'conversation')
  const byId = new Map(conversations.map((node) => [node.id, node]))
  const depthFor = (node: TaskGraphNodeView): number => {
    const seen = new Set([node.id])
    let depth = 0
    let parentId = node.parentId
    while (parentId && byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId)
      depth += 1
      parentId = byId.get(parentId)?.parentId ?? null
    }
    return depth
  }
  return conversations
    .map((node) => ({ node, depth: depthFor(node) }))
    .sort((a, b) => a.depth - b.depth || b.node.updatedAt - a.node.updatedAt)
}
